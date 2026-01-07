import { ref, type Ref } from 'vue';

export type TaskSession = {
  active: boolean;
  goal: string;
  autoContinueCount: number;
  lastContinueAt: number;
};

const TASK_SESSION_STORAGE_KEY = 'agent_task_session';

export function useTaskContinue(input: {
  router: any;
  currentLang: Ref<string>;
  messages: Ref<any[]>;
  buildAgentContext: (args: { trigger: string; userText?: string; systemEvent?: string }) => any;
  sendMessageToAI: (
    message: string,
    history: any[],
    agentContext: any,
    options: { signal: AbortSignal; group: string }
  ) => Promise<string>;
  applyAiReply: (rawResponse: string, options: any) => Promise<void>;
  isLoading: Ref<boolean>;
  isExecuting: Ref<boolean>;
  isBackgroundReacting: Ref<boolean>;
}) {
  const taskSession = ref<TaskSession | null>(null);
  const isTaskContinuing = ref(false);
  let abortController: AbortController | null = null;

  const saveTaskSession = () => {
    try {
      if (taskSession.value)
        localStorage.setItem(TASK_SESSION_STORAGE_KEY, JSON.stringify(taskSession.value));
      else localStorage.removeItem(TASK_SESSION_STORAGE_KEY);
    } catch {}
  };

  const loadTaskSession = () => {
    try {
      const raw = localStorage.getItem(TASK_SESSION_STORAGE_KEY);
      if (!raw || !raw.trim()) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const goal = typeof parsed.goal === 'string' ? parsed.goal : '';
        taskSession.value = {
          active: !!parsed.active,
          goal,
          autoContinueCount:
            typeof parsed.autoContinueCount === 'number' ? parsed.autoContinueCount : 0,
          lastContinueAt: typeof parsed.lastContinueAt === 'number' ? parsed.lastContinueAt : 0
        };
      }
    } catch {}
  };

  const requestNextTaskChunk = async (
    reason: 'completed' | 'failed' | 'manual',
    failure?: { message?: string; step?: any }
  ) => {
    if (isTaskContinuing.value) return;
    if (input.isLoading.value || input.isBackgroundReacting.value) return;
    if (input.isExecuting.value) return;
    const session = taskSession.value;
    if (!session?.active) return;

    const now = Date.now();
    if (now - (session.lastContinueAt || 0) < 2500) return;
    if (session.autoContinueCount >= 6 && reason !== 'manual') return;

    session.lastContinueAt = now;
    session.autoContinueCount = Math.max(0, session.autoContinueCount) + 1;
    saveTaskSession();

    if (abortController) {
      try {
        abortController.abort();
      } catch {}
    }
    abortController = new AbortController();
    isTaskContinuing.value = true;

    try {
      const goal = (session.goal || '').trim();
      const routePath = input.router?.currentRoute?.value?.fullPath || window.location.pathname;
      const failureMessage = String(failure?.message || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 260);
      const failureStep = failure?.step && typeof failure.step === 'object' ? failure.step : null;
      const failureStepType = String(failureStep?.type || '').trim();
      const failureStepTarget = String(failureStep?.target || '')
        .trim()
        .slice(0, 220);
      const failureStepDesc = String(failureStep?.description || '')
        .trim()
        .slice(0, 220);
      const failureContextZh =
        reason === 'failed' &&
        (failureMessage || failureStepType || failureStepTarget || failureStepDesc)
          ? `\n失败信息: ${failureMessage || '（无）'}\n失败步骤: ${failureStepDesc || failureStepType || '（未知）'}\n失败目标: ${failureStepTarget || '（无）'}`
          : '';
      const failureContextEn =
        reason === 'failed' &&
        (failureMessage || failureStepType || failureStepTarget || failureStepDesc)
          ? `\nFailure: ${failureMessage || '(none)'}\nFailed step: ${failureStepDesc || failureStepType || '(unknown)'}\nTarget: ${failureStepTarget || '(none)'}`
          : '';
      const prompt =
        input.currentLang.value === 'zh'
          ? `[TaskContinue]: 继续任务。\n原因: ${reason}${failureContextZh}\n目标: ${goal || '（未提供）'}\n当前路由: ${routePath}\n\n要求：\n1) 优先输出单一 JSON Envelope（不要代码块、不要夹杂任何其他文字）：{\"v\":\"1\",\"text\":\"...\",\"plan\":[...],\"avatarPlan\":[...]}。\n2) 如果需要继续操作页面：在 Envelope 里给出 plan（1–8 步），每步 {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}；若无法输出 Envelope，才用 \"plan:\" + JSON 数组。\n3) 不管是否继续操作，都必须给出 avatarPlan（1–4 步）；若无法输出 Envelope，才用 \"avatarPlan:\" + JSON 数组。\n4) 如果任务已完成：不要输出 plan，只输出一句很短的完成确认 + avatarPlan。`
          : `[TaskContinue]: Continue the task.\nReason: ${reason}${failureContextEn}\nGoal: ${goal || '(not provided)'}\nRoute: ${routePath}\n\nRules:\n1) Prefer a single JSON envelope (no code fences, no extra text): {\"v\":\"1\",\"text\":\"...\",\"plan\":[...],\"avatarPlan\":[...]}.\n2) If you need to keep operating the page: provide \"plan\" in the envelope (1–8 steps), each step has {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}. If you cannot output the envelope, then output \"plan:\" followed by a strict JSON array.\n3) Always provide avatarPlan (1–4 steps). If you cannot output the envelope, then output \"avatarPlan:\" followed by a strict JSON array.\n4) If the task is done: do NOT output plan; just a very short done confirmation + avatarPlan.`;
      const agentContext: any = input.buildAgentContext({
        trigger: 'task',
        systemEvent: prompt,
        userText: goal
      });
      agentContext.suppressMemorySave = true;
      let rawResponse = '';
      try {
        rawResponse = await input.sendMessageToAI(prompt, input.messages.value, agentContext, {
          signal: abortController.signal,
          group: 'task'
        });
      } catch {
        return;
      }
      if (!rawResponse) {
        session.active = false;
        saveTaskSession();
        return;
      }
      await input.applyAiReply(rawResponse, {
        displayInChat: false,
        speakText: true,
        suppressMemorySave: true,
        allowPlan: true
      });

      const hasPlan = (() => {
        const s = String(rawResponse || '').trim();
        if (/\bplan\s*:\s*\[/i.test(s)) return true;
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const obj: any = JSON.parse(s);
            const vRaw = obj?.v;
            const v =
              typeof vRaw === 'number' ? String(vRaw) : typeof vRaw === 'string' ? vRaw.trim() : '';
            if (v === '1' && Array.isArray(obj?.plan) && obj.plan.length > 0) return true;
          } catch {}
        }
        if (/"plan"\s*:\s*\[/.test(s)) return true;
        return false;
      })();
      if (!hasPlan && reason !== 'manual') {
        session.active = false;
        saveTaskSession();
      }
    } finally {
      isTaskContinuing.value = false;
    }
  };

  const stopAll = () => {
    try {
      abortController?.abort();
    } catch {}
    abortController = null;
    isTaskContinuing.value = false;
  };

  return {
    taskSession,
    isTaskContinuing,
    saveTaskSession,
    loadTaskSession,
    requestNextTaskChunk,
    stopAll
  };
}

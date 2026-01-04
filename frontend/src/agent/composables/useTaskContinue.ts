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

  const requestNextTaskChunk = async (reason: 'completed' | 'failed' | 'manual') => {
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
      const prompt =
        input.currentLang.value === 'zh'
          ? `[TaskContinue]: 继续任务。\n原因: ${reason}\n目标: ${goal || '（未提供）'}\n当前路由: ${routePath}\n\n要求：\n1) 如果需要继续操作页面：输出 plan: 后面跟严格 JSON 数组（1–8 步），每步包含 {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}。\n2) 不管是否继续操作，都必须输出 avatarPlan: 后面跟严格 JSON 数组（1–4 步），用于你的旁白/动作/表情。\n3) 如果任务已完成：不要输出 plan，只输出一句很短的完成确认 + avatarPlan。`
          : `[TaskContinue]: Continue the task.\nReason: ${reason}\nGoal: ${goal || '(not provided)'}\nRoute: ${routePath}\n\nRules:\n1) If you need to keep operating the page: output \"plan:\" followed by a strict JSON array (1–8 steps), each step has {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}.\n2) Always output \"avatarPlan:\" followed by a strict JSON array (1–4 steps) for narration/motion/expression.\n3) If the task is done: do NOT output plan; just a very short done confirmation + avatarPlan.`;
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

      const hasPlan = /\bplan\s*:\s*\[/i.test(rawResponse);
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

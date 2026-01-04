import type { Ref } from 'vue';
import type { PersonaTraits } from '../logic/persona';

export function useIdleAi(input: {
  currentLang: Ref<string>;
  personaTraits: Ref<PersonaTraits>;
  chatOpen: Ref<boolean>;
  isMoving: Ref<boolean>;
  message: Ref<string>;
  isDragging: Ref<boolean>;
  isFainted: Ref<boolean>;
  isLoading: Ref<boolean>;
  isExecuting: Ref<boolean>;
  isBackgroundReacting: Ref<boolean>;
  buildAgentContext: (payload: { trigger: string; userText?: string; systemEvent?: string }) => any;
  sendMessageToAI: (
    prompt: string,
    history: any[],
    agentContext: any,
    options?: { signal?: AbortSignal; group?: string }
  ) => Promise<string>;
  applyAiReply: (
    rawResponse: string,
    options: {
      displayInChat: boolean;
      speakText?: boolean;
      suppressMemorySave?: boolean;
      allowPlan?: boolean;
    }
  ) => Promise<void>;
}) {
  let lastIdleAiAt = 0;
  let idleAiAbortController: AbortController | null = null;

  const buildPersonaProfileForAi = (traits: PersonaTraits) => {
    const tagsZh: string[] = [];
    const tagsEn: string[] = [];
    if (traits.tsundere) {
      tagsZh.push('傲娇');
      tagsEn.push('tsundere');
    }
    if (traits.shy) {
      tagsZh.push('害羞');
      tagsEn.push('shy');
    }
    if (traits.gentle) {
      tagsZh.push('温柔');
      tagsEn.push('gentle');
    }
    if (traits.strict) {
      tagsZh.push('严谨');
      tagsEn.push('strict');
    }
    if (traits.lazy) {
      tagsZh.push('慵懒');
      tagsEn.push('lazy');
    }
    if (traits.cheerful) {
      tagsZh.push('元气');
      tagsEn.push('cheerful');
    }
    if (traits.cold) {
      tagsZh.push('高冷');
      tagsEn.push('cold');
    }
    if (traits.teasing) {
      tagsZh.push('爱逗人');
      tagsEn.push('teasing');
    }
    if (traits.elegant) {
      tagsZh.push('优雅');
      tagsEn.push('elegant');
    }
    if (traits.warrior) {
      tagsZh.push('战斗系');
      tagsEn.push('warrior');
    }
    if (traits.mystic) {
      tagsZh.push('神秘系');
      tagsEn.push('mystic');
    }

    return input.currentLang.value === 'zh'
      ? `性格标签：${tagsZh.join('、') || '（未识别）'}\n闲置原则：不主动打扰；只做轻微动作/短句；不要执行页面操作。`
      : `Traits: ${tagsEn.join(', ') || '(unknown)'}\nIdle principles: non-intrusive; subtle motions/short line only; never operate the page.`;
  };

  const buildIdleAiPolicy = (traits: PersonaTraits) => {
    const minIdleMs = traits.cold ? 90000 : traits.cheerful ? 55000 : 65000;
    const cooldownMs = traits.cold ? 180000 : traits.cheerful ? 90000 : 120000;
    const chance = Math.max(
      0.06,
      Math.min(
        0.35,
        0.22 + (traits.cheerful ? 0.08 : 0) - (traits.cold ? 0.1 : 0) - (traits.strict ? 0.03 : 0)
      )
    );
    return { minIdleMs, cooldownMs, chance };
  };

  const stopIdleAi = () => {
    if (!idleAiAbortController) return;
    try {
      idleAiAbortController.abort();
    } catch {}
    idleAiAbortController = null;
  };

  const maybeTriggerIdleAi = async (idleForMs: number) => {
    if (
      input.chatOpen.value ||
      input.isMoving.value ||
      input.message.value ||
      input.isDragging.value ||
      input.isFainted.value
    )
      return;
    if (input.isLoading.value || input.isExecuting.value || input.isBackgroundReacting.value)
      return;
    const policy = buildIdleAiPolicy(input.personaTraits.value);
    if (idleForMs < policy.minIdleMs) return;
    const now = Date.now();
    if (now - lastIdleAiAt < policy.cooldownMs) return;
    if (Math.random() > policy.chance) return;

    lastIdleAiAt = now;
    stopIdleAi();
    idleAiAbortController = new AbortController();

    try {
      const seconds = Math.max(0, Math.round(idleForMs / 1000));
      const idlePrompt =
        input.currentLang.value === 'zh'
          ? `[Idle]: 用户已经 ${seconds} 秒没有操作。请用人设口吻进行一次「闲置行为」。要求：\n1) 必须输出 avatarPlan（严格 JSON 数组，1–4 步），动作以 idle / mood / 轻微表情为主。\n2) 可选 bubble 或 speak 一句很短的话。\n3) 禁止输出 plan / click / input / navigate / scroll 等任何页面操作。\n保持自然、简短。`
          : `[Idle]: The user has been inactive for ${seconds} seconds. Do one in-character idle beat.\nRules:\n1) You MUST output avatarPlan (strict JSON array, 1–4 steps), prefer idle/mood + subtle expression.\n2) Optionally include one very short bubble or speak line.\n3) Do NOT output plan/click/input/navigate/scroll or any page actions.\nKeep it short and natural.`;
      const agentContext: any = input.buildAgentContext({
        trigger: 'idle',
        systemEvent: idlePrompt
      });
      agentContext.mode = 'react';
      agentContext.suppressMemorySave = true;
      agentContext.persona = agentContext.persona || {};
      agentContext.persona.profile = buildPersonaProfileForAi(input.personaTraits.value);
      const rawResponse = await input.sendMessageToAI(idlePrompt, [], agentContext, {
        signal: idleAiAbortController.signal,
        group: 'idle'
      });
      if (!rawResponse) return;
      await input.applyAiReply(rawResponse, {
        displayInChat: false,
        speakText: false,
        suppressMemorySave: true,
        allowPlan: false
      });
    } finally {
      idleAiAbortController = null;
    }
  };

  return { maybeTriggerIdleAi, stopIdleAi };
}

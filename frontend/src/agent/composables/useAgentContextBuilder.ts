import type { Ref } from 'vue';
import { getUserId } from '../utils/user';
import type { LocalMemory, MemoryFact } from './useLocalMemory';

type AgentType = 'cubism3' | 'cubism2' | 'vrm';

export function useAgentContextBuilder(input: {
  agentType: Ref<AgentType>;
  currentVrmName: Ref<string>;
  currentLang: Ref<string>;
  currentUser: Ref<any>;
  localMemory: Ref<LocalMemory>;
  memorySummary: Ref<string>;
  memoryFacts: Ref<MemoryFact[]>;
  energy: Ref<number>;
  isMoving: Ref<boolean>;
  isHovered: Ref<boolean>;
  isDragging: Ref<boolean>;
  isTalking: Ref<boolean>;
  isAngry: Ref<boolean>;
  isHappy: Ref<boolean>;
  isPouting: Ref<boolean>;
  isDizzy: Ref<boolean>;
  isConfused: Ref<boolean>;
  isTired: Ref<boolean>;
  isFainted: Ref<boolean>;
  isCrying: Ref<boolean>;
  allowedMotions: readonly string[];
  allowedExpressions: readonly string[];
  getRuntimeModelInfo: () => any;
  getCharacterName: () => string;
  getPersonaRulesForAi: () => string;
  normalizeVrmModelKey: (input: string) => string;
}) {
  const safeStorageGet = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const sliceTailByChars = (text: string, maxChars: number) => {
    const s = String(text || '');
    if (!maxChars || maxChars <= 0) return '';
    if (s.length <= maxChars) return s;
    return s.slice(-maxChars);
  };

  const pickRecentByCharBudget = <T extends { text: string }>(items: T[], maxChars: number) => {
    const out: T[] = [];
    let remaining = Math.max(0, maxChars);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const t = String(it?.text || '').trim();
      if (!t) continue;
      const cost = Math.min(t.length, 800) + 20;
      if (out.length > 0 && remaining - cost < 0) break;
      remaining -= cost;
      out.push({ ...it, text: t.slice(0, 800) });
      if (out.length >= 18) break;
    }
    return out.reverse();
  };

  const buildAgentContext = (payload: {
    trigger: string;
    userText?: string;
    systemEvent?: string;
    interactionEvents?: Array<{ text: string; type: string; trigger: string; ts: number }>;
  }) => {
    const trigger = String(payload.trigger || '')
      .trim()
      .toLowerCase();
    const budgets =
      trigger === 'chat'
        ? { summary: 1600, chat: 1400, events: 700, facts: 700 }
        : trigger === 'task'
          ? { summary: 1000, chat: 900, events: 700, facts: 550 }
          : trigger === 'interaction'
            ? { summary: 900, chat: 700, events: 650, facts: 500 }
            : trigger === 'idle' || trigger === 'background' || trigger === 'reaction'
              ? { summary: 700, chat: 420, events: 520, facts: 420 }
              : { summary: 1100, chat: 900, events: 650, facts: 550 };

    const recent = input.localMemory.value.items.slice(-40);
    const recentChatRaw = recent
      .filter((x) => x.role === 'user' || x.role === 'agent')
      .slice(-18)
      .map((x) => ({ role: x.role, text: x.text, ts: x.ts }));
    const recentEventsRaw = recent
      .filter((x) => x.role === 'system')
      .slice(-18)
      .map((x) => ({ type: x.type || 'event', text: x.text, ts: x.ts }));

    const recentChat = pickRecentByCharBudget(recentChatRaw, budgets.chat);
    const recentEvents = pickRecentByCharBudget(recentEventsRaw, budgets.events);
    const facts = pickRecentByCharBudget(
      (input.memoryFacts.value || []).slice(-30).map((f) => ({ ts: f.ts, text: f.text })),
      budgets.facts
    );
    const modelInfo = input.getRuntimeModelInfo();
    const modelId = Number.parseInt(safeStorageGet('modelId') || '0', 10) || 0;
    const personaName =
      input.agentType.value === 'vrm'
        ? input.currentVrmName.value || input.getCharacterName()
        : input.getCharacterName();
    const personaId =
      input.agentType.value === 'vrm'
        ? input.normalizeVrmModelKey(input.currentVrmName.value)
        : typeof modelInfo?.modelName === 'string'
          ? modelInfo.modelName
          : `model_${modelId}`;

    return {
      trigger: payload.trigger,
      persona: {
        name: personaName,
        id: personaId,
        rules: input.getPersonaRulesForAi()
      },
      character: {
        name: personaName
      },
      user: {
        id: getUserId(),
        name: input.currentUser.value?.name || input.currentUser.value?.username || ''
      },
      runtime: {
        lang: input.currentLang.value,
        modelId,
        agentType: input.agentType.value,
        modelName: typeof modelInfo?.modelName === 'string' ? modelInfo.modelName : undefined,
        modelPath: typeof modelInfo?.modelPath === 'string' ? modelInfo.modelPath : undefined
      },
      state: {
        energy: input.energy.value,
        isMoving: input.isMoving.value,
        isHovered: input.isHovered.value,
        isDragging: input.isDragging.value,
        isTalking: input.isTalking.value,
        emotions: {
          angry: input.isAngry.value,
          happy: input.isHappy.value,
          pouting: input.isPouting.value,
          dizzy: input.isDizzy.value,
          confused: input.isConfused.value,
          tired: input.isTired.value,
          fainted: input.isFainted.value,
          crying: input.isCrying.value
        }
      },
      memory: {
        summary: sliceTailByChars(input.memorySummary.value, budgets.summary),
        facts,
        recentChat,
        recentEvents
      },
      input: {
        userText: payload.userText,
        systemEvent: payload.systemEvent,
        interactionEvents: payload.interactionEvents
      },
      constraints: {
        allowedMotions: input.allowedMotions,
        allowedExpressions: input.allowedExpressions
      }
    };
  };

  return { buildAgentContext };
}

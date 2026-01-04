import { ref, type Ref } from 'vue';

type PendingReactionEvent = {
  text: string;
  type: string;
  trigger: string;
  ts: number;
  payload?: any;
};

export function useBackgroundReactions(input: {
  buildAgentContext: (args: {
    trigger: string;
    userText?: string;
    systemEvent?: string;
    interactionEvents?: any;
  }) => any;
  requestAgentReaction: (args: {
    message: string;
    agentContext: any;
    signal?: AbortSignal;
    group?: string;
  }) => Promise<string>;
  applyAiReply: (rawResponse: string, options: any) => Promise<void>;
  recordSystemEvent: (text: string, type?: string) => void;
  localSystemSignalReact: (args: { trigger: string; type: string }) => void;
  isLoading: Ref<boolean>;
  isExecuting: Ref<boolean>;
}) {
  const isBackgroundReacting = ref(false);
  const cooldownMs = 4000;
  let lastReactionAt = 0;
  let pending: PendingReactionEvent[] = [];
  let timer: number | null = null;
  let lastSystemRecordAt = 0;
  let lastSystemRecordText = '';
  let abortController: AbortController | null = null;

  const flush = async () => {
    if (pending.length === 0) return;
    if (isBackgroundReacting.value) return;
    if (input.isLoading.value) return;
    if (input.isExecuting.value) return;

    const now = Date.now();
    const waitMs = cooldownMs - (now - lastReactionAt);
    if (waitMs > 0) {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void flush();
      }, waitMs);
      return;
    }

    const batch = pending.slice(0, 6);
    pending = pending.slice(batch.length);
    const last = batch[batch.length - 1];
    const summaryLines = batch.map((e) => `- (${e.type}) ${e.text}`);
    const summary = `[System Event Batch]\n${summaryLines.join('\n')}\n\nRespond naturally as the character.`;
    lastReactionAt = Date.now();
    isBackgroundReacting.value = true;

    if (abortController) abortController.abort();
    abortController = new AbortController();

    try {
      const agentContext: any = input.buildAgentContext({
        trigger: last?.trigger || 'system',
        systemEvent: summary,
        interactionEvents: batch
      });
      agentContext.mode = 'react';
      agentContext.suppressMemorySave = true;

      let rawResponse = '';
      try {
        rawResponse = await input.requestAgentReaction({
          message: summary,
          agentContext,
          signal: abortController.signal,
          group: 'background'
        });
      } catch {
        return;
      }
      if (!rawResponse) return;

      const shouldSpeak = (() => {
        const t = String(last?.trigger || '')
          .trim()
          .toLowerCase();
        return t === 'task' || t === 'dom' || t === 'nav' || t === 'error';
      })();
      await input.applyAiReply(rawResponse, {
        displayInChat: false,
        speakText: shouldSpeak,
        suppressMemorySave: true,
        allowPlan: false
      });
    } finally {
      isBackgroundReacting.value = false;
      abortController = null;
      if (pending.length > 0) void flush();
    }
  };

  const reactToSystemEvent = (evt: {
    text: string;
    type?: string;
    trigger?: string;
    payload?: any;
  }) => {
    const text = (evt.text || '').trim();
    if (!text) return;
    const type = (evt.type || 'event').trim() || 'event';
    const trigger = (evt.trigger || 'system').trim() || 'system';
    const payload = evt.payload;

    input.localSystemSignalReact({ trigger, type });

    const now = Date.now();
    const shouldRecord = text !== lastSystemRecordText || now - lastSystemRecordAt > 1500;
    if (shouldRecord) {
      input.recordSystemEvent(text, type);
      lastSystemRecordAt = now;
      lastSystemRecordText = text;
    }

    const lastQueued = pending[pending.length - 1];
    if (!lastQueued || lastQueued.text !== text || now - lastQueued.ts > 600) {
      pending.push({ text, type, trigger, ts: now, payload });
    }
    if (pending.length > 10) {
      pending = pending.slice(-10);
    }
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void flush();
    }, 250);
  };

  const stopAll = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    pending = [];
    try {
      abortController?.abort();
    } catch {}
    abortController = null;
    isBackgroundReacting.value = false;
  };

  return {
    isBackgroundReacting,
    reactToSystemEvent,
    flushBackgroundReaction: flush,
    stopAll
  };
}

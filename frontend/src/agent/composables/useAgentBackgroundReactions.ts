import { ref } from 'vue';

export const useAgentBackgroundReactions = (input: {
  buildAgentContext: (payload: {
    trigger: string;
    systemEvent?: string;
    userText?: string;
    interactionEvents?: any;
  }) => any;
  requestAgentReaction: (args: {
    message: string;
    agentContext: any;
    signal: AbortSignal;
    group: string;
  }) => Promise<string>;
  applyAiReply: (
    raw: string,
    opts: {
      displayInChat: boolean;
      speakText: boolean;
      suppressMemorySave?: boolean;
      allowPlan?: boolean;
    }
  ) => Promise<void>;
  recordSystemEvent: (text: string, type: string) => void;
  recordDiagnostic?: (payload: any) => void;
}) => {
  const isBackgroundReacting = ref(false);
  let lastReactionAt = 0;
  const backgroundReactCooldownMs = 4000;
  type PendingReactionEvent = {
    text: string;
    type: string;
    trigger: string;
    ts: number;
    payload?: any;
  };
  let pendingBackgroundReactions: PendingReactionEvent[] = [];
  let backgroundReactTimer: number | null = null;
  let lastSystemRecordAt = 0;
  let lastSystemRecordText = '';
  let backgroundAbortController: AbortController | null = null;

  const recordDiag = (payload: any) => {
    try {
      if (typeof input.recordDiagnostic === 'function') input.recordDiagnostic(payload);
    } catch {}
  };

  const isHighPriority = (evt: PendingReactionEvent) => {
    const t = String(evt?.trigger || '')
      .trim()
      .toLowerCase();
    if (t === 'error') return true;
    if (String(evt?.type || '').toLowerCase() === 'error') return true;
    const txt = String(evt?.text || '').toLowerCase();
    if (/(error|failed|exception|traceback|stack|报错|失败|异常|错误)/i.test(txt)) return true;
    return false;
  };

  const flushBackgroundReaction = async () => {
    if (pendingBackgroundReactions.length === 0) return;
    if (isBackgroundReacting.value) return;

    const now = Date.now();
    const lastEvt = pendingBackgroundReactions[pendingBackgroundReactions.length - 1];
    const cooldown = lastEvt && isHighPriority(lastEvt) ? 500 : backgroundReactCooldownMs;
    const waitMs = cooldown - (now - lastReactionAt);
    if (waitMs > 0) {
      if (backgroundReactTimer) window.clearTimeout(backgroundReactTimer);
      backgroundReactTimer = window.setTimeout(() => {
        backgroundReactTimer = null;
        void flushBackgroundReaction();
      }, waitMs);
      return;
    }

    const batch = pendingBackgroundReactions.slice(0, 6);
    pendingBackgroundReactions = pendingBackgroundReactions.slice(batch.length);
    const last = batch[batch.length - 1];
    const summaryLines = batch.map((e) => `- (${e.type}) ${e.text}`);
    const summary = `[System Event Batch]\n${summaryLines.join('\n')}\n\nRespond naturally as the character.`;
    lastReactionAt = Date.now();
    isBackgroundReacting.value = true;

    if (backgroundAbortController) {
      recordDiag({ kind: 'background_reaction_abort', level: 'info' });
      backgroundAbortController.abort();
    }
    backgroundAbortController = new AbortController();

    try {
      recordDiag({
        kind: 'background_reaction_flush_start',
        level: 'info',
        batchSize: batch.length,
        trigger: last?.trigger || 'system',
        lastType: last?.type || 'event'
      });
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
          signal: backgroundAbortController.signal,
          group: 'background'
        });
      } catch {
        recordDiag({ kind: 'background_reaction_request_failed', level: 'warn' });
        return;
      }
      if (!rawResponse) return;
      const shouldSpeak = (() => {
        const t = String(last?.trigger || '')
          .trim()
          .toLowerCase();
        return (
          t === 'task' ||
          t === 'dom' ||
          t === 'nav' ||
          t === 'error' ||
          String(last?.type || '').toLowerCase() === 'error'
        );
      })();
      await input.applyAiReply(rawResponse, {
        displayInChat: false,
        speakText: shouldSpeak,
        suppressMemorySave: true,
        allowPlan: false
      });
      recordDiag({
        kind: 'background_reaction_apply_ok',
        level: 'info',
        speak: shouldSpeak,
        rawLen: String(rawResponse || '').length
      });
    } finally {
      isBackgroundReacting.value = false;
      backgroundAbortController = null;
      if (pendingBackgroundReactions.length > 0) void flushBackgroundReaction();
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

    const now = Date.now();
    const shouldRecord = text !== lastSystemRecordText || now - lastSystemRecordAt > 1500;
    if (shouldRecord) {
      input.recordSystemEvent(text, type);
      lastSystemRecordAt = now;
      lastSystemRecordText = text;
    }

    const lastQueued = pendingBackgroundReactions[pendingBackgroundReactions.length - 1];
    if (!lastQueued || lastQueued.text !== text || now - lastQueued.ts > 600) {
      pendingBackgroundReactions.push({ text, type, trigger, ts: now, payload });
      recordDiag({
        kind: 'background_reaction_queued',
        level: 'info',
        queueSize: pendingBackgroundReactions.length,
        trigger,
        type
      });
    }
    if (pendingBackgroundReactions.length > 10) {
      pendingBackgroundReactions = pendingBackgroundReactions.slice(-10);
    }
    if (backgroundReactTimer) window.clearTimeout(backgroundReactTimer);
    backgroundReactTimer = window.setTimeout(() => {
      backgroundReactTimer = null;
      void flushBackgroundReaction();
    }, 250);
  };

  const dispose = () => {
    if (backgroundReactTimer) window.clearTimeout(backgroundReactTimer);
    backgroundReactTimer = null;
    try {
      backgroundAbortController?.abort();
    } catch {}
    backgroundAbortController = null;
    pendingBackgroundReactions = [];
  };

  const abortInFlight = () => {
    try {
      backgroundAbortController?.abort();
    } catch {}
    backgroundAbortController = null;
  };

  return { isBackgroundReacting, reactToSystemEvent, dispose, abortInFlight };
};

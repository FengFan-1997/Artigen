const fs = require('node:fs');

const { installLiveEvalSignalHandlers } = require('../../scripts/run-agent-live-eval');

const main = async () => {
  const journalPath = String(process.env.AGENT_LIVE_EVAL_SIGNAL_JOURNAL || '').trim();
  if (!journalPath) throw new Error('AGENT_LIVE_EVAL_SIGNAL_JOURNAL_REQUIRED');
  const journal = {
    version: 'agent-live-eval-slot-journal-v1',
    status: 'running',
    slots: {
      'signal-probe:v2': {
        scenarioId: 'signal-probe',
        cohort: 'v2',
        status: 'running'
      }
    }
  };
  const persist = () => fs.promises.writeFile(journalPath, `${JSON.stringify(journal)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await persist();
  const signalState = installLiveEvalSignalHandlers({
    journal,
    persist
  });
  const keepAlive = setInterval(() => {}, 60_000);
  process.send?.({ event: 'ready' });
  await signalState.interrupted;
  clearInterval(keepAlive);
  if (signalState.persistenceError) throw signalState.persistenceError;
  signalState.dispose();
  process.disconnect?.();
};

void main().catch((error) => {
  process.send?.({ event: 'failed', code: String(error?.message || 'AGENT_SIGNAL_PROBE_FAILED') });
  process.exitCode = 1;
  process.disconnect?.();
});

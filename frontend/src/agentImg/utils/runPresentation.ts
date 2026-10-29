import type { AgentRun, AgentServiceStatus } from '../services/agentRuns';

export function formatRunCredits(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 0.01) return '<0.01';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function runDisplayState(run: AgentRun, service: AgentServiceStatus | null, connectionLost: boolean) {
  if (['succeeded', 'failed', 'cancelled'].includes(run.status)) return run.status;
  if (run.status === 'paused') return 'paused';
  if (connectionLost) return 'disconnected';
  if (service && (!service.enabled || !service.workerOnline || service.workerModelReady === false)) return 'unavailable';
  if (run.progress.pauseRequested) return 'pausing';
  if (run.progress.clarificationRequired || run.status === 'waiting_user') return 'waiting_user';
  return run.status;
}

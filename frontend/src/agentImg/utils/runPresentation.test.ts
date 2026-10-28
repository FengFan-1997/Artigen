import { describe, expect, it } from 'vitest';
import type { AgentRun, AgentServiceStatus } from '../services/agentRuns';
import { formatRunCredits, runDisplayState } from './runPresentation';

describe('run presentation truth', () => {
  const run = (status: AgentRun['status'], pauseRequested = false) => ({ status, progress: { pauseRequested } } as AgentRun);
  const offline = { enabled: true, workerOnline: false } as AgentServiceStatus;
  it('does not render a real fractional charge as zero', () => {
    expect(formatRunCredits(0.004)).toBe('<0.01');
    expect(formatRunCredits(0)).toBe('0');
    expect(formatRunCredits(12.125)).toBe('12.13');
    expect(formatRunCredits(NaN)).toBe('—');
  });
  it('distinguishes queued, offline, disconnected and pending pause', () => {
    expect(runDisplayState(run('queued'), null, false)).toBe('queued');
    expect(runDisplayState(run('queued'), offline, false)).toBe('unavailable');
    expect(runDisplayState(run('running'), null, true)).toBe('disconnected');
    expect(runDisplayState(run('running', true), null, false)).toBe('pausing');
  });
  it('keeps terminal and paused task states when the worker is offline', () => {
    expect(runDisplayState(run('succeeded'), offline, true)).toBe('succeeded');
    expect(runDisplayState(run('paused'), offline, true)).toBe('paused');
  });
});

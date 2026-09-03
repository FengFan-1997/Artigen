const { ApiError } = require('../../lib/api-error');

const RUNTIME_FAILPOINTS = Object.freeze([
  'before_intent',
  'after_intent',
  'after_dispatch',
  'after_provider_response',
  'after_receipt',
  'after_budget_consume',
  'after_tool_dispatch',
  'after_tool_effect',
  'after_tool_receipt',
  'after_image_provider_response',
  'after_verifier',
  'after_ready_to_finalize_event',
  'before_finish_commit',
  'after_finish_commit'
]);

const ALLOWED_FAILPOINTS = new Set(RUNTIME_FAILPOINTS);

class RuntimeHarnessCrash extends ApiError {
  constructor(point, code = 'AGENT_HARNESS_CRASH') {
    super(503, code, { retryable: false, point });
    this.name = 'RuntimeHarnessCrash';
    this.point = point;
  }
}

class RuntimeTestController {
  constructor({ now = Date.now(), trace = null } = {}) {
    this.currentTimeMs = Number(now);
    this.trace = trace;
    this.barriers = new Map();
    this.crashes = new Map();
  }

  now() {
    return this.currentTimeMs;
  }

  advance(milliseconds) {
    const delta = Number(milliseconds);
    if (!Number.isFinite(delta) || delta < 0) {
      throw new TypeError('AGENT_HARNESS_TIME_DELTA_INVALID');
    }
    this.currentTimeMs += delta;
    this.trace?.record('clock.advanced', { elapsedMs: delta });
    return this.currentTimeMs;
  }

  setBarrier(point, { participants = 2, timeoutMs = 2_000, manualRelease = false } = {}) {
    this.assertPoint(point);
    if (!Number.isSafeInteger(participants) || participants < 1) {
      throw new TypeError('AGENT_HARNESS_BARRIER_PARTICIPANTS_INVALID');
    }
    if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) {
      throw new TypeError('AGENT_HARNESS_BARRIER_TIMEOUT_INVALID');
    }
    if (this.barriers.has(point)) throw new TypeError('AGENT_HARNESS_BARRIER_DUPLICATE');
    this.barriers.set(point, {
      participants,
      timeoutMs: Number(timeoutMs),
      manualRelease: manualRelease === true,
      waiters: [],
      arrivalWaiters: []
    });
    return this;
  }

  async waitForArrivals(point, { arrivals = 1, timeoutMs = 2_000 } = {}) {
    this.assertPoint(point);
    const state = this.barriers.get(point);
    if (!state) throw new TypeError(`AGENT_HARNESS_BARRIER_NOT_FOUND:${point}`);
    if (!Number.isSafeInteger(arrivals) || arrivals < 1 || arrivals > state.participants) {
      throw new TypeError('AGENT_HARNESS_BARRIER_ARRIVALS_INVALID');
    }
    if (state.waiters.length >= arrivals) return true;
    await new Promise((resolve, reject) => {
      const observer = { arrivals, resolve, reject, timer: null };
      observer.timer = setTimeout(() => {
        state.arrivalWaiters = state.arrivalWaiters.filter((entry) => entry !== observer);
        reject(new Error(`AGENT_HARNESS_BARRIER_ARRIVAL_TIMEOUT:${point}`));
      }, Math.max(1, Number(timeoutMs) || 2_000));
      observer.timer.unref?.();
      state.arrivalWaiters.push(observer);
    });
    return true;
  }

  releaseBarrier(point) {
    this.assertPoint(point);
    const state = this.barriers.get(point);
    if (!state) throw new TypeError(`AGENT_HARNESS_BARRIER_NOT_FOUND:${point}`);
    if (state.waiters.length < state.participants) {
      throw new TypeError(`AGENT_HARNESS_BARRIER_NOT_READY:${point}`);
    }
    this.resolveBarrier(point, state);
    return true;
  }

  armCrash(point, { code = 'AGENT_HARNESS_CRASH', afterHits = 1 } = {}) {
    this.assertPoint(point);
    if (!Number.isSafeInteger(afterHits) || afterHits < 1) {
      throw new TypeError('AGENT_HARNESS_CRASH_COUNT_INVALID');
    }
    this.crashes.set(point, { code, remaining: afterHits });
    return this;
  }

  async hit(point, metadata = {}) {
    this.assertPoint(point);
    this.trace?.record('failpoint.hit', { point, ...metadata });
    await this.waitOnBarrier(point);
    const crash = this.crashes.get(point);
    if (!crash) return false;
    crash.remaining -= 1;
    if (crash.remaining > 0) return false;
    this.crashes.delete(point);
    throw new RuntimeHarnessCrash(point, crash.code);
  }

  assertDrained() {
    const waiting = [...this.barriers.entries()]
      .filter(([, state]) => state.waiters.length > 0)
      .map(([point]) => point);
    if (waiting.length) {
      throw new Error(`AGENT_HARNESS_BARRIER_NOT_DRAINED:${waiting.join(',')}`);
    }
    return true;
  }

  assertPoint(point) {
    if (!ALLOWED_FAILPOINTS.has(point)) {
      throw new TypeError(`AGENT_HARNESS_FAILPOINT_INVALID:${String(point || '')}`);
    }
  }

  async waitOnBarrier(point) {
    const state = this.barriers.get(point);
    if (!state) return;
    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        state.waiters = state.waiters.filter((entry) => entry !== waiter);
        reject(new Error(`AGENT_HARNESS_BARRIER_TIMEOUT:${point}`));
      }, state.timeoutMs);
      waiter.timer.unref?.();
      state.waiters.push(waiter);
      for (const observer of [...state.arrivalWaiters]) {
        if (state.waiters.length < observer.arrivals) continue;
        clearTimeout(observer.timer);
        state.arrivalWaiters = state.arrivalWaiters.filter((entry) => entry !== observer);
        observer.resolve();
      }
      if (state.waiters.length !== state.participants) return;
      if (!state.manualRelease) this.resolveBarrier(point, state);
    });
  }

  resolveBarrier(point, state) {
    this.barriers.delete(point);
    for (const observer of state.arrivalWaiters) {
      clearTimeout(observer.timer);
      observer.reject(new Error(`AGENT_HARNESS_BARRIER_RELEASED_EARLY:${point}`));
    }
    state.arrivalWaiters = [];
    for (const entry of state.waiters) {
      clearTimeout(entry.timer);
      entry.resolve();
    }
  }
}

module.exports = {
  RUNTIME_FAILPOINTS,
  RuntimeHarnessCrash,
  RuntimeTestController
};

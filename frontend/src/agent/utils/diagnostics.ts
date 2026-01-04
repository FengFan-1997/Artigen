type DiagnosticLevel = 'info' | 'warn' | 'error';

export type DiagnosticItem = {
  ts: number;
  kind: string;
  level: DiagnosticLevel;
  message?: string;
  data?: any;
};

export type AiRequestDiagnostic = {
  id: string;
  ts: number;
  endedAt?: number;
  durationMs?: number;
  kind: string;
  group: string;
  priority?: number;
  transport?: string;
  cached?: boolean;
  dropped?: boolean;
  canceled?: boolean;
  ok?: boolean;
  aborted?: boolean;
  status?: number;
  errorMessage?: string;
  messagePreview?: string;
  trigger?: string;
};

const DEFAULT_MAX_ITEMS = 200;

const makeRing = <T>() => {
  let max = DEFAULT_MAX_ITEMS;
  let arr: T[] = [];
  return {
    setMax: (n: number) => {
      const next = Math.max(20, Math.min(2000, Math.floor(Number(n) || DEFAULT_MAX_ITEMS)));
      max = next;
      if (arr.length > max) arr = arr.slice(-max);
    },
    push: (v: T) => {
      arr.push(v);
      if (arr.length > max) arr = arr.slice(-max);
    },
    all: () => arr.slice(),
    clear: () => {
      arr = [];
    },
    size: () => arr.length
  };
};

let enabled = true;
let globalInstalled = false;
let consoleInstalled = false;
let consoleCaptureInfo = false;

const items = makeRing<DiagnosticItem>();
const aiRequests = makeRing<AiRequestDiagnostic>();

const safeString = (v: any) => {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const truncate = (s: string, maxLen: number) => {
  const v = String(s || '');
  if (v.length <= maxLen) return v;
  return v.slice(0, Math.max(0, maxLen)) + '…';
};

export const setDiagnosticsEnabled = (v: boolean) => {
  enabled = !!v;
};

export const getDiagnosticsEnabled = () => enabled;

export const setDiagnosticsMaxItems = (n: number) => {
  items.setMax(n);
  aiRequests.setMax(n);
};

export const clearDiagnostics = () => {
  items.clear();
  aiRequests.clear();
};

export const recordDiagnostic = (input: {
  kind: string;
  level?: DiagnosticLevel;
  message?: string;
  data?: any;
  ts?: number;
}) => {
  if (!enabled) return;
  const ts = typeof input.ts === 'number' ? input.ts : Date.now();
  const kind = String(input.kind || '').trim() || 'event';
  const level = (input.level || 'info') as DiagnosticLevel;
  const message = typeof input.message === 'string' ? truncate(input.message, 1000) : undefined;
  items.push({ ts, kind, level, message, data: input.data });
};

export const recordAiRequest = (input: AiRequestDiagnostic) => {
  if (!enabled) return;
  aiRequests.push(input);
};

export const updateAiRequest = (id: string, patch: Partial<AiRequestDiagnostic>) => {
  if (!enabled) return;
  const list = aiRequests.all();
  const idx = list.findIndex((x) => x?.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  aiRequests.clear();
  for (const x of list) aiRequests.push(x);
};

export const installGlobalDiagnostics = () => {
  if (globalInstalled) return;
  globalInstalled = true;

  window.addEventListener('error', (event) => {
    const msg = (event as any)?.message || 'window.error';
    const filename = (event as any)?.filename || '';
    const lineno = (event as any)?.lineno;
    const colno = (event as any)?.colno;
    const err = (event as any)?.error;
    recordDiagnostic({
      kind: 'window_error',
      level: 'error',
      message: typeof msg === 'string' ? msg : safeString(msg),
      data: {
        filename,
        lineno,
        colno,
        error: err
          ? {
              name: err?.name,
              message: err?.message,
              stack: typeof err?.stack === 'string' ? truncate(err.stack, 6000) : undefined
            }
          : undefined
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as any)?.reason;
    const msg =
      typeof reason?.message === 'string'
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'unhandledrejection';
    recordDiagnostic({
      kind: 'unhandledrejection',
      level: 'error',
      message: truncate(msg, 1000),
      data: {
        name: reason?.name,
        stack: typeof reason?.stack === 'string' ? truncate(reason.stack, 6000) : undefined,
        reason: typeof reason === 'object' ? undefined : safeString(reason)
      }
    });
  });
};

export const installConsoleDiagnostics = (options?: { captureInfo?: boolean }) => {
  if (consoleInstalled) return;
  consoleInstalled = true;

  consoleCaptureInfo = !!options?.captureInfo;
  const original = {
    error: console.error,
    warn: console.warn,
    log: console.log,
    info: console.info
  };

  const extractMsg = (args: any[]) => {
    const first = args?.[0];
    if (typeof first === 'string') return first;
    if (first instanceof Error) return first.message || first.name || 'Error';
    return safeString(first);
  };

  const extractError = (args: any[]) => {
    for (const a of args || []) {
      if (a instanceof Error) {
        return {
          name: a.name,
          message: a.message,
          stack: typeof a.stack === 'string' ? truncate(a.stack, 6000) : undefined
        };
      }
    }
    return undefined;
  };

  console.error = (...args: any[]) => {
    try {
      recordDiagnostic({
        kind: 'console_error',
        level: 'error',
        message: truncate(extractMsg(args), 1000),
        data: { error: extractError(args) }
      });
    } catch {}
    original.error(...args);
  };

  console.warn = (...args: any[]) => {
    try {
      recordDiagnostic({
        kind: 'console_warn',
        level: 'warn',
        message: truncate(extractMsg(args), 1000),
        data: { error: extractError(args) }
      });
    } catch {}
    original.warn(...args);
  };

  console.log = (...args: any[]) => {
    if (consoleCaptureInfo) {
      try {
        recordDiagnostic({
          kind: 'console_log',
          level: 'info',
          message: truncate(extractMsg(args), 1000)
        });
      } catch {}
    }
    original.log(...args);
  };

  console.info = (...args: any[]) => {
    if (consoleCaptureInfo) {
      try {
        recordDiagnostic({
          kind: 'console_info',
          level: 'info',
          message: truncate(extractMsg(args), 1000)
        });
      } catch {}
    }
    original.info(...args);
  };
};

export const setConsoleCaptureInfoEnabled = (v: boolean) => {
  consoleCaptureInfo = !!v;
};

export const getConsoleCaptureInfoEnabled = () => consoleCaptureInfo;

const pickPublicEnv = () => {
  const env = (import.meta as any)?.env;
  if (!env || typeof env !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_')) continue;
    if (/(key|secret|token|password)/i.test(k)) continue;
    out[k] = v;
  }
  return out;
};

export const getDiagnosticsSnapshot = () => {
  return {
    enabled,
    consoleCaptureInfo,
    ts: Date.now(),
    env: pickPublicEnv(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: (navigator as any).platform,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio
    },
    location: {
      href: window.location.href
    },
    counts: {
      items: items.size(),
      aiRequests: aiRequests.size()
    },
    items: items.all(),
    aiRequests: aiRequests.all()
  };
};

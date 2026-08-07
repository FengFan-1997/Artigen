export type OtpPurpose = 'login' | 'password-reset';
export type OtpDeliveryStatus = 'pending' | 'accepted' | 'unknown' | 'failed';

export type OtpFlowState = {
  version: 1;
  purpose: OtpPurpose;
  email: string;
  idempotencyKey: string;
  challengeId?: string;
  deliveryStatus: OtpDeliveryStatus;
  createdAt: number;
  expiresAt: number;
  nextSendAt?: number;
};

const OTP_FLOW_TTL_MS = 10 * 60 * 1000;
const OTP_FLOW_PREFIX = 'artigen.otp-flow.v1.';
type MemoryFlow = {
  state: OtpFlowState;
  allowWhenStorageMissing: boolean;
};

const browserMemoryFlows = new Map<OtpPurpose, MemoryFlow>();
const storageMemoryFlows = new WeakMap<object, Map<OtpPurpose, MemoryFlow>>();

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const getStorage = (storage?: Storage | null) => {
  if (storage !== undefined) return storage;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const storageKey = (purpose: OtpPurpose) => `${OTP_FLOW_PREFIX}${purpose}`;

const memoryStoreFor = (storage: Storage | null) => {
  if (!storage || (typeof storage !== 'object' && typeof storage !== 'function')) {
    return browserMemoryFlows;
  }
  let store = storageMemoryFlows.get(storage);
  if (!store) {
    store = new Map<OtpPurpose, MemoryFlow>();
    storageMemoryFlows.set(storage, store);
  }
  return store;
};

const readMemoryFlow = (
  store: Map<OtpPurpose, MemoryFlow>,
  purpose: OtpPurpose,
  now: number,
  storageMissing: boolean
) => {
  const entry = store.get(purpose);
  if (!entry || (!storageMissing && !entry.allowWhenStorageMissing)) return null;
  if (entry.state.expiresAt <= now) {
    store.delete(purpose);
    return null;
  }
  return { ...entry.state };
};

const normalizeStoredFlow = (
  parsed: any,
  purpose: OtpPurpose,
  now: number
): OtpFlowState | null => {
  if (
    parsed?.version !== 1 ||
    parsed?.purpose !== purpose ||
    !normalizeEmail(parsed?.email) ||
    !String(parsed?.idempotencyKey || '').trim() ||
    !Number.isFinite(Number(parsed?.expiresAt)) ||
    Number(parsed.expiresAt) <= now
  ) {
    return null;
  }
  return {
    version: 1,
    purpose,
    email: normalizeEmail(parsed.email),
    idempotencyKey: String(parsed.idempotencyKey),
    ...(String(parsed.challengeId || '').trim()
      ? { challengeId: String(parsed.challengeId).trim() }
      : {}),
    deliveryStatus: ['pending', 'accepted', 'unknown', 'failed'].includes(
      String(parsed.deliveryStatus)
    )
      ? parsed.deliveryStatus
      : 'pending',
    createdAt: Number(parsed.createdAt || now),
    expiresAt: Number(parsed.expiresAt),
    ...(Number.isFinite(Number(parsed.nextSendAt))
      ? { nextSendAt: Number(parsed.nextSendAt) }
      : {})
  };
};

const createIdempotencyKey = () => {
  try {
    if (typeof crypto?.randomUUID === 'function') return `otp:${crypto.randomUUID()}`;
  } catch {}
  const random = Math.random().toString(36).slice(2);
  return `otp:${Date.now().toString(36)}:${random}`;
};

export const readOtpFlow = (
  purpose: OtpPurpose,
  options: { storage?: Storage | null; now?: number } = {}
): OtpFlowState | null => {
  const storage = getStorage(options.storage);
  const memoryStore = memoryStoreFor(storage);
  const now = Number(options.now ?? Date.now());
  if (!storage) {
    return readMemoryFlow(memoryStore, purpose, now, true);
  }
  try {
    const raw = storage.getItem(storageKey(purpose));
    if (!raw) {
      const memory = readMemoryFlow(memoryStore, purpose, now, false);
      if (memory) return memory;
      memoryStore.delete(purpose);
      return null;
    }
    const normalized = normalizeStoredFlow(JSON.parse(raw), purpose, now);
    if (!normalized) {
      storage.removeItem(storageKey(purpose));
      memoryStore.delete(purpose);
      return null;
    }
    memoryStore.set(purpose, {
      state: { ...normalized },
      allowWhenStorageMissing: false
    });
    return normalized;
  } catch {
    return readMemoryFlow(memoryStore, purpose, now, true);
  }
};

const writeOtpFlow = (state: OtpFlowState, storage?: Storage | null) => {
  const target = getStorage(storage);
  const memoryStore = memoryStoreFor(target);
  const serialized = JSON.stringify(state);
  let persisted = false;
  try {
    if (target) {
      target.setItem(storageKey(state.purpose), serialized);
      persisted = target.getItem(storageKey(state.purpose)) === serialized;
    }
  } catch {}
  memoryStore.set(state.purpose, {
    state: { ...state },
    allowWhenStorageMissing: !persisted
  });
  return state;
};

export const beginOtpSend = (
  purpose: OtpPurpose,
  email: string,
  options: { storage?: Storage | null; now?: number; forceNew?: boolean } = {}
) => {
  const normalizedEmail = normalizeEmail(email);
  const now = Number(options.now ?? Date.now());
  const previous = readOtpFlow(purpose, options);
  if (
    previous &&
    previous.email === normalizedEmail &&
    !options.forceNew &&
    (previous.deliveryStatus === 'pending' || previous.deliveryStatus === 'unknown')
  ) {
    return previous;
  }
  return writeOtpFlow(
    {
      version: 1,
      purpose,
      email: normalizedEmail,
      idempotencyKey: createIdempotencyKey(),
      deliveryStatus: 'pending',
      createdAt: now,
      expiresAt: now + OTP_FLOW_TTL_MS
    },
    options.storage
  );
};

export const completeOtpSend = (
  purpose: OtpPurpose,
  input: {
    email: string;
    idempotencyKey: string;
    challengeId?: string;
    deliveryStatus: 'accepted' | 'unknown';
    cooldownSec?: number;
  },
  options: { storage?: Storage | null; now?: number } = {}
) => {
  const current = readOtpFlow(purpose, options);
  if (
    !current ||
    current.email !== normalizeEmail(input.email) ||
    current.idempotencyKey !== input.idempotencyKey
  ) {
    return null;
  }
  return writeOtpFlow(
    {
      ...current,
      ...(String(input.challengeId || '').trim()
        ? { challengeId: String(input.challengeId).trim() }
        : {}),
      deliveryStatus: input.deliveryStatus,
      nextSendAt:
        Number(options.now ?? Date.now()) +
        Math.max(0, Number(input.cooldownSec || 0) || 0) * 1000
    },
    options.storage
  );
};

export const failOtpSend = (
  purpose: OtpPurpose,
  idempotencyKey: string,
  options: { storage?: Storage | null; now?: number; cooldownSec?: number } = {}
) => {
  const current = readOtpFlow(purpose, options);
  if (!current || current.idempotencyKey !== idempotencyKey) return;
  const cooldownSec = Math.max(0, Number(options.cooldownSec || 0) || 0);
  writeOtpFlow(
    {
      ...current,
      deliveryStatus: 'failed',
      ...(cooldownSec
        ? { nextSendAt: Number(options.now ?? Date.now()) + cooldownSec * 1000 }
        : {})
    },
    options.storage
  );
};

export const clearOtpFlow = (purpose: OtpPurpose, storage?: Storage | null) => {
  const target = getStorage(storage);
  memoryStoreFor(target).delete(purpose);
  if (!target) browserMemoryFlows.delete(purpose);
  if (!target) return;
  try {
    target.removeItem(storageKey(purpose));
  } catch {}
};

export const getOtpCooldownSeconds = (
  flow: Pick<OtpFlowState, 'nextSendAt'> | null | undefined,
  now = Date.now()
) => {
  const nextSendAt = Number(flow?.nextSendAt || 0);
  if (!Number.isFinite(nextSendAt) || nextSendAt <= now) return 0;
  return Math.max(0, Math.ceil((nextSendAt - now) / 1000));
};

export { OTP_FLOW_TTL_MS };

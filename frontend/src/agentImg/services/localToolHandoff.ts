type LocalToolHandoff = {
  files: File[];
  expiresAt: number;
};

const handoffs = new Map<string, LocalToolHandoff>();
const TTL_MS = 5 * 60 * 1000;

const cleanup = () => {
  const now = Date.now();
  for (const [token, handoff] of handoffs) {
    if (handoff.expiresAt <= now) handoffs.delete(token);
  }
};

export const createLocalToolHandoff = (files: File[]) => {
  cleanup();
  const token = crypto.randomUUID();
  handoffs.set(token, { files: [...files], expiresAt: Date.now() + TTL_MS });
  return token;
};

export const consumeLocalToolHandoff = (token: string) => {
  cleanup();
  const key = String(token || '').trim();
  const handoff = handoffs.get(key);
  if (!handoff) return [] as File[];
  handoffs.delete(key);
  return handoff.files;
};

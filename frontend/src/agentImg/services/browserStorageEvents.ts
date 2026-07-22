export type BrowserStorageIssue = 'unavailable' | 'quota' | 'blocked' | 'versionchange' | 'write';

const CHANNEL_NAME = 'artigen-browser-storage-v1';
let channel: BroadcastChannel | null = null;

const dispatch = (name: string, detail: Record<string, unknown>) => {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // SSR, tests and restricted browser contexts may not expose window events.
  }
};

const getChannel = () => {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      dispatch('artigen-storage-changed', event.data as Record<string, unknown>);
    };
  } catch {
    channel = null;
  }
  return channel;
};

export const notifyStorageChanged = (database: string, store: string, key?: string) => {
  const detail = { database, store, ...(key ? { key } : {}) };
  dispatch('artigen-storage-changed', detail);
  try {
    getChannel()?.postMessage(detail);
  } catch {}
};

export const reportStorageIssue = (
  issue: BrowserStorageIssue,
  database: string,
  error?: unknown
) => {
  const detail = {
    issue,
    database,
    code: error instanceof Error ? error.name : 'BROWSER_STORAGE_ERROR'
  };
  dispatch('artigen-storage-error', detail);
  return detail;
};

export const classifyStorageIssue = (error: unknown): BrowserStorageIssue => {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  if (/quota/i.test(name) || /quota/i.test(message)) return 'quota';
  if (/blocked/i.test(name) || /blocked/i.test(message)) return 'blocked';
  if (/version/i.test(name) || /version/i.test(message)) return 'versionchange';
  if (/closed|open|database|indexeddb/i.test(name) || /indexeddb|database/i.test(message)) {
    return 'unavailable';
  }
  return 'write';
};

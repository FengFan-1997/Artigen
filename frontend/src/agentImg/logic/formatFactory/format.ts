export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const fixed = idx === 0 ? 0 : 2;
  return `${val.toFixed(fixed)} ${units[idx]}`;
};

export const parsePositiveInt = (v: string) => {
  const n = Number.parseInt(String(v || '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

export const safeBaseName = (name: string) => {
  const cleaned = name.replace(/\.[^/.]+$/, '');
  return cleaned || 'output';
};

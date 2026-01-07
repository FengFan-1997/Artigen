export const readIntSetting = (key: string, fallback: number, min: number, max: number) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  } catch {
    return fallback;
  }
};

export const readFloatSetting = (key: string, fallback: number, min: number, max: number) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? Number.parseFloat(raw) : Number.NaN;
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  } catch {
    return fallback;
  }
};

export const readBoolSetting = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
  } catch {
    return fallback;
  }
};

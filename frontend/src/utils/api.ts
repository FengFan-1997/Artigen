export const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const getApiBaseUrl = () =>
  normalizeBaseUrl(import.meta.env.VITE_API_BASE || import.meta.env.VITE_AGENT_API_BASE || '');

export const buildApiUrl = (path: string) => {
  const base = getApiBaseUrl();
  const p = String(path || '').trim() || '/';
  const normalizedPath = p.startsWith('/') ? p : `/${p}`;
  if (!base) return normalizedPath;
  if (base.endsWith('/api') && (normalizedPath === '/api' || normalizedPath.startsWith('/api/'))) {
    const rest = normalizedPath === '/api' ? '' : normalizedPath.slice(4);
    return `${base}${rest}`;
  }
  return `${base}${normalizedPath}`;
};

export const extractFirstJsonObject = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) return null;
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace <= firstBrace) return null;
  const candidate = text.slice(firstBrace, lastBrace + 1).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export const safeJsonStringify = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

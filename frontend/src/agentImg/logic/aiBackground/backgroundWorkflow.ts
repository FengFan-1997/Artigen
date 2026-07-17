export type BackgroundMode = 'replace' | 'add';

export const enforceLocalBackgroundPolicy = (
  mode: BackgroundMode,
  localResultUrl: string
): string | undefined => {
  const result = String(localResultUrl || '').trim();
  if (mode === 'replace' && !result) throw new Error('AI_BACKGROUND_LOCAL_RESULT_REQUIRED');
  return result || undefined;
};

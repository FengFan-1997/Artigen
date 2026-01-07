export type SendCodeResult = { ok: true; cooldownSec: number } | { ok: false; message: string };
export type VerifyCodeResult = { ok: true; userId: string } | { ok: false; message: string };

const parseJson = async (res: Response) => {
  const txt = await res.text().catch(() => '');
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

export const sendLoginCode = async (email: string): Promise<SendCodeResult> => {
  const res = await fetch('/login-api/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const json = await parseJson(res);
  if (!res.ok) return { ok: false, message: String(json?.message || '发送失败') };
  return { ok: true, cooldownSec: Number(json?.cooldownSec || 60) };
};

export const verifyLoginCode = async (email: string, code: string): Promise<VerifyCodeResult> => {
  const res = await fetch('/login-api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const json = await parseJson(res);
  if (!res.ok) return { ok: false, message: String(json?.message || '验证失败') };
  const userId = String(json?.userId || '').trim();
  if (!userId) return { ok: false, message: '验证失败' };
  return { ok: true, userId };
};

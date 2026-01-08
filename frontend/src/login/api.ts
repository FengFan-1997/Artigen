export type SendCodeResult =
  | { ok: true; cooldownSec: number; debugCode?: string; message?: string }
  | { ok: false; message: string; cooldownSec?: number };
export type VerifyCodeResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; message: string };

export type PasswordAuthResult =
  | { ok: true; userId: string; token: string; name?: string }
  | { ok: false; message: string };

const parseJson = async (res: Response) => {
  const txt = await res.text().catch(() => '');
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

export const sendLoginCode = async (email: string): Promise<SendCodeResult> => {
  const res = await fetch('/api/login/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return {
      ok: false,
      message: String(json?.message || json?.error || '发送失败'),
      cooldownSec: Number(json?.cooldownSec || 0) || undefined
    };
  }
  const debugCode = typeof json?.debugCode === 'string' ? String(json.debugCode).trim() : '';
  const message = typeof json?.message === 'string' ? String(json.message) : '';
  return {
    ok: true,
    cooldownSec: Number(json?.cooldownSec || 60) || 60,
    ...(debugCode ? { debugCode } : {}),
    ...(message ? { message } : {})
  };
};

export const verifyLoginCode = async (email: string, code: string): Promise<VerifyCodeResult> => {
  const fromUserId = (() => {
    try {
      return String(
        window.localStorage.getItem('app_user_id') ||
          window.localStorage.getItem('agent_user_id') ||
          ''
      ).trim();
    } catch {
      return '';
    }
  })();

  const res = await fetch('/api/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, fromUserId })
  });
  const json = await parseJson(res);
  if (!res.ok) return { ok: false, message: String(json?.message || json?.error || '验证失败') };
  const userId = String(json?.userId || '').trim();
  const token = String(json?.token || '').trim();
  if (!userId || !token) return { ok: false, message: '验证失败' };
  return { ok: true, userId, token };
};

export const loginWithPassword = async (
  username: string,
  password: string
): Promise<PasswordAuthResult> => {
  const fromUserId = (() => {
    try {
      return String(
        window.localStorage.getItem('app_user_id') ||
          window.localStorage.getItem('agent_user_id') ||
          ''
      ).trim();
    } catch {
      return '';
    }
  })();

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : ''
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: String(json?.message || json?.error || '登录失败') };
  }
  const userId = String(json?.userId || '').trim();
  const token = String(json?.token || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  if (!userId || !token) return { ok: false, message: '登录失败' };
  return { ok: true, userId, token, ...(name ? { name } : {}) };
};

export const registerWithEmailCode = async (input: {
  username: string;
  password: string;
  email: string;
  code: string;
}): Promise<PasswordAuthResult> => {
  const fromUserId = (() => {
    try {
      return String(
        window.localStorage.getItem('app_user_id') ||
          window.localStorage.getItem('agent_user_id') ||
          ''
      ).trim();
    } catch {
      return '';
    }
  })();

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      email: input.email,
      code: input.code,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : ''
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: String(json?.message || json?.error || '注册失败') };
  }
  const userId = String(json?.userId || '').trim();
  const token = String(json?.token || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  if (!userId || !token) return { ok: false, message: '注册失败' };
  return { ok: true, userId, token, ...(name ? { name } : {}) };
};

export type SendCodeResult =
  | { ok: true; cooldownSec: number; debugCode?: string; message?: string }
  | { ok: false; message: string; cooldownSec?: number };
export type VerifyCodeResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; message: string };

export type PasswordAuthResult =
  | { ok: true; userId: string; token: string; name?: string }
  | { ok: false; message: string };

import { buildApiUrl } from '../utils/api';

const SEND_CODE_URL = buildApiUrl('/api/login/send-code');
const VERIFY_CODE_URL = buildApiUrl('/api/login/verify');
const PASSWORD_LOGIN_URL = buildApiUrl('/api/auth/login');
const REGISTER_URL = buildApiUrl('/api/auth/register');

const isZh = () => {
  try {
    return String(window.localStorage.getItem('app_lang') || 'zh').startsWith('zh');
  } catch {
    return true;
  }
};

const normalizeErr = (raw: any) => String(raw || '').trim();

const humanizeAuthError = (raw: any) => {
  const msg = normalizeErr(raw);
  if (!msg) return isZh() ? '网络错误，请稍后重试' : 'Network error, please try again.';

  const m = msg.toLowerCase();
  const zh = isZh();

  if (m === 'password_rules' || m.includes('password_rules')) {
    return zh ? '密码不符合规范' : 'Password does not meet requirements.';
  }
  if (m.includes('invalid credentials') || m === 'invalid_credentials') {
    return zh ? '账号或密码错误' : 'Invalid username or password.';
  }
  if (m.includes('email already exists')) {
    return zh ? '该邮箱已注册' : 'Email already registered.';
  }
  if (m.includes('username already exists')) {
    return zh ? '该账号已注册' : 'Username already registered.';
  }
  if (m.includes('please send code first')) {
    return zh ? '请先发送验证码' : 'Please send the code first.';
  }
  if (m.includes('code expired')) {
    return zh ? '验证码已过期，请重新发送' : 'Code expired, please resend.';
  }
  if (m.includes('too many attempts')) {
    return zh ? '尝试次数过多，请重新发送验证码' : 'Too many attempts, please resend.';
  }
  if (m === 'invalid code' || m === 'invalid_code') {
    return zh ? '验证码错误' : 'Invalid code.';
  }
  if (m.includes('invalid email')) {
    return zh ? '邮箱格式不正确' : 'Invalid email format.';
  }
  if (m.includes('invalid username')) {
    return zh ? '账号格式不正确' : 'Invalid username.';
  }
  if (m.includes('invalid password')) {
    return zh ? '密码格式不正确' : 'Invalid password.';
  }

  return msg;
};

const parseJson = async (res: Response) => {
  const txt = await res.text().catch(() => '');
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

export const sendLoginCode = async (email: string): Promise<SendCodeResult> => {
  const res = await fetch(SEND_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return {
      ok: false,
      message: humanizeAuthError(json?.message || json?.error || '发送失败'),
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

  const res = await fetch(VERIFY_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, fromUserId })
  });
  const json = await parseJson(res);
  if (!res.ok)
    return { ok: false, message: humanizeAuthError(json?.message || json?.error || '验证失败') };
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

  const res = await fetch(PASSWORD_LOGIN_URL, {
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
    return { ok: false, message: humanizeAuthError(json?.message || json?.error || '登录失败') };
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

  const res = await fetch(REGISTER_URL, {
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
    return { ok: false, message: humanizeAuthError(json?.message || json?.error || '注册失败') };
  }
  const userId = String(json?.userId || '').trim();
  const token = String(json?.token || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  if (!userId || !token) return { ok: false, message: '注册失败' };
  return { ok: true, userId, token, ...(name ? { name } : {}) };
};

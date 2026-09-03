export type SendCodeResult =
  | {
      ok: true;
      cooldownSec: number;
      challengeId?: string;
      deliveryStatus: 'accepted' | 'unknown';
      debugCode?: string;
      message?: string;
    }
  | { ok: false; message: string; errorCode?: string; cooldownSec?: number };
export type VerifyCodeResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export type PasswordAuthResult =
  | { ok: true; userId: string; name?: string }
  | { ok: false; message: string };

export type GoogleAuthResult =
  | { ok: true; userId: string; name?: string; email?: string }
  | { ok: false; message: string };

export type ResetPasswordResult = { ok: true; message?: string } | { ok: false; message: string };

import { buildApiUrl } from '../utils/api';
import { getPageContext } from '@/utils/pageContext';
import { getOrCreateProjectId, getOrCreateSessionId } from './session';
import { authFetch, setCsrfToken } from './authFetch';

const SEND_CODE_URL = buildApiUrl('/api/login/send-code');
const VERIFY_CODE_URL = buildApiUrl('/api/login/verify');
const PASSWORD_LOGIN_URL = buildApiUrl('/api/auth/login');
const REGISTER_URL = buildApiUrl('/api/auth/register');
const PASSWORD_RESET_SEND_CODE_URL = buildApiUrl('/api/auth/password-reset/send-code');
const PASSWORD_RESET_URL = buildApiUrl('/api/auth/password-reset/reset');
const GOOGLE_VERIFY_URL = buildApiUrl('/api/auth/google/verify');
const GOOGLE_CONFIG_URL = buildApiUrl('/api/auth/google/config');

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

  if (
    m === 'turnstile_required' ||
    m === 'turnstile_invalid' ||
    m === 'turnstile_failed' ||
    m === 'turnstile_action_mismatch' ||
    m === 'turnstile_hostname_mismatch'
  ) {
    return zh ? '请先完成安全验证' : 'Please complete the security check.';
  }
  if (m === 'turnstile_unavailable') {
    return zh ? '安全验证暂时不可用，请稍后重试' : 'Security check is temporarily unavailable.';
  }
  if (m === 'turnstile_not_configured') {
    return zh ? '安全验证尚未配置' : 'Security check is not configured.';
  }
  if (m === 'otp_format_invalid') {
    return zh ? '请输入 6 位数字验证码' : 'Enter the 6-digit verification code.';
  }
  if (m === 'otp_delivery_unavailable' || m === 'otp_send_failed') {
    return zh
      ? '验证码服务暂时不可用，请稍后重试'
      : 'Verification email is temporarily unavailable.';
  }
  if (m === 'otp_provider_throttled') {
    return zh ? '发送服务繁忙，请稍后重试' : 'Email delivery is busy. Please try later.';
  }
  if (m === 'otp_cooldown') {
    return zh ? '发送太频繁，请稍后重试' : 'Please wait before sending another code.';
  }
  if (m === 'otp_daily_budget_exhausted' || m === 'otp_send_quota_exceeded') {
    return zh ? '今日验证码额度已用完，请明天再试' : 'Today’s verification email limit is reached.';
  }
  if (
    m === 'idempotency_conflict' ||
    m === 'invalid_idempotency_key' ||
    m === 'idempotency_key_required'
  ) {
    return zh ? '请求状态已变化，请重新发送' : 'The request changed. Please send again.';
  }
  if (m === 'password_rules' || m.includes('password_rules')) {
    return zh ? '密码不符合规范' : 'Password does not meet requirements.';
  }
  if (m.includes('invalid credentials') || m === 'invalid_credentials') {
    return zh ? '账号或密码错误' : 'Invalid username or password.';
  }
  if (m.includes('email already exists') || m === 'email_exists') {
    return zh ? '该邮箱已注册' : 'Email already registered.';
  }
  if (m.includes('username already exists') || m === 'username_exists') {
    return zh ? '该账号已注册' : 'Username already registered.';
  }
  if (m.includes('please send code first') || m === 'otp_required' || m === 'otp_already_used') {
    return zh ? '请先发送验证码' : 'Please send the code first.';
  }
  if (m.includes('code expired') || m === 'otp_expired') {
    return zh ? '验证码已过期，请重新发送' : 'Code expired, please resend.';
  }
  if (m.includes('too many attempts') || m === 'otp_attempts_exceeded') {
    return zh ? '尝试次数过多，请重新发送验证码' : 'Too many attempts, please resend.';
  }
  if (
    m === 'invalid code' ||
    m === 'invalid_code' ||
    m === 'otp_incorrect' ||
    m === 'otp_invalid'
  ) {
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
  if (
    m.includes('email not registered') ||
    m.includes('email_not_registered') ||
    m.includes('email_not_found')
  ) {
    return zh ? '该邮箱未注册' : 'Email not registered.';
  }
  if (m.includes('google_oauth_not_configured'))
    return zh
      ? '谷歌登录暂时不可用，请稍后重试'
      : 'Google login is temporarily unavailable. Please try again later.';
  if (m.includes('google_tokeninfo_timeout'))
    return zh
      ? '谷歌登录校验超时，请检查网络或代理'
      : 'Google verification timed out. Check network or proxy.';
  if (m.includes('google_tokeninfo_unavailable'))
    return zh
      ? '谷歌登录校验不可用，请检查网络或代理'
      : 'Google verification unavailable. Check network or proxy.';
  if (m.includes('google_tokeninfo_invalid'))
    return zh ? '谷歌登录校验失败，请重试' : 'Google verification failed, please retry.';
  if (m.includes('missing_id_token')) return zh ? '谷歌登录失败，请重试' : 'Google login failed.';
  if (m.includes('invalid_audience'))
    return zh ? '谷歌登录校验失败' : 'Google login verification failed.';
  if (m.includes('invalid_google_sub')) return zh ? '谷歌账号无效' : 'Invalid Google account.';
  if (m.includes('email_not_verified'))
    return zh ? '谷歌邮箱未验证' : 'Google email is not verified.';
  if (m.includes('google_login_failed')) return zh ? '谷歌登录失败' : 'Google login failed.';

  return msg;
};

const humanizeAuthResponseError = (json: any, fallback: string, status = 0) => {
  const errorCode = normalizeErr(json?.error);
  if (errorCode) {
    const humanizedCode = humanizeAuthError(errorCode);
    if (humanizedCode.toLowerCase() !== errorCode.toLowerCase()) return humanizedCode;
  }
  if ([502, 503, 504].includes(status)) {
    return isZh()
      ? '服务暂时不可用，请稍后重试'
      : 'The service is temporarily unavailable. Please try again later.';
  }
  return humanizeAuthError(json?.message || errorCode || fallback);
};

const parseJson = async (res: Response) => {
  const txt = await res.text().catch(() => '');
  try {
    const json = JSON.parse(txt);
    if (json && typeof json === 'object' && json.csrfToken) setCsrfToken(json.csrfToken);
    return json;
  } catch {
    return null;
  }
};

export type SendCodeOptions = {
  idempotencyKey?: string;
  turnstileToken?: string;
};

const fallbackIdempotencyKey = () => {
  try {
    if (typeof crypto?.randomUUID === 'function') return `otp:${crypto.randomUUID()}`;
  } catch {}
  return `otp:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
};

export const sendLoginCode = async (
  email: string,
  options: SendCodeOptions = {}
): Promise<SendCodeResult> => {
  const res = await authFetch(SEND_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey || fallbackIdempotencyKey()
    },
    body: JSON.stringify({
      email,
      turnstileToken: String(options.turnstileToken || '').trim(),
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'login_send_code'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    const errorCode = String(json?.error || '').trim();
    return {
      ok: false,
      message: humanizeAuthResponseError(json, '发送失败', res.status),
      ...(errorCode ? { errorCode } : {}),
      cooldownSec: Number(json?.cooldownSec || json?.retryAfterSec || 0) || undefined
    };
  }
  const debugCode = typeof json?.debugCode === 'string' ? String(json.debugCode).trim() : '';
  const message = typeof json?.message === 'string' ? String(json.message) : '';
  const challengeId =
    typeof json?.challengeId === 'string' ? String(json.challengeId).trim() : '';
  const deliveryStatus =
    json?.deliveryStatus === 'unknown' || res.status === 202 ? 'unknown' : 'accepted';
  return {
    ok: true,
    cooldownSec: Number(json?.cooldownSec || 60) || 60,
    deliveryStatus,
    ...(challengeId ? { challengeId } : {}),
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

  const res = await authFetch(VERIFY_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      code,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'login_verify_code'
    })
  });
  const json = await parseJson(res);
  if (!res.ok)
    return { ok: false, message: humanizeAuthResponseError(json, '验证失败', res.status) };
  const userId = String(json?.userId || '').trim();
  if (!userId) return { ok: false, message: '验证失败' };
  return { ok: true, userId };
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

  const res = await authFetch(PASSWORD_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'login_password'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: humanizeAuthResponseError(json, '登录失败', res.status) };
  }
  const userId = String(json?.userId || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  if (!userId) return { ok: false, message: '登录失败' };
  return { ok: true, userId, ...(name ? { name } : {}) };
};

// The backend verifies the ID token audience, so it must also be the source of
// truth for the client ID used by Google Identity Services. Keeping a separate
// build-time ID can make the button render successfully while every login is
// rejected with INVALID_AUDIENCE.
export const resolveGoogleClientId = async (): Promise<string> => {
  const tryFetch = async (url: string) => {
    try {
      const res = await authFetch(url, { method: 'GET' });
      const json = await parseJson(res);
      if (!res.ok) return '';
      const raw = json?.clientId ?? json?.client_id ?? '';
      return String(raw || '').trim();
    } catch {
      return '';
    }
  };
  const a = await tryFetch(GOOGLE_CONFIG_URL);
  if (a) return a;
  return await tryFetch('/api/auth/google/config');
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

  const res = await authFetch(REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      email: input.email,
      code: input.code,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'register_email_code'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: humanizeAuthResponseError(json, '注册失败', res.status) };
  }
  const userId = String(json?.userId || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  if (!userId) return { ok: false, message: '注册失败' };
  return { ok: true, userId, ...(name ? { name } : {}) };
};

export const loginWithGoogleIdToken = async (idToken: string): Promise<GoogleAuthResult> => {
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

  const res = await authFetch(GOOGLE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'login_google'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: humanizeAuthResponseError(json, '登录失败', res.status) };
  }
  const userId = String(json?.userId || '').trim();
  const name = typeof json?.name === 'string' ? String(json.name).trim() : '';
  const email = typeof json?.email === 'string' ? String(json.email).trim() : '';
  if (!userId) return { ok: false, message: '登录失败' };
  return {
    ok: true,
    userId,
    ...(name ? { name } : {}),
    ...(email ? { email } : {})
  };
};

export const sendPasswordResetCode = async (
  email: string,
  options: SendCodeOptions = {}
): Promise<SendCodeResult> => {
  const res = await authFetch(PASSWORD_RESET_SEND_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey || fallbackIdempotencyKey()
    },
    body: JSON.stringify({
      email,
      turnstileToken: String(options.turnstileToken || '').trim(),
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'password_reset_send_code'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    const errorCode = String(json?.error || '').trim();
    return {
      ok: false,
      message: humanizeAuthResponseError(json, '发送失败', res.status),
      ...(errorCode ? { errorCode } : {}),
      cooldownSec: Number(json?.cooldownSec || json?.retryAfterSec || 0) || undefined
    };
  }
  const debugCode = typeof json?.debugCode === 'string' ? String(json.debugCode).trim() : '';
  const message = typeof json?.message === 'string' ? String(json.message) : '';
  const challengeId =
    typeof json?.challengeId === 'string' ? String(json.challengeId).trim() : '';
  const deliveryStatus =
    json?.deliveryStatus === 'unknown' || res.status === 202 ? 'unknown' : 'accepted';
  return {
    ok: true,
    cooldownSec: Number(json?.cooldownSec || 60) || 60,
    deliveryStatus,
    ...(challengeId ? { challengeId } : {}),
    ...(debugCode ? { debugCode } : {}),
    ...(message ? { message } : {})
  };
};

export const resetPasswordWithCode = async (input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<ResetPasswordResult> => {
  const res = await authFetch(PASSWORD_RESET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      code: input.code,
      newPassword: input.newPassword,
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'password_reset'
    })
  });
  const json = await parseJson(res);
  if (!res.ok) {
    return { ok: false, message: humanizeAuthResponseError(json, '重置失败', res.status) };
  }
  const msg = typeof json?.message === 'string' ? String(json.message) : '';
  return { ok: true, ...(msg ? { message: msg } : {}) };
};

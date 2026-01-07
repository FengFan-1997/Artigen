import type { Plugin } from 'vite';
import nodemailer from 'nodemailer';
import { randomInt } from 'crypto';

type CodeState = {
  code: string;
  expiresAt: number;
  nextSendAt: number;
  attemptsLeft: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 50_000;
const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const codes = new Map<string, CodeState>();

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body || {}));
};

const readBody = (req: any) =>
  new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => {
      data += String(chunk || '');
      if (data.length > MAX_BODY_BYTES) reject(new Error('BODY_TOO_LARGE'));
    });
    req.on('end', () => resolve(data));
    req.on('error', (e: any) => reject(e));
  });

const normalizeEmail = (input: string) =>
  String(input || '')
    .trim()
    .toLowerCase();

const buildTransport = () => {
  const user = String(process.env.QQ_SMTP_USER || '').trim();
  const pass = String(process.env.QQ_SMTP_PASS || '').trim();
  if (!user || !pass) throw new Error('QQ_SMTP_MISSING');
  return nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
};

const sendMail = async (to: string, code: string) => {
  const transport = buildTransport();
  const fromUser = String(process.env.QQ_SMTP_USER || '').trim();
  const fromName = String(process.env.QQ_SMTP_FROM_NAME || 'Nth Me').trim();
  const subject = '登录验证码';
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Arial; line-height: 1.6; color: #0f172a;">
      <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">邮箱验证码登录</div>
      <div style="margin-bottom: 12px;">你的验证码是：</div>
      <div style="font-size: 28px; font-weight: 900; letter-spacing: 4px; margin: 10px 0;">${code}</div>
      <div style="color: #475569; font-size: 12px;">10 分钟内有效。如非本人操作，请忽略。</div>
    </div>
  `;
  await transport.sendMail({
    from: `${fromName} <${fromUser}>`,
    to,
    subject,
    html
  });
};

export const loginSmtpPlugin = (): Plugin => {
  return {
    name: 'login-smtp-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const method = String(req.method || 'GET').toUpperCase();
        const url = String(req.url || '');
        if (!url.startsWith('/login-api/')) return next();

        try {
          if (method === 'POST' && url.startsWith('/login-api/send-code')) {
            const raw = await readBody(req);
            const body = raw ? JSON.parse(raw) : {};
            const email = normalizeEmail(body?.email);
            if (!email || email.length > 254 || !EMAIL_RE.test(email))
              return json(res, 400, { message: '邮箱格式不正确' });

            const now = Date.now();
            const existing = codes.get(email);
            if (existing && existing.nextSendAt > now) {
              const left = Math.ceil((existing.nextSendAt - now) / 1000);
              return json(res, 429, {
                message: `发送太频繁，请 ${left}s 后再试`,
                cooldownSec: left
              });
            }

            const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
            const next: CodeState = {
              code,
              expiresAt: now + CODE_TTL_MS,
              nextSendAt: now + SEND_COOLDOWN_MS,
              attemptsLeft: MAX_ATTEMPTS
            };
            codes.set(email, next);
            await sendMail(email, code);
            return json(res, 200, { ok: true, cooldownSec: Math.ceil(SEND_COOLDOWN_MS / 1000) });
          }

          if (method === 'POST' && url.startsWith('/login-api/verify')) {
            const raw = await readBody(req);
            const body = raw ? JSON.parse(raw) : {};
            const email = normalizeEmail(body?.email);
            const code = String(body?.code || '').trim();
            if (!email || !EMAIL_RE.test(email))
              return json(res, 400, { message: '邮箱格式不正确' });
            if (!code) return json(res, 400, { message: '请输入验证码' });

            const st = codes.get(email);
            if (!st) return json(res, 400, { message: '请先发送验证码' });

            const now = Date.now();
            if (now > st.expiresAt) {
              codes.delete(email);
              return json(res, 400, { message: '验证码已过期，请重新发送' });
            }

            if (st.attemptsLeft <= 0) {
              codes.delete(email);
              return json(res, 429, { message: '尝试次数过多，请重新发送验证码' });
            }

            if (code !== st.code) {
              st.attemptsLeft -= 1;
              codes.set(email, st);
              return json(res, 400, { message: '验证码错误' });
            }

            codes.delete(email);
            const userId = `email_${Buffer.from(email).toString('base64url').slice(0, 16)}`;
            return json(res, 200, { ok: true, userId });
          }

          return json(res, 404, { message: 'NOT_FOUND' });
        } catch (e: any) {
          const msg = typeof e?.message === 'string' ? e.message : 'ERROR';
          if (msg === 'QQ_SMTP_MISSING')
            return json(res, 500, { message: '缺少 QQ_SMTP_USER / QQ_SMTP_PASS 环境变量' });
          if (msg === 'BODY_TOO_LARGE') return json(res, 413, { message: '请求体过大' });
          return json(res, 500, { message: '发送失败，请检查 SMTP 配置' });
        }
      });
    }
  };
};

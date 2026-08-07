'use strict';

const otpCopy = ({ purpose, code }) => {
  const passwordReset = purpose === 'password-reset';
  const title = passwordReset ? '密码重置验证' : '邮箱验证码登录';
  const subject = passwordReset ? 'Artigen 重置密码验证码' : 'Artigen 登录验证码';
  const resetNotice = passwordReset
    ? '\n如果该邮箱没有对应账户，验证码不会生效。'
    : '';
  return {
    subject,
    text: `${title}\n\n你的验证码是：${code}\n\n验证码 10 分钟内有效。${resetNotice}\n如非本人操作，请忽略。`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0b0d0e;">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">${title}</div>
        <div style="margin-bottom: 12px;">你的验证码是：</div>
        <div style="font-size: 28px; font-weight: 900; letter-spacing: 4px; margin: 10px 0;">${code}</div>
        <div style="color: #475569; font-size: 12px;">
          10 分钟内有效。${passwordReset ? '如果该邮箱没有对应账户，验证码不会生效。' : ''}
          如非本人操作，请忽略。
        </div>
      </div>
    `
  };
};

module.exports = { otpCopy };

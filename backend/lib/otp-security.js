const crypto = require('crypto');

let developmentSecret = '';

const isProduction = (env = process.env) => {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
};

const getOtpHmacSecret = (env = process.env) => {
  const configured = String(env.OTP_HMAC_SECRET || '').trim();
  if (configured) return configured;
  if (isProduction(env)) {
    const error = new Error('OTP_HMAC_NOT_CONFIGURED');
    error.code = 'OTP_HMAC_NOT_CONFIGURED';
    throw error;
  }
  if (!developmentSecret) developmentSecret = crypto.randomBytes(32).toString('hex');
  return developmentSecret;
};

const otpMessage = ({ target, purpose, code }) => {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  const normalizedPurpose = String(purpose || '').trim().toLowerCase();
  const normalizedCode = String(code || '').trim();
  if (!normalizedTarget || !normalizedPurpose || !/^\d{6}$/.test(normalizedCode)) {
    const error = new Error('INVALID_OTP_INPUT');
    error.code = 'INVALID_OTP_INPUT';
    throw error;
  }
  return `artigen-otp-v1\n${normalizedPurpose}\n${normalizedTarget}\n${normalizedCode}`;
};

const hashOtpCode = (input, env = process.env) => {
  return crypto
    .createHmac('sha256', getOtpHmacSecret(env))
    .update(otpMessage(input), 'utf8')
    .digest('hex');
};

const verifyOtpCode = (input, expectedDigest, env = process.env) => {
  let actual;
  try {
    actual = Buffer.from(hashOtpCode(input, env), 'hex');
  } catch (error) {
    if (error?.code === 'OTP_HMAC_NOT_CONFIGURED') throw error;
    return false;
  }
  let expected;
  try {
    expected = Buffer.from(String(expectedDigest || ''), 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
};

const generateOtpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

module.exports = {
  generateOtpCode,
  getOtpHmacSecret,
  hashOtpCode,
  otpMessage,
  verifyOtpCode
};

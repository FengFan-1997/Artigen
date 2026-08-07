const { execFileSync } = require('child_process');

const KEYCHAIN_LABEL_RE = /^[A-Za-z0-9 ._@:+/-]{1,160}$/;
const secretCache = new Map();

const readMacOsKeychainSecret = ({ service, account } = {}) => {
  const serviceName = String(service || '').trim();
  const accountName = String(account || '').trim();
  if (
    process.platform !== 'darwin' ||
    !KEYCHAIN_LABEL_RE.test(serviceName) ||
    !KEYCHAIN_LABEL_RE.test(accountName)
  ) {
    return '';
  }
  const cacheKey = `${serviceName}\u0000${accountName}`;
  if (secretCache.has(cacheKey)) return secretCache.get(cacheKey);
  let value = '';
  try {
    value = String(execFileSync('/usr/bin/security', [
      'find-generic-password',
      '-s', serviceName,
      '-a', accountName,
      '-w'
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 8192
    }) || '').trim();
  } catch {
    value = '';
  }
  const bounded = value.length <= 4096 ? value : '';
  secretCache.set(cacheKey, bounded);
  return bounded;
};

module.exports = {
  readMacOsKeychainSecret
};

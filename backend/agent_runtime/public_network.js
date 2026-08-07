'use strict';

const dns = require('node:dns');
const net = require('node:net');

const normalizeHostname = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^\[|\]$/g, '')
  .replace(/^\.+|\.+$/g, '');

const parseIpv4 = (address) => address.split('.').map(Number);

const isPublicIpv4 = (address) => {
  if (!net.isIPv4(address)) return false;
  const [a, b, c] = parseIpv4(address);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const expandedIpv6 = (raw) => {
  const address = normalizeHostname(raw).split('%')[0];
  if (!net.isIPv6(address)) return null;
  const [leftRaw, rightRaw = ''] = address.split('::');
  if (address.split('::').length > 2) return null;
  const expandSide = (side) => side ? side.split(':').flatMap((part) => {
    if (!part.includes('.')) return [part];
    if (!net.isIPv4(part)) return ['invalid'];
    const [a, b, c, d] = parseIpv4(part);
    return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
  }) : [];
  const left = expandSide(leftRaw);
  const right = expandSide(rightRaw);
  if (left.includes('invalid') || right.includes('invalid')) return null;
  const missing = 8 - left.length - right.length;
  if ((address.includes('::') && missing < 1) || (!address.includes('::') && missing !== 0)) return null;
  const parts = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
    .map((part) => Number.parseInt(part || '0', 16));
  return parts.length === 8 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? parts
    : null;
};

const mappedIpv4 = (parts) => {
  if (!parts || parts.slice(0, 5).some((part) => part !== 0) || parts[5] !== 0xffff) return '';
  return [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join('.');
};

const isPublicIpv6 = (address) => {
  const parts = expandedIpv6(address);
  if (!parts) return false;
  const mapped = mappedIpv4(parts);
  if (mapped) return isPublicIpv4(mapped);
  const first = parts[0];
  const second = parts[1];
  if (parts.every((part) => part === 0) || parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) {
    return false;
  }
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0x0064 && second === 0xff9b) return false;
  if (first === 0x0100 && second === 0 && parts.slice(2).every((part) => part === 0)) return false;
  if (first === 0x2001 && second <= 0x01ff) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2002) return false;
  return first >= 0x2000 && first <= 0x3fff;
};

const isPublicIp = (raw) => {
  const address = normalizeHostname(raw);
  if (net.isIPv4(address)) return isPublicIpv4(address);
  if (net.isIPv6(address)) return isPublicIpv6(address);
  return false;
};

const isUnsafeHostname = (raw) => {
  const hostname = normalizeHostname(raw);
  if (!hostname || net.isIP(hostname)) return true;
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata.amazonaws.com'
  ) return true;
  if (hostname.length > 253 || hostname.split('.').length < 2) return true;
  return hostname.split('.').some((label) => (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ));
};

const resolvePublicHost = async (
  rawHostname,
  { resolver = dns.promises.lookup } = {}
) => {
  const hostname = normalizeHostname(rawHostname);
  if (isUnsafeHostname(hostname)) {
    const error = new Error('FORBIDDEN_HOST');
    error.code = 'FORBIDDEN_HOST';
    throw error;
  }
  let addresses;
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    const error = new Error('DNS_FAILED');
    error.code = 'DNS_FAILED';
    throw error;
  }
  const normalized = Array.isArray(addresses)
    ? addresses.map((entry) => ({
        address: normalizeHostname(entry?.address),
        family: Number(entry?.family || net.isIP(entry?.address))
      }))
    : [];
  if (
    normalized.length === 0 ||
    normalized.some((entry) => ![4, 6].includes(entry.family) || !isPublicIp(entry.address))
  ) {
    const error = new Error('FORBIDDEN_HOST');
    error.code = 'FORBIDDEN_HOST';
    throw error;
  }
  return { hostname, addresses: normalized, selected: normalized[0] };
};

module.exports = {
  expandedIpv6,
  isPublicIp,
  isUnsafeHostname,
  normalizeHostname,
  resolvePublicHost
};

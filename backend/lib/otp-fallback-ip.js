const net = require('node:net');

// Render's public web ingress is fronted by Cloudflare, which overwrites this
// header for public ingress. This is not an authenticated header on Render's
// private network; deployment is blocked unless that ingress is ruled out.
// The edge peer may be a shared upstream proxy. Never replace it with an
// attacker-controlled X-Forwarded-For value.
const getRenderFallbackQuotaIp = (req, env = process.env) => {
  if (String(env.RENDER || '').trim().toLowerCase() !== 'true') return null;
  const value = req?.headers?.['cf-connecting-ip'];
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  return net.isIP(ip) ? ip : null;
};

module.exports = { getRenderFallbackQuotaIp };

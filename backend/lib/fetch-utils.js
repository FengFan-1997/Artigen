const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

let HttpsProxyAgent = null;
try {
  const mod = require('https-proxy-agent');
  HttpsProxyAgent = mod?.HttpsProxyAgent || mod?.default || null;
} catch {}

const getProxyForUrl = (targetUrl) => {
  const u = (targetUrl || '').toString();
  const isHttps = /^https:/i.test(u);
  const isHttp = /^http:/i.test(u);
  const httpsProxy =
    process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || '';
  if (isHttps && httpsProxy) return httpsProxy;
  if (isHttp && httpProxy) return httpProxy;
  return '';
};

const buildFetchAgent = (targetUrl) => {
  const proxyUrl = getProxyForUrl(targetUrl);
  if (!proxyUrl || !HttpsProxyAgent) return undefined;
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
};

const fetchWithTimeout = async (url, options, timeoutMs, signal) => {
  const controller = new AbortController();
  const resolvedTimeoutMs = (() => {
    const n = Number(timeoutMs);
    if (!Number.isFinite(n) || n <= 0) return 120000;
    return Math.max(1000, Math.min(n, 180000));
  })();
  const timeoutId = setTimeout(() => controller.abort(), resolvedTimeoutMs);
  let off = null;
  try {
    if (signal) {
      if (signal.aborted) controller.abort();
      else {
        const onAbort = () => controller.abort();
        off = () => {
          try {
            signal.removeEventListener('abort', onAbort);
          } catch {}
        };
        try {
          signal.addEventListener('abort', onAbort, { once: true });
        } catch {}
      }
    }
    const agent = buildFetchAgent(url);
    const res = await fetch(url, { ...options, signal: controller.signal, agent });
    return res;
  } finally {
    clearTimeout(timeoutId);
    if (off) off();
  }
};

module.exports = {
  fetch,
  fetchWithTimeout,
  getProxyForUrl,
  buildFetchAgent
};

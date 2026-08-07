'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const decodeRequest = () => {
  const raw = Buffer.from(String(process.argv[2] || ''), 'base64url').toString('utf8');
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REQUEST_INVALID');
  return value;
};

const isPrivateHostname = (hostname) => {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === 'metadata.google.internal'
  ) return true;
  if (net.isIPv4(normalized)) {
    const [first, second, third] = normalized.split('.').map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first === 100 && second >= 64 && second <= 127 ||
      first === 169 && second === 254 ||
      first === 172 && second >= 16 && second <= 31 ||
      first === 192 && second === 0 && third === 0 ||
      first === 192 && second === 0 && third === 2 ||
      first === 192 && second === 88 && third === 99 ||
      first === 192 && second === 168 ||
      first === 198 && (second === 18 || second === 19) ||
      first === 198 && second === 51 && third === 100 ||
      first === 203 && second === 0 && third === 113 ||
      first >= 224
    );
  }
  if (net.isIPv6(normalized)) {
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return net.isIPv4(mapped) ? isPrivateHostname(mapped) : true;
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('64:ff9b:')
    );
  }
  return false;
};

const isBrowserTargetAllowed = (
  rawUrl,
  { allowedOrigins = [], topLevel = false } = {}
) => {
  if (topLevel && rawUrl === 'about:blank') return true;
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password || net.isIP(parsed.hostname)) return false;
  if (isPrivateHostname(parsed.hostname)) return false;
  const allowlist = new Set(Array.isArray(allowedOrigins) ? allowedOrigins : []);
  return !topLevel || allowlist.has(parsed.origin);
};

const main = async () => {
  const request = decodeRequest();
  const { chromium } = require('playwright-core');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('BROWSER_CONTEXT_MISSING');
  const pages = context.pages();
  const page = pages.at(-1) || await context.newPage();
  const allowedOrigins = new Set(
    Array.isArray(request.allowedOrigins) ? request.allowedOrigins : []
  );
  const navigationGuard = async (route) => {
    const networkRequest = route.request();
    const topLevel = networkRequest.isNavigationRequest() &&
      networkRequest.frame() === networkRequest.frame().page().mainFrame();
    if (!isBrowserTargetAllowed(networkRequest.url(), {
      allowedOrigins: [...allowedOrigins],
      topLevel
    })) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };
  await context.route('**/*', navigationGuard);
  if (request.action === 'navigate') {
    await page.goto(String(request.url || ''), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    });
  } else if (request.action === 'describe') {
    const locator = page.locator(String(request.selector || '')).first();
    const elementText = await locator.innerText({ timeout: 10_000 }).catch(() => '');
    const href = await locator.getAttribute('href').catch(() => null);
    const metadata = await locator.evaluate((element) => {
      const form = element instanceof HTMLFormElement ? element : element.closest('form');
      const input = element instanceof HTMLInputElement ? element : null;
      const button = element instanceof HTMLButtonElement ? element : null;
      const inputType = String(input?.type || button?.type || '').toLowerCase();
      const autocomplete = String(input?.autocomplete || '').toLowerCase();
      return {
        tagName: String(element.tagName || '').toLowerCase(),
        inputType,
        autocomplete,
        formAction: form?.action || '',
        formMethod: String(form?.method || '').toUpperCase(),
        isSubmit: inputType === 'submit' || inputType === 'image' ||
          element.getAttribute('role') === 'button' && Boolean(form),
        sensitive: inputType === 'password' || autocomplete === 'one-time-code'
      };
    }, { timeout: 10_000 }).catch(() => ({}));
    const result = {
      ok: true,
      url: page.url(),
      title: (await page.title()).slice(0, 500),
      text: (await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')).slice(0, 20_000),
      elementText: String(elementText || '').slice(0, 1000),
      href,
      ...metadata
    };
    await context.unroute('**/*', navigationGuard);
    process.stdout.write(JSON.stringify(result), () => process.exit(0));
    return;
  } else if (request.action === 'click') {
    const locator = page.locator(String(request.selector || '')).first();
    const href = await locator.getAttribute('href').catch(() => null);
    if (href && !isBrowserTargetAllowed(new URL(href, page.url()).href, {
      allowedOrigins: [...allowedOrigins],
      topLevel: true
    })) {
      throw new Error('ORIGIN_FORBIDDEN');
    }
    const downloadPromise = page.waitForEvent('download', { timeout: 2500 }).catch(() => null);
    await locator.click({ timeout: 15_000 });
    const download = await downloadPromise;
    if (download) {
      const suggested = path.basename(String(download.suggestedFilename() || 'download.bin'))
        .replace(/[^A-Za-z0-9._@+ -]/g, '_')
        .slice(0, 180) || 'download.bin';
      const staging = path.join('/tmp/artigen-browser-downloads', `${process.pid}-${suggested}`);
      const destination = path.join('/tmp/artigen-workspace/downloads', suggested);
      await download.saveAs(staging);
      const stat = fs.statSync(staging);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 40 * 1024 * 1024) {
        fs.rmSync(staging, { force: true });
        throw new Error('DOWNLOAD_SIZE_INVALID');
      }
      const scan = spawnSync('clamscan', ['--no-summary', staging], {
        stdio: 'ignore',
        timeout: 120_000
      });
      if (scan.status !== 0) {
        fs.rmSync(staging, { force: true });
        throw new Error('DOWNLOAD_MALWARE_DETECTED');
      }
      fs.renameSync(staging, destination);
      request.download = { filename: suggested, path: destination, byteSize: stat.size };
    }
  } else if (request.action === 'fill') {
    await page.locator(String(request.selector || '')).first().fill(
      String(request.text || ''),
      { timeout: 15_000 }
    );
  } else if (request.action !== 'snapshot') {
    throw new Error('ACTION_UNSUPPORTED');
  }
  await page.waitForTimeout(250);
  const result = {
    ok: true,
    url: page.url(),
    title: (await page.title()).slice(0, 500),
    text: (await page.locator('body').innerText({ timeout: 10_000 })).slice(0, 20_000),
    elementText: '',
    href: null,
    download: request.download || null
  };
  await context.unroute('**/*', navigationGuard);
  // Exiting the short-lived helper process disconnects CDP without closing the
  // persisted Chromium instance that backs takeover and subsequent DOM calls.
  process.stdout.write(JSON.stringify(result), () => process.exit(0));
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      String(error?.message || error).slice(0, 500),
      () => process.exit(1)
    );
  });
}

module.exports = {
  isBrowserTargetAllowed,
  isPrivateHostname
};

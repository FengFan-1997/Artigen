const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertPinnedRemoteUrl,
  fetchRemoteImageWithPinnedDns,
  isPrivateIp,
  validateRemoteImageMime
} = require('../lib/remote-image-guard');

const headers = (values = {}) => ({
  get(name) {
    return values[String(name || '').toLowerCase()] || null;
  }
});

const resolveWithAgent = (agent, hostname) => new Promise((resolve, reject) => {
  const lookup = agent?.options?.lookup;
  if (typeof lookup !== 'function') return reject(new Error('PINNED_LOOKUP_MISSING'));
  lookup(hostname, {}, (error, address, family) => {
    if (error) reject(error);
    else resolve({ address, family });
  });
});

test('image proxy production mode fails closed without a host allowlist', async () => {
  let resolverCalls = 0;
  await assert.rejects(
    assertPinnedRemoteUrl('https://images.example/result.png', {
      env: { NODE_ENV: 'production' },
      resolver: async () => {
        resolverCalls += 1;
        return [{ address: '93.184.216.34', family: 4 }];
      }
    }),
    { code: 'PROXY_IMAGE_HOSTS_NOT_CONFIGURED', status: 503 }
  );
  assert.equal(resolverCalls, 0);
});

test('image proxy pins the validated address and cannot perform a second DNS rebind', async () => {
  let resolverCalls = 0;
  let fetchCalls = 0;
  const result = await fetchRemoteImageWithPinnedDns({
    startUrl: 'https://cdn.images.example/result.png',
    env: { NODE_ENV: 'production', PROXY_IMAGE_ALLOWED_HOSTS: 'images.example' },
    resolver: async () => {
      resolverCalls += 1;
      return [{ address: '93.184.216.34', family: 4 }];
    },
    fetcher: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url, 'https://cdn.images.example/result.png');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.disableProxy, true);
      assert.deepEqual(
        await resolveWithAgent(options.agent, 'cdn.images.example'),
        { address: '93.184.216.34', family: 4 }
      );
      return { ok: true, status: 200, headers: headers(), body: null };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(resolverCalls, 1);
  assert.equal(fetchCalls, 1);
});

test('image proxy revalidates redirects and never fetches a private redirect target', async () => {
  let fetchCalls = 0;
  const result = await fetchRemoteImageWithPinnedDns({
    startUrl: 'https://cdn.images.example/redirect',
    env: { NODE_ENV: 'production', PROXY_IMAGE_ALLOWED_HOSTS: 'images.example' },
    resolver: async (hostname) => hostname === 'cdn.images.example'
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }],
    fetcher: async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 302,
        headers: headers({ location: 'https://private.images.example/admin.png' }),
        body: { destroy() {} }
      };
    }
  });
  assert.deepEqual(
    { ok: result.ok, error: result.error, status: result.status },
    { ok: false, error: 'FORBIDDEN_HOST', status: 403 }
  );
  assert.equal(fetchCalls, 1);
});

test('image proxy blocks private, carrier-grade, mapped and reserved addresses', () => {
  for (const address of [
    '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.31.255.255', '192.168.1.1', '198.18.0.1', '::1',
    '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1'
  ]) assert.equal(isPrivateIp(address), true, address);
  assert.equal(isPrivateIp('93.184.216.34'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('image proxy requires an image Content-Type and matching magic bytes', () => {
  const png = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  assert.equal(validateRemoteImageMime('image/png', png), 'image/png');
  assert.equal(validateRemoteImageMime('image/png; charset=binary', png), 'image/png');
  assert.equal(validateRemoteImageMime('text/html', png), '');
  assert.equal(validateRemoteImageMime('application/octet-stream', png), '');
  assert.equal(validateRemoteImageMime('image/jpeg', png), '');
  assert.equal(validateRemoteImageMime('image/png', Buffer.from('<script>alert(1)</script>')), '');
});

const assert = require('node:assert/strict');
const test = require('node:test');

const { createLedger } = require('../lib/usageLedger');

test('server analytics drops credentials, image references, filenames and raw text', () => {
  let stored = { v: 1, items: [] };
  const ledger = createLedger({
    readJson: () => stored,
    writeJson: (_file, value) => { stored = value; },
    ANALYTICS_EVENTS_FILE: 'events.json',
    USAGE_LEDGER_FILE: 'usage.json',
    getClientIp: () => '127.0.0.1'
  });

  const item = ledger.appendAnalyticsEvent({
    eventType: 'ui_click',
    payload: {
      token: 'bearer-secret',
      signature: 'signed-secret',
      prompt: 'private prompt',
      userText: 'private user text',
      fileName: 'private-family-photo.png',
      imageUrl: 'https://cdn.example/private.png',
      target: 'private free form value',
      toolId: 'image-batch',
      pagePath: 'https://app.example/tools?tool=resize&img=https%3A%2F%2Fcdn.example%2Fa.png&token=secret'
    },
    path: '/editor?tool=crop&image=data&signature=secret',
    location: 'https://app.example/editor?lang=zh&token=secret',
    referrer: 'https://search.example/results?utm_source=test&image=https%3A%2F%2Fcdn.example%2Fp.png',
    pageContext: [{ tag: 'button', text: 'private label', selector: 'text:private label' }],
    requestSource: 'site_analytics',
    req: { headers: {} }
  });

  assert.deepEqual(item.payload, {
    toolId: 'image-batch',
    pagePath: '/tools?tool=resize'
  });
  assert.equal(item.path, '/editor?tool=crop');
  assert.equal(item.location, '/editor?lang=zh');
  assert.equal(item.referrer, '/results?utm_source=test');
  assert.equal('pageContext' in item, false);
  const serialized = JSON.stringify(stored);
  for (const secret of [
    'bearer-secret', 'signed-secret', 'private prompt', 'private user text',
    'private-family-photo.png', 'cdn.example', 'private label'
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

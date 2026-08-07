const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  KEYSYM,
  RFB_VERSION,
  RfbByteReader,
  keyEventBuffer
} = require('../scripts/lib/rfb-smoke-client');

test('RFB smoke key events use the protocol key-event frame', () => {
  const down = keyEventBuffer({ down: true, keysym: KEYSYM.Enter });
  const up = keyEventBuffer({ down: false, keysym: KEYSYM.Enter });
  assert.equal(down.length, 8);
  assert.equal(down[0], 4);
  assert.equal(down[1], 1);
  assert.equal(down.readUInt32BE(4), 0xff0d);
  assert.equal(up[1], 0);
  assert.equal(RFB_VERSION, 'RFB 003.008\n');
});

test('RFB byte reader reassembles fragmented WebSocket messages', async () => {
  const websocket = new EventEmitter();
  const reader = new RfbByteReader(websocket);
  const version = reader.read(12, 1000);
  websocket.emit('message', Buffer.from('RFB 00'));
  websocket.emit('message', Buffer.from('3.008\n'));
  assert.equal((await version).toString('ascii'), RFB_VERSION);
});

const { WebSocket } = require('ws');

const RFB_VERSION = 'RFB 003.008\n';
const KEYSYM = Object.freeze({
  ControlLeft: 0xffe3,
  Enter: 0xff0d,
  Tab: 0xff09
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const keyEventBuffer = ({ down, keysym }) => {
  const buffer = Buffer.alloc(8);
  buffer[0] = 4;
  buffer[1] = down ? 1 : 0;
  buffer.writeUInt32BE(Number(keysym) >>> 0, 4);
  return buffer;
};

class RfbByteReader {
  constructor(websocket) {
    this.websocket = websocket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    websocket.on('message', (data) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
      this.flush();
    });
  }

  flush() {
    while (this.waiters.length && this.buffer.length >= this.waiters[0].length) {
      const waiter = this.waiters.shift();
      const chunk = this.buffer.subarray(0, waiter.length);
      this.buffer = this.buffer.subarray(waiter.length);
      waiter.resolve(chunk);
    }
  }

  read(length, timeoutMs = 10_000) {
    if (this.buffer.length >= length) {
      const chunk = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(length);
      return Promise.resolve(chunk);
    }
    return new Promise((resolve, reject) => {
      const waiter = { length, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('AGENT_RFB_READ_TIMEOUT'));
      }, timeoutMs);
      waiter.timer.unref?.();
      waiter.resolve = (value) => {
        clearTimeout(waiter.timer);
        resolve(value);
      };
      this.waiters.push(waiter);
      this.flush();
    });
  }

  fail(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

class RfbSmokeClient {
  constructor({ websocket, reader, width, height, name }) {
    this.websocket = websocket;
    this.reader = reader;
    this.width = width;
    this.height = height;
    this.name = name;
  }

  sendKey(keysym, down) {
    if (this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('AGENT_RFB_SOCKET_CLOSED');
    }
    this.websocket.send(keyEventBuffer({ down, keysym }));
  }

  async press(keysym, delayMs = 25) {
    this.sendKey(keysym, true);
    await sleep(delayMs);
    this.sendKey(keysym, false);
    await sleep(delayMs);
  }

  async chord(modifier, keysym, delayMs = 25) {
    this.sendKey(modifier, true);
    await sleep(delayMs);
    await this.press(keysym, delayMs);
    this.sendKey(modifier, false);
    await sleep(delayMs);
  }

  async type(text, delayMs = 20) {
    for (const character of String(text || '')) {
      const codePoint = character.codePointAt(0);
      if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
        throw new Error('AGENT_RFB_TEXT_INVALID');
      }
      await this.press(codePoint, delayMs);
    }
  }

  close() {
    if (this.websocket.readyState < WebSocket.CLOSING) {
      this.websocket.close(1000, 'smoke complete');
    }
  }

  terminate() {
    this.websocket.terminate();
  }
}

const openWebSocket = ({ url, origin, authorization, timeoutMs }) => new Promise((resolve, reject) => {
  const headers = { Origin: origin };
  if (authorization) headers.Authorization = authorization;
  const websocket = new WebSocket(url, {
    headers,
    maxPayload: 8 * 1024 * 1024
  });
  const timer = setTimeout(() => {
    websocket.terminate();
    reject(new Error('AGENT_RFB_CONNECT_TIMEOUT'));
  }, timeoutMs);
  timer.unref?.();
  websocket.once('open', () => {
    clearTimeout(timer);
    resolve(websocket);
  });
  websocket.once('unexpected-response', (_request, response) => {
    clearTimeout(timer);
    response.resume();
    reject(new Error(`AGENT_RFB_HTTP_${response.statusCode || 0}`));
  });
  websocket.once('error', () => {
    clearTimeout(timer);
    reject(new Error('AGENT_RFB_WEBSOCKET_FAILED'));
  });
});

const connectRfb = async ({
  url,
  origin,
  authorization,
  timeoutMs = 30_000
}) => {
  const websocket = await openWebSocket({ url, origin, authorization, timeoutMs });
  const reader = new RfbByteReader(websocket);
  websocket.once('close', () => reader.fail(new Error('AGENT_RFB_SOCKET_CLOSED')));
  websocket.once('error', () => reader.fail(new Error('AGENT_RFB_WEBSOCKET_FAILED')));
  try {
    const version = (await reader.read(12, timeoutMs)).toString('ascii');
    if (version !== RFB_VERSION) throw new Error('AGENT_RFB_VERSION_INVALID');
    websocket.send(Buffer.from(RFB_VERSION, 'ascii'));

    const securityCount = (await reader.read(1, timeoutMs))[0];
    if (!securityCount) {
      const reasonLength = (await reader.read(4, timeoutMs)).readUInt32BE(0);
      if (reasonLength) await reader.read(reasonLength, timeoutMs);
      throw new Error('AGENT_RFB_SECURITY_UNAVAILABLE');
    }
    const securityTypes = await reader.read(securityCount, timeoutMs);
    if (!securityTypes.includes(1)) throw new Error('AGENT_RFB_SECURITY_UNSUPPORTED');
    websocket.send(Buffer.from([1]));
    const securityResult = (await reader.read(4, timeoutMs)).readUInt32BE(0);
    if (securityResult !== 0) throw new Error('AGENT_RFB_SECURITY_FAILED');

    websocket.send(Buffer.from([1]));
    const serverInit = await reader.read(24, timeoutMs);
    const width = serverInit.readUInt16BE(0);
    const height = serverInit.readUInt16BE(2);
    const nameLength = serverInit.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || nameLength > 4096) {
      throw new Error('AGENT_RFB_SERVER_INIT_INVALID');
    }
    const name = nameLength
      ? (await reader.read(nameLength, timeoutMs)).toString('utf8').slice(0, 200)
      : '';
    return new RfbSmokeClient({ websocket, reader, width, height, name });
  } catch (error) {
    websocket.terminate();
    throw error;
  }
};

module.exports = {
  KEYSYM,
  RFB_VERSION,
  RfbByteReader,
  RfbSmokeClient,
  connectRfb,
  keyEventBuffer,
  sleep
};

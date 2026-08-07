const crypto = require('crypto');
const net = require('net');
const { WebSocket } = require('ws');
const { getAgentConfig } = require('./agent-config');
const { workerSignature } = require('./agent-desktop-relay-service');

const relayEndpoint = (value, { production = false } = {}) => {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    return null;
  }
  if (
    !['ws:', 'wss:'].includes(parsed.protocol) ||
    (production && parsed.protocol !== 'wss:') ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    !parsed.pathname.endsWith('/worker')
  ) return null;
  return parsed.toString();
};

class AgentDesktopRelayClient {
  constructor({ pool, sandbox, workerId, env = process.env } = {}) {
    this.pool = pool;
    this.sandbox = sandbox;
    this.workerId = workerId;
    this.env = env;
    this.config = getAgentConfig(env);
    this.endpoint = relayEndpoint(this.config.workerRelayUrl, {
      production: String(env.NODE_ENV || '').trim() === 'production'
    });
    this.ready = Boolean(
      this.pool &&
      this.sandbox?.desktopEndpoint &&
      this.endpoint &&
      Buffer.byteLength(this.config.workerRelaySecret, 'utf8') >= 32
    );
    this.started = false;
    this.timer = null;
    this.polling = false;
    this.active = new Map();
  }

  async poll() {
    if (!this.ready || this.polling) return;
    this.polling = true;
    try {
      const result = await this.pool.query(
        `WITH candidate AS (
           SELECT id FROM agent_desktop_tickets
            WHERE worker_id=$1
              AND consumed_at IS NOT NULL
              AND relay_started_at IS NULL
              AND closed_at IS NULL AND revoked_at IS NULL
              AND expires_at>clock_timestamp()
            ORDER BY consumed_at
            FOR UPDATE SKIP LOCKED
            LIMIT 4
         )
         UPDATE agent_desktop_tickets ticket
            SET relay_started_at=now()
           FROM candidate
          WHERE ticket.id=candidate.id
          RETURNING ticket.id,ticket.sandbox_ref`,
        [this.workerId]
      );
      for (const ticket of result.rows) this.open(ticket);
    } finally {
      this.polling = false;
    }
  }

  open(ticket) {
    if (this.active.has(ticket.id)) return;
    const state = { websocket: null, vnc: null };
    const websocket = new WebSocket(this.endpoint, { maxPayload: 1024 * 1024 });
    state.websocket = websocket;
    this.active.set(ticket.id, state);
    const close = () => {
      if (this.active.get(ticket.id) !== state) return;
      this.active.delete(ticket.id);
      if (state.vnc && !state.vnc.destroyed) state.vnc.destroy();
      if (websocket.readyState < WebSocket.CLOSING) websocket.close();
      void this.pool.query(
        'UPDATE agent_desktop_tickets SET closed_at=COALESCE(closed_at,now()) WHERE id=$1',
        [ticket.id]
      ).catch(() => {});
    };
    const report = (code) => {
      console.warn(`Agent desktop relay client status: ${String(code || 'UNKNOWN').slice(0, 100)}`);
    };
    websocket.once('open', () => {
      const timestamp = Date.now();
      const nonce = crypto.randomBytes(24).toString('base64url');
      websocket.send(JSON.stringify({
        ticketId: ticket.id,
        workerId: this.workerId,
        timestamp,
        nonce,
        signature: workerSignature({
          ticketId: ticket.id,
          workerId: this.workerId,
          timestamp,
          nonce,
          secret: this.config.workerRelaySecret
        })
      }));
    });
    let relayReady = false;
    websocket.on('message', async (data, isBinary) => {
      if (!relayReady) {
        if (isBinary) return close();
        let message;
        try {
          message = JSON.parse(data.toString('utf8'));
        } catch {
          return close();
        }
        if (message?.type !== 'relay.ready' || message?.ticketId !== ticket.id) return close();
        relayReady = true;
        let endpoint;
        try {
          endpoint = await this.sandbox.desktopEndpoint(ticket.sandbox_ref);
        } catch {
          report('DESKTOP_ENDPOINT_UNAVAILABLE');
          return close();
        }
        const vnc = net.connect({ host: endpoint.host, port: endpoint.port });
        state.vnc = vnc;
        vnc.setTimeout(60_000);
        vnc.on('data', (chunk) => {
          if (websocket.readyState === WebSocket.OPEN) websocket.send(chunk, { binary: true });
        });
        vnc.on('timeout', () => {
          report('VNC_TIMEOUT');
          close();
        });
        vnc.on('error', (error) => {
          report(`VNC_ERROR_${error?.code || 'UNKNOWN'}`);
          close();
        });
        vnc.on('close', close);
        return;
      }
      if (!state.vnc || state.vnc.destroyed) return close();
      state.vnc.write(data);
    });
    websocket.on('error', (error) => {
      report(`WEBSOCKET_ERROR_${error?.code || 'UNKNOWN'}`);
      close();
    });
    websocket.on('close', (code) => {
      if (!relayReady) report(`WEBSOCKET_CLOSED_${Number(code || 0)}`);
      close();
    });
  }

  async start() {
    if (this.started || !this.ready) return this.ready;
    this.started = true;
    await this.poll();
    this.timer = setInterval(() => {
      void this.poll().catch((error) => {
        console.error('Agent desktop relay poll failed', error?.code || error?.message);
      });
    }, 1000);
    this.timer.unref?.();
    return true;
  }

  async stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const state of this.active.values()) {
      state.vnc?.destroy();
      if (state.websocket?.readyState < WebSocket.CLOSING) state.websocket.close();
    }
    this.active.clear();
  }
}

module.exports = {
  AgentDesktopRelayClient,
  relayEndpoint
};

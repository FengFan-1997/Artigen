const crypto = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');
const { isDatabaseConfigured, getPool } = require('../db/pool');
const { getAgentConfig } = require('./agent-config');

const VIEWER_PATH = '/api/agent-desktop/viewer';
const WORKER_PATH = '/api/agent-desktop/worker';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,86}$/;

const relayStatus = (code) => {
  console.warn(`Agent desktop relay status: ${String(code || 'UNKNOWN').slice(0, 100)}`);
};

const configuredViewerOrigins = (env = process.env) => new Set([
  env.APP_ORIGIN,
  env.PUBLIC_ORIGIN,
  ...String(env.CORS_ORIGIN || env.CORS_ORIGINS || '').split(',')
].map((value) => String(value || '').trim().replace(/\/+$/, '')).filter((value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}));

const viewerOriginAllowed = (origin, env = process.env) => {
  let parsed;
  try {
    parsed = new URL(String(origin || ''));
  } catch {
    return false;
  }
  const normalized = parsed.origin;
  const configured = configuredViewerOrigins(env);
  if (configured.size) return configured.has(normalized);
  if (String(env.NODE_ENV || '').trim() === 'production') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
};

const workerSignature = ({ ticketId, workerId, timestamp, nonce, secret }) => crypto
  .createHmac('sha256', String(secret || ''))
  .update(`${ticketId}.${workerId}.${timestamp}.${nonce}`, 'utf8')
  .digest('hex');

const signaturesEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
};

const consumeViewerTicket = async (pool, token) => {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest();
  const result = await pool.query(
    `WITH candidate AS (
       SELECT ticket.id
         FROM agent_desktop_tickets ticket
         JOIN agent_runs run ON run.id=ticket.run_id
         JOIN agent_approvals approval ON approval.id=ticket.approval_id
        WHERE ticket.token_hash=$1
          AND ticket.consumed_at IS NULL
          AND ticket.revoked_at IS NULL
          AND ticket.closed_at IS NULL
          AND ticket.expires_at>clock_timestamp()
          AND run.status='waiting_user'
          AND run.sandbox_ref=ticket.sandbox_ref
          AND run.sandbox_worker_id=ticket.worker_id
          AND approval.status='pending'
          AND approval.risk_level='blocked'
          AND approval.expires_at>clock_timestamp()
        FOR UPDATE OF ticket
     )
     UPDATE agent_desktop_tickets ticket
        SET consumed_at=now()
       FROM candidate
      WHERE ticket.id=candidate.id
      RETURNING ticket.id,ticket.run_id,ticket.user_id,ticket.approval_id,
                ticket.worker_id,ticket.sandbox_ref,ticket.expires_at`,
    [tokenHash]
  );
  return result.rows[0] || null;
};

const closeTicket = async (pool, ticketId) => {
  await pool.query(
    `UPDATE agent_desktop_tickets
        SET closed_at=COALESCE(closed_at,now())
      WHERE id=$1`,
    [ticketId]
  ).catch(() => {});
};

const validateWorkerClaim = async (pool, message, env = process.env) => {
  const ticketId = String(message?.ticketId || '').trim();
  const workerId = String(message?.workerId || '').trim();
  const nonce = String(message?.nonce || '').trim();
  const signature = String(message?.signature || '').trim().toLowerCase();
  const timestamp = Number(message?.timestamp || 0);
  // Use the same resolver as the Mac relay client so local DEV can source the
  // shared secret from Keychain while Render can supply the environment value.
  const secret = String(getAgentConfig(env).workerRelaySecret || '').trim();
  if (
    !UUID_RE.test(ticketId) ||
    !workerId || workerId.length > 160 ||
    !NONCE_RE.test(nonce) ||
    !Number.isInteger(timestamp) ||
    Math.abs(Date.now() - timestamp) > 30_000 ||
    Buffer.byteLength(secret, 'utf8') < 32
  ) return null;
  const expected = workerSignature({ ticketId, workerId, timestamp, nonce, secret });
  if (!signaturesEqual(signature, expected)) return null;
  const result = await pool.query(
    `SELECT ticket.id,ticket.run_id,ticket.worker_id,ticket.sandbox_ref
       FROM agent_desktop_tickets ticket
       JOIN agent_runs run ON run.id=ticket.run_id
       JOIN agent_approvals approval ON approval.id=ticket.approval_id
      WHERE ticket.id=$1 AND ticket.worker_id=$2
        AND ticket.consumed_at IS NOT NULL
        AND ticket.relay_started_at IS NOT NULL
        AND ticket.closed_at IS NULL AND ticket.revoked_at IS NULL
        AND ticket.expires_at>clock_timestamp()
        AND run.status='waiting_user'
        AND approval.status='pending' AND approval.risk_level='blocked'
      LIMIT 1`,
    [ticketId, workerId]
  );
  return result.rows[0] || null;
};

const createAgentDesktopRelay = ({
  server,
  pool = isDatabaseConfigured() ? getPool() : null,
  env = process.env
} = {}) => {
  if (!server || typeof server.on !== 'function') {
    throw new TypeError('AGENT_DESKTOP_RELAY_SERVER_REQUIRED');
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const viewers = new Map();
  const sessions = new Map();
  const maxSessionMs = Math.max(
    60_000,
    Math.min(20 * 60_000, Number(env.AGENT_DESKTOP_SESSION_MAX_MS || 15 * 60_000) || 15 * 60_000)
  );

  const endSession = (ticketId, code = 1000, reason = 'closed') => {
    const session = sessions.get(ticketId);
    const viewer = session?.viewer || viewers.get(ticketId)?.socket;
    const worker = session?.worker;
    sessions.delete(ticketId);
    viewers.delete(ticketId);
    for (const socket of [viewer, worker]) {
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(code, reason);
    }
    if (pool) void closeTicket(pool, ticketId);
  };

  const pair = (ticketId, workerSocket) => {
    const waiting = viewers.get(ticketId);
    if (!waiting || waiting.socket.readyState !== WebSocket.OPEN) {
      relayStatus('WORKER_VIEWER_UNAVAILABLE');
      workerSocket.close(1008, 'viewer unavailable');
      return;
    }
    viewers.delete(ticketId);
    const viewerSocket = waiting.socket;
    const session = { viewer: viewerSocket, worker: workerSocket };
    sessions.set(ticketId, session);
    relayStatus('SESSION_PAIRED');
    workerSocket.send(JSON.stringify({ type: 'relay.ready', ticketId }));
    const forward = (target) => (data, isBinary) => {
      if (target.readyState === WebSocket.OPEN) target.send(data, { binary: isBinary });
    };
    viewerSocket.on('message', forward(workerSocket));
    workerSocket.on('message', forward(viewerSocket));
    viewerSocket.once('close', () => endSession(ticketId, 1000, 'viewer closed'));
    workerSocket.once('close', () => endSession(ticketId, 1011, 'worker closed'));
    const timer = setTimeout(() => endSession(ticketId, 1000, 'session expired'), maxSessionMs);
    timer.unref?.();
  };

  const acceptViewer = async (request, socket, head, url) => {
    if (!pool) {
      relayStatus('VIEWER_DATABASE_UNAVAILABLE');
      socket.destroy();
      return;
    }
    if (!viewerOriginAllowed(request.headers.origin, env)) {
      relayStatus('VIEWER_ORIGIN_REJECTED');
      socket.destroy();
      return;
    }
    const ticket = await consumeViewerTicket(pool, url.searchParams.get('ticket'));
    if (!ticket) {
      relayStatus('VIEWER_TICKET_REJECTED');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (viewerSocket) => {
      viewers.set(ticket.id, { socket: viewerSocket, ticket });
      viewerSocket.once('close', () => {
        if (viewers.get(ticket.id)?.socket === viewerSocket) {
          viewers.delete(ticket.id);
          void closeTicket(pool, ticket.id);
        }
      });
      const timer = setTimeout(() => {
        if (viewers.has(ticket.id)) endSession(ticket.id, 1013, 'worker timeout');
      }, 20_000);
      timer.unref?.();
    });
  };

  const acceptWorker = (request, socket, head) => {
    if (!pool) return socket.destroy();
    wss.handleUpgrade(request, socket, head, (workerSocket) => {
      const timer = setTimeout(() => workerSocket.close(1008, 'auth timeout'), 5_000);
      timer.unref?.();
      workerSocket.once('message', async (raw, isBinary) => {
        clearTimeout(timer);
        if (isBinary) return workerSocket.close(1008, 'auth required');
        let message;
        try {
          message = JSON.parse(raw.toString('utf8'));
        } catch {
          return workerSocket.close(1008, 'auth invalid');
        }
        const claim = await validateWorkerClaim(pool, message, env).catch(() => null);
        if (!claim) {
          relayStatus('WORKER_CLAIM_REJECTED');
          return workerSocket.close(1008, 'claim invalid');
        }
        if (!viewers.has(claim.id)) {
          relayStatus('WORKER_VIEWER_NOT_WAITING');
          return workerSocket.close(1008, 'claim invalid');
        }
        pair(claim.id, workerSocket);
      });
    });
  };

  const onUpgrade = (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname === VIEWER_PATH) {
      void acceptViewer(request, socket, head, url).catch(() => socket.destroy());
      return;
    }
    if (url.pathname === WORKER_PATH) {
      acceptWorker(request, socket, head);
      return;
    }
    socket.destroy();
  };
  server.on('upgrade', onUpgrade);

  const heartbeat = setInterval(() => {
    for (const session of sessions.values()) {
      for (const socket of [session.viewer, session.worker]) {
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }
    }
  }, 20_000);
  heartbeat.unref?.();

  return {
    close() {
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      for (const ticketId of [...sessions.keys(), ...viewers.keys()]) endSession(ticketId, 1001, 'server stopping');
      wss.close();
    },
    sessions,
    viewers
  };
};

module.exports = {
  TOKEN_RE,
  VIEWER_PATH,
  WORKER_PATH,
  configuredViewerOrigins,
  consumeViewerTicket,
  createAgentDesktopRelay,
  signaturesEqual,
  validateWorkerClaim,
  viewerOriginAllowed,
  workerSignature
};

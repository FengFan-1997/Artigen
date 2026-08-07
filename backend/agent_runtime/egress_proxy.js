#!/usr/bin/env node
'use strict';

const http = require('node:http');
const net = require('node:net');
const { resolvePublicHost } = require('./public_network');

const HOST = String(process.env.ARTIGEN_EGRESS_HOST || '0.0.0.0').trim();
const PORT = Math.max(1, Math.min(65535, Number(process.env.ARTIGEN_EGRESS_PORT || 8080) || 8080));
const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;
const MAX_CONNECTIONS = 128;
const MAX_TUNNEL_BYTES = 100 * 1024 * 1024;
let activeConnections = 0;

const reject = (socket, status = 403, reason = 'Forbidden') => {
  if (!socket || socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
};

const parseAuthority = (raw) => {
  const value = String(raw || '').trim();
  if (!value || /[\s/@?#\\]/.test(value)) throw new Error('INVALID_TARGET');
  let parsed;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new Error('INVALID_TARGET');
  }
  const port = Number(parsed.port || 443);
  if (parsed.protocol !== 'https:' || port !== 443 || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('FORBIDDEN_PORT');
  }
  if (parsed.username || parsed.password || net.isIP(parsed.hostname)) throw new Error('FORBIDDEN_HOST');
  return { hostname: parsed.hostname, port };
};

const server = http.createServer((_request, response) => {
  response.writeHead(403, { Connection: 'close', 'Content-Length': '0' });
  response.end();
});

server.on('connect', async (request, clientSocket, head) => {
  if (activeConnections >= MAX_CONNECTIONS) return reject(clientSocket, 503, 'Busy');
  activeConnections += 1;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    activeConnections = Math.max(0, activeConnections - 1);
  };
  clientSocket.once('close', finish);
  try {
    const target = parseAuthority(request.url);
    const resolved = await resolvePublicHost(target.hostname);
    const upstream = net.connect({
      host: resolved.selected.address,
      port: target.port,
      family: resolved.selected.family
    });
    upstream.setTimeout(IDLE_TIMEOUT_MS);
    clientSocket.setTimeout(IDLE_TIMEOUT_MS);
    const timer = setTimeout(() => upstream.destroy(new Error('CONNECT_TIMEOUT')), CONNECT_TIMEOUT_MS);
    timer.unref?.();
    let bytes = 0;
    const countBytes = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_TUNNEL_BYTES) {
        upstream.destroy(new Error('TUNNEL_LIMIT'));
        clientSocket.destroy();
      }
    };
    upstream.once('connect', () => {
      clearTimeout(timer);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: Artigen-Egress/1\r\n\r\n');
      if (head?.length) upstream.write(head);
      clientSocket.on('data', countBytes);
      upstream.on('data', countBytes);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.on('timeout', () => upstream.destroy());
    clientSocket.on('timeout', () => clientSocket.destroy());
    upstream.once('error', () => {
      clearTimeout(timer);
      if (!clientSocket.destroyed) reject(clientSocket, 502, 'Bad Gateway');
    });
    upstream.once('close', () => {
      if (!clientSocket.destroyed) clientSocket.destroy();
    });
  } catch (error) {
    reject(clientSocket, error?.code === 'DNS_FAILED' ? 502 : 403, 'Forbidden');
  }
});

server.on('clientError', (_error, socket) => reject(socket, 400, 'Bad Request'));
server.listen(PORT, HOST, () => {
  process.stdout.write(`Artigen restricted egress listening on ${HOST}:${PORT}\n`);
});

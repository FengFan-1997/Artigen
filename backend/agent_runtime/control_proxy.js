'use strict';

const net = require('node:net');

const target = String(process.env.ARTIGEN_CONTROL_TARGET || '').trim();
const ports = String(process.env.ARTIGEN_CONTROL_PORTS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1024 && value <= 65535);

if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(target) || !ports.length) {
  process.stderr.write('ARTIGEN_CONTROL_PROXY_CONFIG_INVALID\n');
  process.exit(1);
}

const uniquePorts = [...new Set(ports)];
let active = 0;
const maximumConnections = 64;

for (const port of uniquePorts) {
  const server = net.createServer((client) => {
    if (active >= maximumConnections) {
      client.destroy();
      return;
    }
    active += 1;
    const upstream = net.connect({ host: target, port });
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.setTimeout(5 * 60_000, close);
    upstream.setTimeout(5 * 60_000, close);
    client.on('error', close);
    upstream.on('error', close);
    client.once('close', () => {
      active = Math.max(0, active - 1);
      upstream.destroy();
    });
    upstream.once('close', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.maxConnections = maximumConnections;
  server.listen(port, '0.0.0.0');
}

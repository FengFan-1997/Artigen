const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Duplex } = require('node:stream');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const { createEgressProxyServer } = require('../agent_runtime/egress_proxy');

const createUpstream = () => {
  const upstream = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    }
  });
  upstream.setTimeout = () => upstream;
  process.nextTick(() => upstream.emit('connect'));
  return upstream;
};

const connectToProxy = ({ port, reset = false }) => new Promise((resolve, reject) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  const timer = setTimeout(() => {
    socket.destroy();
    reject(new Error('EGRESS_PROXY_TEST_TIMEOUT'));
  }, 2_000);
  socket.once('error', reset ? () => {} : reject);
  socket.once('connect', () => {
    socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
    if (reset) {
      socket.resetAndDestroy();
      clearTimeout(timer);
      resolve('reset');
    }
  });
  socket.once('data', (chunk) => {
    clearTimeout(timer);
    const response = chunk.toString('utf8');
    socket.destroy();
    resolve(response);
  });
});

test('repeated reset CONNECT tunnels cannot terminate the restricted egress proxy', async (t) => {
  const upstreams = [];
  const server = createEgressProxyServer({
    resolveHost: async () => ({ selected: { address: '203.0.113.10', family: 4 } }),
    connect: () => {
      const upstream = createUpstream();
      upstreams.push(upstream);
      return upstream;
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    for (const upstream of upstreams) upstream.destroy();
    server.closeAllConnections?.();
    server.close();
  });
  const { port } = server.address();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await connectToProxy({ port, reset: true });
  }
  const response = await connectToProxy({ port });

  assert.match(response, /^HTTP\/1\.1 200 Connection Established/m);
  assert.equal(server.listening, true);
});

test('the Cua bridge mounts the exact Worker egress proxy into the policy sidecar read-only', () => {
  const bridgePath = path.resolve(__dirname, '../agent_runtime/cua_bridge.py');
  const proxyPath = path.resolve(__dirname, '../agent_runtime/egress_proxy.js');
  const script = [
    'import importlib.util,json,sys,types',
    'spec=importlib.util.spec_from_file_location("cua_bridge_test",sys.argv[1])',
    'module=importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'calls=[]',
    'def fake(*args,**kwargs):',
    '  calls.append(list(args))',
    '  return types.SimpleNamespace(stdout="true\\n",stderr="",returncode=0)',
    'module.docker_run=fake',
    'module.prepare_egress("artigen-test-sandbox","artigen/test-image")',
    'print(json.dumps(calls))'
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, bridgePath], {
    encoding: 'utf8',
    timeout: 5_000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = JSON.parse(result.stdout);
  const run = calls.find((entry) => entry[0] === 'run');
  assert.ok(run);
  const mount = run[run.indexOf('--mount') + 1];
  assert.equal(
    mount,
    `type=bind,source=${proxyPath},target=/opt/artigen/egress_proxy.js,readonly`
  );
  assert.equal(run.at(-1), '/opt/artigen/egress_proxy.js');
});

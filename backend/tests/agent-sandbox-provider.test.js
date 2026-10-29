const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const { runBridge } = require('../services/agent-sandbox-provider');

test('CUA bridge PATH includes its Python venv for launchd workers', async () => {
  const config = {
    cuaPython: '/worker/backend/.venv-agent/bin/python',
    cuaApiKey: ''
  };
  const dockerConfigDir = '/worker/tmp/artigen-agent-dev-docker-config-fixture';
  let childEnvironment;
  const spawnImpl = (_command, _args, options) => {
    childEnvironment = options.env;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end() {
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('{"ok":true}'));
          child.emit('close', 0);
        });
      }
    };
    child.kill = () => {};
    return child;
  };

  const result = await runBridge({
    payload: { command: 'doctor' },
    config,
    dockerConfigDir,
    spawnImpl
  });

  const pathEntries = childEnvironment.PATH.split(path.delimiter);
  assert.equal(pathEntries[0], path.dirname(config.cuaPython));
  assert.ok(pathEntries.includes(path.resolve(__dirname, '../agent_runtime/docker-bin')));
  assert.equal(childEnvironment.DOCKER_CONFIG, dockerConfigDir);
  assert.equal(result.ok, true);
});

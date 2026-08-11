const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const BRIDGE = path.resolve(__dirname, '../agent_runtime/cua_bridge.py');

test('image-only local Cua runs still receive the restricted internal network contract', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-cua-bridge-test-'));
  const fakeCua = path.join(temporaryRoot, 'cua.py');
  const fakeDocker = path.join(temporaryRoot, 'docker');
  try {
    fs.writeFileSync(fakeCua, `
from dataclasses import dataclass
import os

@dataclass(frozen=True)
class Image:
    kind: str = "registry"

    @staticmethod
    def from_registry(_ref):
        return Image()

    @staticmethod
    def linux(kind="container"):
        return Image(kind=kind)

    def run(self, *_args):
        return self

class DockerRuntime:
    def __init__(self, **_kwargs):
        pass

class _Sandbox:
    def __init__(self, name):
        self.name = name

    async def get_dimensions(self):
        return (1280, 720)

    async def get_environment(self):
        return "linux"

    async def disconnect(self):
        return None

class Sandbox:
    @staticmethod
    async def create(**kwargs):
        if not os.environ.get("ARTIGEN_DOCKER_NETWORK"):
            raise RuntimeError("TEST_RESTRICTED_NETWORK_NOT_PREPARED")
        if os.environ.get("ARTIGEN_CUA_IMAGE_REF") != "artigen/cua-test:v2":
            raise RuntimeError("TEST_IMAGE_REF_NOT_PROPAGATED")
        return _Sandbox(kwargs.get("name"))

def check_local_support(_image):
    class Support:
        supported = True
        runtime_installed = True
        runtime_name = "docker"
        reason = ""
    return Support()
`, { mode: 0o600 });
    fs.writeFileSync(fakeDocker, `#!/bin/sh
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  printf '%s\\n' 'sha256:0123456789abcdef|v2'
elif [ "$1" = "inspect" ]; then
  printf '%s\\n' 'true'
fi
exit 0
`, { mode: 0o700 });

    const result = spawnSync('python3', [BRIDGE], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ARTIGEN_REAL_DOCKER: fakeDocker,
        PYTHONPATH: temporaryRoot
      },
      input: JSON.stringify({
        command: 'create',
        local: true,
        name: 'artigen-image-only-test',
        imageRef: 'artigen/cua-test:v2',
        kind: 'container',
        browserEnabled: false,
        egressPolicy: 'restricted-v1',
        cpu: 1,
        memoryMb: 512,
        diskGb: 2
      })
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ok, true);
    assert.equal(response.name, 'artigen-image-only-test');
    assert.equal(response.egressVerified, true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('Cua file writes split generated images below the host argument limit', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-cua-write-test-'));
  const fakeCua = path.join(temporaryRoot, 'cua.py');
  try {
    fs.writeFileSync(fakeCua, `
class _Result:
    stdout = ""
    stderr = ""
    returncode = 0
    success = True

class _Sandbox:
    def __init__(self, name):
        self.name = name
        self.shell = self

    async def run(self, script, timeout=30):
        if len(script) > 110 * 1024:
            raise RuntimeError("TEST_SHELL_ARGUMENT_TOO_LARGE")
        return _Result()

    async def disconnect(self):
        return None

class Sandbox:
    @staticmethod
    async def connect(name, **_kwargs):
        return _Sandbox(name)

class Image:
    @staticmethod
    def linux(kind="container"):
        return object()

def check_local_support(_image):
    raise RuntimeError("NOT_USED")
`, { mode: 0o600 });

    const payload = Buffer.alloc(512 * 1024, 7);
    const result = spawnSync('python3', [BRIDGE], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONPATH: temporaryRoot },
      input: JSON.stringify({
        command: 'write_file',
        local: true,
        name: 'artigen-image-write-test',
        path: '/tmp/artigen-workspace/generated-image.png',
        base64: payload.toString('base64'),
        timeout: 60
      })
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ok, true);
    assert.equal(response.bytes, payload.length);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decryptProjectPayload,
  encryptProjectPayload
} = require('../services/project-payload-service');
const {
  cleanBrandProfile,
  cleanProjectPayload,
  cleanVersionPayload,
  createCreativeProjectService
} = require('../services/creative-project-service');

const env = {
  TASK_PAYLOAD_ENCRYPTION_KEY: '12345678901234567890123456789012'
};

test('creative project payloads are encrypted with entity-bound authenticated data', () => {
  const entityId = '11111111-1111-4111-8111-111111111111';
  const payload = {
    productName: 'Ceramic cup',
    brief: 'Create a natural-light product set',
    brandProfile: {
      brandName: 'Studio',
      colors: ['#CCFF00', '#111111', '#FFFFFF'],
      styleKeywords: ['calm'],
      prohibitedElements: ['watermark'],
      logoAssetId: null
    }
  };
  const encrypted = encryptProjectPayload({
    entityType: 'project',
    entityId,
    payload,
    env,
    iv: Buffer.alloc(12, 7)
  });
  assert.equal(encrypted.ciphertext.includes(Buffer.from(payload.brief)), false);
  assert.deepEqual(decryptProjectPayload({
    entityType: 'project',
    entityId,
    record: {
      algorithm: encrypted.algorithm,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      ciphertext: encrypted.ciphertext
    },
    env
  }), payload);
  assert.throws(() => decryptProjectPayload({
    entityType: 'project',
    entityId: '22222222-2222-4222-8222-222222222222',
    record: {
      algorithm: encrypted.algorithm,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      ciphertext: encrypted.ciphertext
    },
    env
  }), { code: 'PROJECT_PAYLOAD_DECRYPT_FAILED' });
});

test('project and version contracts bound brand colors, lists and private prompt data', () => {
  assert.deepEqual(cleanProjectPayload({
    productName: '  Bottle  ',
    brief: '  Social launch  ',
    brandProfile: {
      brandName: 'North',
      colors: ['#112233', '#445566', '#778899', '#112233'],
      styleKeywords: ['clean', 'clean'],
      prohibitedElements: ['watermarks']
    }
  }), {
    productName: 'Bottle',
    brief: 'Social launch',
    brandProfile: {
      brandName: 'North',
      colors: ['#112233', '#445566', '#778899'],
      styleKeywords: ['clean'],
      prohibitedElements: ['watermarks'],
      logoAssetId: null
    }
  });
  assert.throws(() => cleanBrandProfile({ colors: ['#112233', '#445566'] }), {
    code: 'INVALID_BRAND_COLOR_COUNT'
  });
  assert.throws(() => cleanBrandProfile({ colors: ['red', '#112233', '#445566'] }), {
    code: 'INVALID_BRAND_COLOR'
  });
  assert.deepEqual(cleanVersionPayload({
    prompt: 'Preserve the supplied product identity',
    direction: {
      id: 'd1',
      title: 'Natural',
      summary: 'Soft daylight',
      prompt: 'Place the product by a window'
    }
  }).direction.title, 'Natural');
  assert.throws(() => cleanVersionPayload({ prompt: '' }), {
    code: 'INVALID_PROJECT_FIELD'
  });
});

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const createScriptedPool = (handler) => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, params });
      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }
      return handler(normalizedSql, params, calls);
    },
    release() {
      calls.push({ sql: 'RELEASE', params: [] });
    }
  };
  return {
    calls,
    pool: {
      async connect() {
        return client;
      }
    }
  };
};

test('project reads hide a project owned by another user behind PROJECT_NOT_FOUND', async () => {
  const scripted = createScriptedPool((sql) => {
    if (sql.startsWith('SELECT id FROM users WHERE id=')) {
      return { rowCount: 1, rows: [{ id: ownerId }] };
    }
    if (sql.includes('FROM creative_projects project')) {
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const service = createCreativeProjectService({ pool: scripted.pool, env });

  await assert.rejects(
    service.getProject({ userId: ownerId, projectId }),
    { status: 404, code: 'PROJECT_NOT_FOUND' }
  );
  assert.equal(scripted.calls.some((call) =>
    call.sql.includes('project.user_id=$2')
    && call.params[0] === projectId
    && call.params[1] === ownerId
  ), true);
  assert.deepEqual(
    scripted.calls.filter((call) => ['BEGIN', 'ROLLBACK', 'RELEASE'].includes(call.sql)).map((call) => call.sql),
    ['BEGIN', 'ROLLBACK', 'RELEASE']
  );
});

test('project updates reject stale revisions before rewriting encrypted data', async () => {
  const payload = {
    productName: 'Bottle',
    brief: 'Original brief',
    brandProfile: {
      brandName: '',
      colors: [],
      styleKeywords: [],
      prohibitedElements: [],
      logoAssetId: null
    }
  };
  const encrypted = encryptProjectPayload({
    entityType: 'project',
    entityId: projectId,
    payload,
    env,
    iv: Buffer.alloc(12, 5)
  });
  const scripted = createScriptedPool((sql) => {
    if (sql.startsWith('SELECT id FROM users WHERE id=')) {
      return { rowCount: 1, rows: [{ id: ownerId }] };
    }
    if (sql.includes('FROM creative_projects project')) {
      return {
        rowCount: 1,
        rows: [{
          id: projectId,
          user_id: ownerId,
          title: 'Launch',
          status: 'active',
          revision: 4,
          algorithm: encrypted.algorithm,
          key_version: encrypted.keyVersion,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          ciphertext: encrypted.ciphertext
        }]
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const service = createCreativeProjectService({ pool: scripted.pool, env });

  await assert.rejects(
    service.updateProject({
      userId: ownerId,
      projectId,
      expectedRevision: 3,
      title: 'Stale change'
    }),
    { status: 409, code: 'PROJECT_REVISION_CONFLICT' }
  );
  assert.equal(scripted.calls.some((call) => call.sql.startsWith('UPDATE creative_projects SET')), false);
  assert.equal(scripted.calls.some((call) => call.sql.startsWith('UPDATE creative_project_payloads SET')), false);
  assert.deepEqual(
    scripted.calls.filter((call) => ['BEGIN', 'ROLLBACK', 'RELEASE'].includes(call.sql)).map((call) => call.sql),
    ['BEGIN', 'ROLLBACK', 'RELEASE']
  );
});

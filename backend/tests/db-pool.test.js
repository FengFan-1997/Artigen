const assert = require('node:assert/strict');
const test = require('node:test');

const { resolvePoolSsl } = require('../db/pool');

test('PostgreSQL SSL policy supports local PG16 and verifies hosted databases by default', () => {
  assert.equal(resolvePoolSsl('postgresql://u:p@127.0.0.1:5432/db'), undefined);
  assert.equal(
    resolvePoolSsl('postgresql://u:p@db:5432/db?sslmode=disable'),
    undefined
  );
  assert.deepEqual(
    resolvePoolSsl('postgresql://u:p@railway.internal:5432/db', {}),
    { rejectUnauthorized: true }
  );
  assert.deepEqual(
    resolvePoolSsl(
      'postgresql://u:p@db.example/db?sslmode=verify-full',
      { PG_SSL_REJECT_UNAUTHORIZED: '1' }
    ),
    { rejectUnauthorized: true }
  );
  assert.deepEqual(
    resolvePoolSsl(
      'postgresql://u:p@railway.internal:5432/db?sslmode=require',
      { PG_SSL_REJECT_UNAUTHORIZED: '0' }
    ),
    { rejectUnauthorized: false }
  );
  assert.deepEqual(
    resolvePoolSsl('postgresql://u:p@db.example/db', {
      PG_SSL_CA_BASE64: Buffer.from('fixture-ca').toString('base64')
    }),
    { rejectUnauthorized: true, ca: 'fixture-ca' }
  );
});

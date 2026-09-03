const assert = require('node:assert/strict');
const test = require('node:test');
const { Client } = require('pg');

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
  for (const [url, env] of [
    ['postgresql://u:p@db.example/db', {
      PG_SSL_REQUIRED: 'true',
      PG_SSL_REJECT_UNAUTHORIZED: '0'
    }],
    ['postgresql://u:p@127.0.0.1/db', { PG_SSL_REQUIRED: 'yes' }]
  ]) {
    assert.throws(() => resolvePoolSsl(url, env), /POSTGRES_VERIFIED_TLS_REQUIRED/);
  }
  assert.throws(
    () => resolvePoolSsl('postgresql://u:p@db.example/db', {
      PG_SSL_REQUIRED: '1',
      PG_SSL_CA_BASE64: Buffer.from('not-a-certificate').toString('base64')
    }),
    /POSTGRES_SSL_CA_INVALID/
  );

  const certificate = '-----BEGIN CERTIFICATE-----\nZml4dHVyZQ==\n-----END CERTIFICATE-----';
  const strictUrl = 'postgresql://u:p@db.example/db';
  const strictSsl = resolvePoolSsl(strictUrl, {
    PG_SSL_REQUIRED: '1',
    PG_SSL_REJECT_UNAUTHORIZED: '1',
    PG_SSL_CA_BASE64: Buffer.from(certificate).toString('base64')
  });
  const strictClient = new Client({ connectionString: strictUrl, ssl: strictSsl });
  assert.deepEqual(strictClient.connectionParameters.ssl, {
    rejectUnauthorized: true,
    ca: certificate
  });
  for (const query of [
    'sslmode=no-verify',
    'ssl=0',
    'uselibpqcompat=true&sslmode=require',
    'sslmode=verify-full',
    'sslrootcert=%2Ftmp%2Funtrusted.pem'
  ]) {
    assert.throws(
      () => resolvePoolSsl(`postgresql://u:p@db.example/db?${query}`, {
        PG_SSL_REQUIRED: '1',
        PG_SSL_REJECT_UNAUTHORIZED: '1'
      }),
      /POSTGRES_TLS_URL_OVERRIDE_FORBIDDEN/
    );
  }
});

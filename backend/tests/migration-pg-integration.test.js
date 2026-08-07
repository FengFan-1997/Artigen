const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { getPool, withTransaction } = require('../db/pool');
const { importUser } = require('../scripts/import-json-to-postgres');

const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());

test('JSON import is idempotent and cannot restore stale identity or wallet snapshots', {
  skip: !hasDatabase
}, async () => {
  const legacyId = `migration_test_${crypto.randomUUID()}`;
  const oldUser = {
    username: `${legacyId}@example.test`,
    email: `${legacyId}@example.test`,
    name: 'Legacy user',
    passwordSalt: 'legacy-salt',
    passwordHash: 'legacy-hash',
    createdAt: Date.now() - 10_000
  };

  const userId = await withTransaction((client) => importUser(
    client,
    legacyId,
    oldUser,
    { available: 100, frozen: 0 }
  ));

  const newEmail = `${crypto.randomUUID()}@example.test`;
  await getPool().query(
    `UPDATE users SET email=$2, password_hash='scrypt$v1$new-salt$new-hash' WHERE id=$1`,
    [userId, newEmail]
  );

  await withTransaction((client) => importUser(
    client,
    legacyId,
    oldUser,
    { available: 100, frozen: 0 }
  ));
  const identity = await getPool().query(
    'SELECT email, password_hash FROM users WHERE id=$1',
    [userId]
  );
  assert.equal(String(identity.rows[0].email), newEmail);
  assert.equal(identity.rows[0].password_hash, 'scrypt$v1$new-salt$new-hash');

  await withTransaction((client) => importUser(
    client,
    legacyId,
    oldUser,
    { available: 120, frozen: 0 }
  ));
  await assert.rejects(
    withTransaction((client) => importUser(
      client,
      legacyId,
      oldUser,
      { available: 100, frozen: 0 }
    )),
    new RegExp(`JSON_IMPORT_STALE_SNAPSHOT_REFUSED:${legacyId}`)
  );
  const walletAfterReplay = await getPool().query(
    'SELECT available_credits, frozen_credits FROM wallets WHERE user_id=$1',
    [userId]
  );
  assert.equal(Number(walletAfterReplay.rows[0].available_credits), 120);
  assert.equal(Number(walletAfterReplay.rows[0].frozen_credits), 0);

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE wallets SET available_credits=130, version=version+1 WHERE user_id=$1',
      [userId]
    );
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id, entry_type, delta_available, delta_frozen,
         balance_available, balance_frozen, reference_type, reference_id,
         idempotency_key)
       VALUES ($1,'admin_adjustment',10,0,130,0,'integration_test',$2,$3)`,
      [userId, legacyId, `migration-live:${crypto.randomUUID()}`]
    );
  });
  await assert.rejects(
    withTransaction((client) => importUser(
      client,
      legacyId,
      oldUser,
      { available: 140, frozen: 0 }
    )),
    new RegExp(`JSON_IMPORT_REFUSES_LIVE_FINANCE:${legacyId}`)
  );
});

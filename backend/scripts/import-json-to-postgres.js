const crypto = require('crypto');
const {
  USERS_FILE,
  CREDITS_WALLET_FILE,
  PAY_ORDERS_FILE,
  readJson
} = require('../utils/storage');
const { withTransaction } = require('../db/pool');

const packageSku = {
  starter: 'credits.starter.v1',
  standard: 'credits.standard.v1',
  pro: 'credits.pro.v1',
  ultimate: 'credits.ultimate.v1'
};

const deterministicLegacyOrderUuid = (legacyOrderId) => {
  const bytes = Buffer.from(
    crypto.createHash('sha256').update(`artigen:${legacyOrderId}`).digest().subarray(0, 16)
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const toDate = (value) => {
  const number = Number(value || 0);
  return number > 0 ? new Date(number) : new Date();
};

const encodeLegacyPassword = (user) => {
  if (!user?.passwordHash || !user?.passwordSalt) return null;
  return `scrypt$legacy-sync$${String(user.passwordSalt)}$${String(user.passwordHash)}`;
};

const importUser = async (client, legacyId, user, wallet) => {
  if (!legacyId || legacyId.startsWith('guest_')) return null;
  const existingUser = await client.query(
    `SELECT u.id,
            EXISTS (
              SELECT 1 FROM wallet_ledger l
               WHERE l.user_id=u.id AND l.entry_type <> 'migration'
            ) AS has_live_finance
       FROM users u
      WHERE u.legacy_user_id=$1
      FOR UPDATE OF u`,
    [legacyId]
  );
  if (existingUser.rows[0]?.has_live_finance) {
    throw new Error(`JSON_IMPORT_REFUSES_LIVE_FINANCE:${legacyId}`);
  }
  const email = String(user?.email || (String(user?.username || '').includes('@') ? user.username : '')).trim().toLowerCase() || null;
  const inserted = await client.query(
    `INSERT INTO users
      (legacy_user_id, username, email, display_name, password_hash, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (legacy_user_id) DO NOTHING
     RETURNING id`,
    [
      legacyId,
      String(user?.username || '').trim() || null,
      email,
      String(user?.name || user?.username || email || legacyId).slice(0, 240),
      encodeLegacyPassword(user),
      toDate(user?.createdAt),
      toDate(user?.updatedAt || user?.createdAt)
    ]
  );
  const userId = inserted.rows[0]?.id || existingUser.rows[0]?.id;
  if (!userId) throw new Error(`USER_IDENTITY_CONFLICT:${legacyId}`);
  // Identity fields are imported only when the user is first created. A
  // retained JSON snapshot must never undo a later password reset, email
  // change, or OAuth relink.
  if (inserted.rowCount && user?.oauthProvider && user?.oauthSub) {
    await client.query(
      `INSERT INTO user_identities (user_id, provider, subject)
       VALUES ($1,$2,$3) ON CONFLICT (provider, subject) DO NOTHING`,
      [userId, String(user.oauthProvider), String(user.oauthSub)]
    );
  }
  const available = Math.max(0, Math.trunc(Number(wallet?.available || 0) || 0));
  const frozen = Math.max(0, Math.trunc(Number(wallet?.frozen || 0) || 0));
  const snapshotHash = crypto
    .createHash('sha256')
    .update(`${legacyId}\u0000${available}\u0000${frozen}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  const snapshotKey = `migration:${legacyId}:${snapshotHash}`;
  const currentWalletResult = await client.query(
    'SELECT available_credits, frozen_credits FROM wallets WHERE user_id=$1 FOR UPDATE',
    [userId]
  );
  const currentWallet = currentWalletResult.rows[0] || null;
  const snapshotSeen = await client.query(
    'SELECT 1 FROM wallet_ledger WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1',
    [userId, snapshotKey]
  );
  const currentAvailable = Number(currentWallet?.available_credits || 0);
  const currentFrozen = Number(currentWallet?.frozen_credits || 0);
  if (
    snapshotSeen.rowCount &&
    (currentAvailable !== available || currentFrozen !== frozen)
  ) {
    throw new Error(`JSON_IMPORT_STALE_SNAPSHOT_REFUSED:${legacyId}`);
  }
  if (!currentWallet) {
    await client.query(
      `INSERT INTO wallets (user_id, available_credits, frozen_credits)
       VALUES ($1,$2,$3)`,
      [userId, available, frozen]
    );
  } else if (currentAvailable !== available || currentFrozen !== frozen) {
    await client.query(
      `UPDATE wallets
          SET available_credits=$2, frozen_credits=$3,
              version=version+1, updated_at=now()
        WHERE user_id=$1`,
      [userId, available, frozen]
    );
  }
  await client.query(
    `INSERT INTO wallet_ledger
      (user_id, entry_type, delta_available, delta_frozen, balance_available,
       balance_frozen, reference_type, reference_id, idempotency_key, metadata)
     VALUES ($1,'migration',$2,$3,$4,$5,'json_import',$6,$7,$8)
     ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [
      userId,
      available - currentAvailable,
      frozen - currentFrozen,
      available,
      frozen,
      legacyId,
      snapshotKey,
      JSON.stringify({ source: 'json', snapshotHash, importedAt: new Date().toISOString() })
    ]
  );
  return userId;
};

const importOrder = async (client, localOrderId, order) => {
  const legacyUserId = String(order?.userId || '').trim();
  if (!legacyUserId || legacyUserId.startsWith('guest_')) return false;
  const userResult = await client.query('SELECT id FROM users WHERE legacy_user_id=$1', [legacyUserId]);
  if (!userResult.rowCount) return false;
  const sku = packageSku[String(order?.packageId || '').toLowerCase()];
  if (!sku) return false;
  const packageResult = await client.query('SELECT * FROM payment_packages WHERE sku=$1', [sku]);
  if (!packageResult.rowCount) return false;
  const pkg = packageResult.rows[0];
  const amountMinor = Math.round(Number(order?.amountCny || 0) * 100);
  const credits = Math.trunc(Number(order?.credits || 0));
  if (amountMinor !== Number(pkg.amount_minor) || credits !== Number(pkg.credits)) {
    throw new Error(`ORDER_PACKAGE_MISMATCH:${localOrderId}`);
  }
  const status = ['paid', 'pending', 'expired', 'cancelled', 'rejected'].includes(String(order?.status))
    ? String(order.status)
    : 'pending';
  const imported = await client.query(
    `INSERT INTO payment_orders
      (id, legacy_order_id, user_id, package_id, provider, provider_order_id,
       expected_amount_minor, currency, expected_credits, status, paid_at,
       created_at, updated_at)
     VALUES ($1,$2,$3,$4,'afdian',$5,$6,'CNY',$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       provider_order_id = COALESCE(payment_orders.provider_order_id, EXCLUDED.provider_order_id),
       status = CASE
         WHEN payment_orders.status <> 'pending' THEN payment_orders.status
         ELSE EXCLUDED.status
       END,
       paid_at = CASE
         WHEN payment_orders.status = 'pending' AND EXCLUDED.status = 'paid'
           THEN COALESCE(payment_orders.paid_at, EXCLUDED.paid_at)
         ELSE payment_orders.paid_at
       END,
       updated_at = GREATEST(payment_orders.updated_at, EXCLUDED.updated_at)
     WHERE payment_orders.user_id = EXCLUDED.user_id
       AND payment_orders.package_id = EXCLUDED.package_id
       AND payment_orders.provider = EXCLUDED.provider
       AND payment_orders.expected_amount_minor = EXCLUDED.expected_amount_minor
       AND payment_orders.currency = EXCLUDED.currency
       AND payment_orders.expected_credits = EXCLUDED.expected_credits
       AND payment_orders.legacy_order_id = EXCLUDED.legacy_order_id
       AND (
         payment_orders.provider_order_id IS NULL
         OR EXCLUDED.provider_order_id IS NULL
         OR payment_orders.provider_order_id = EXCLUDED.provider_order_id
       )
     RETURNING id`,
    [
      deterministicLegacyOrderUuid(localOrderId),
      localOrderId,
      userResult.rows[0].id,
      pkg.id,
      String(order?.afdianOrderId || '').trim() || null,
      amountMinor,
      credits,
      status,
      status === 'paid' ? toDate(order?.paidAt || order?.updatedAt) : null,
      toDate(order?.createdAt),
      toDate(order?.updatedAt || order?.createdAt)
    ]
  );
  if (!imported.rowCount) throw new Error(`ORDER_SNAPSHOT_CONFLICT:${localOrderId}`);
  return true;
};

const run = async () => {
  const users = readJson(USERS_FILE, {});
  const wallets = readJson(CREDITS_WALLET_FILE, {});
  const orders = readJson(PAY_ORDERS_FILE, {});
  const summary = await withTransaction(async (client) => {
    const liveFinance = await client.query(
      "SELECT 1 FROM wallet_ledger WHERE entry_type <> 'migration' LIMIT 1"
    );
    if (liveFinance.rowCount) {
      throw new Error('JSON_IMPORT_AFTER_CUTOVER_REFUSED');
    }
    let usersImported = 0;
    let ordersImported = 0;
    for (const [legacyId, user] of Object.entries(users || {})) {
      if (await importUser(client, legacyId, user, wallets?.[legacyId])) usersImported += 1;
    }
    for (const [localOrderId, order] of Object.entries(orders || {})) {
      if (await importOrder(client, localOrderId, order)) ordersImported += 1;
    }
    const totals = await client.query(
      `SELECT count(*)::int AS users,
        COALESCE(sum(available_credits),0)::bigint AS available,
        COALESCE(sum(frozen_credits),0)::bigint AS frozen FROM wallets`
    );
    return { usersImported, ordersImported, totals: totals.rows[0] };
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  deterministicLegacyOrderUuid,
  importOrder,
  importUser,
  run
};

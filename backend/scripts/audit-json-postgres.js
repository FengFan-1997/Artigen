const {
  USERS_FILE,
  CREDITS_WALLET_FILE,
  PAY_ORDERS_FILE,
  readJson
} = require('../utils/storage');
const { getPool } = require('../db/pool');

const run = async () => {
  const users = readJson(USERS_FILE, {});
  const wallets = readJson(CREDITS_WALLET_FILE, {});
  const payOrders = readJson(PAY_ORDERS_FILE, {});
  const eligibleUserIds = Object.keys(users || {}).filter((id) => id && !id.startsWith('guest_'));
  const jsonWallet = eligibleUserIds.reduce(
    (sum, id) => ({
      available: sum.available + Math.max(0, Math.trunc(Number(wallets?.[id]?.available || 0) || 0)),
      frozen: sum.frozen + Math.max(0, Math.trunc(Number(wallets?.[id]?.frozen || 0) || 0))
    }),
    { available: 0, frozen: 0 }
  );
  const eligibleOrders = Object.values(payOrders || {}).filter((order) => {
    const userId = String(order?.userId || '');
    return userId && !userId.startsWith('guest_');
  }).length;

  const result = await getPool().query(`
    SELECT
      (SELECT count(*)::int FROM users WHERE legacy_user_id IS NOT NULL) AS users,
      (SELECT COALESCE(sum(w.available_credits),0)::bigint
         FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.legacy_user_id IS NOT NULL) AS available,
      (SELECT COALESCE(sum(w.frozen_credits),0)::bigint
         FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.legacy_user_id IS NOT NULL) AS frozen,
      (SELECT count(*)::int FROM payment_orders) AS orders,
      (SELECT count(*)::int FROM (
        SELECT provider, provider_order_id FROM payment_orders
        WHERE provider_order_id IS NOT NULL GROUP BY provider, provider_order_id HAVING count(*) > 1
      ) duplicates) AS duplicate_provider_orders,
      (SELECT count(*)::int FROM credit_holds WHERE status='held' AND expires_at <= now()) AS expired_holds
  `);
  const pg = result.rows[0];
  const expected = {
    users: eligibleUserIds.length,
    available: jsonWallet.available,
    frozen: jsonWallet.frozen,
    orders: eligibleOrders
  };
  const actual = {
    users: Number(pg.users),
    available: Number(pg.available),
    frozen: Number(pg.frozen),
    orders: Number(pg.orders)
  };
  const checks = {
    users: expected.users === actual.users,
    available: expected.available === actual.available,
    frozen: expected.frozen === actual.frozen,
    orders: expected.orders === actual.orders,
    paymentUnique: Number(pg.duplicate_provider_orders) === 0,
    expiredHolds: Number(pg.expired_holds) === 0
  };
  const ok = Object.values(checks).every(Boolean);
  process.stdout.write(`${JSON.stringify({ ok, expected, actual, checks }, null, 2)}\n`);
  if (!ok) process.exitCode = 2;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

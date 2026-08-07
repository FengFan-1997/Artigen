const { getPool, withTransaction } = require('../db/pool');
const { resolveUserId } = require('../services/billing-service');

const reference = String(process.argv[2] || '').trim();
const role = String(process.argv[3] || 'owner').trim().toLowerCase();

if (!reference || !['operator', 'admin', 'owner'].includes(role)) {
  console.error('Usage: pnpm admin:grant -- <user UUID or legacy user id> [operator|admin|owner]');
  process.exitCode = 2;
} else {
  let pool;
  try {
    pool = getPool();
    const userId = await withTransaction(async (client) => {
      const resolved = await resolveUserId(client, reference);
      await client.query(
        `INSERT INTO administrators (user_id, role, active, updated_at)
         VALUES ($1,$2,true,now())
         ON CONFLICT (user_id) DO UPDATE
           SET role=EXCLUDED.role, active=true, updated_at=now()`,
        [resolved, role]
      );
      return resolved;
    });
    console.log(`Granted ${role} to administrator user ${userId}`);
  } catch (error) {
    console.error(error?.code || error?.message || error);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

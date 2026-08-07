const { ApiError } = require('../lib/api-error');

const clampCredits = (value, maximum = 500) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiError(400, 'AGENT_BUDGET_INVALID', { field: 'maxCredits' });
  }
  return parsed;
};

const reserveAgentBudget = async ({
  client,
  runId,
  userId,
  maxCredits,
  trialCredits = 0,
  dailyFreeCredits,
  holdMinutes = 60
}) => {
  const budget = clampCredits(maxCredits);
  await client.query(
    `INSERT INTO agent_trial_usage
      (user_id,granted_credits,reserved_credits,consumed_credits)
     VALUES ($1,$2,0,0)
     ON CONFLICT (user_id) DO UPDATE
       SET granted_credits=GREATEST(
         agent_trial_usage.granted_credits,
         EXCLUDED.granted_credits
       ),updated_at=now()`,
    [userId, Math.max(0, Number(trialCredits || 0))]
  );
  const trial = await client.query(
    `SELECT * FROM agent_trial_usage WHERE user_id=$1 FOR UPDATE`,
    [userId]
  );
  await client.query(
    `INSERT INTO agent_daily_free_usage
      (user_id,usage_date,reserved_credits,consumed_credits)
     VALUES ($1,current_date,0,0)
     ON CONFLICT (user_id,usage_date) DO NOTHING`,
    [userId]
  );
  const daily = await client.query(
    `SELECT * FROM agent_daily_free_usage
      WHERE user_id=$1 AND usage_date=current_date
      FOR UPDATE`,
    [userId]
  );
  const row = daily.rows[0];
  const trialRow = trial.rows[0] || {};
  const remainingTrial = Math.max(
    0,
    Number(trialRow.granted_credits || 0) -
      Number(trialRow.reserved_credits || 0) -
      Number(trialRow.consumed_credits || 0)
  );
  const remainingDaily = Math.max(
    0,
    Number(dailyFreeCredits || 0) -
      Number(row.reserved_credits || 0) -
      Number(row.consumed_credits || 0)
  );
  const trialFreeCredits = Math.min(budget, remainingTrial);
  const dailyFreeReserved = Math.min(
    budget - trialFreeCredits,
    remainingDaily
  );
  const freeCredits = trialFreeCredits + dailyFreeReserved;
  const paidCredits = budget - freeCredits;

  let wallet = null;
  if (paidCredits > 0) {
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',
      [userId]
    );
    if (!walletResult.rowCount) throw new ApiError(409, 'WALLET_NOT_FOUND');
    if (Number(walletResult.rows[0].available_credits) < paidCredits) {
      throw new ApiError(402, 'INSUFFICIENT_CREDITS', { retryable: false });
    }
    const updated = await client.query(
      `UPDATE wallets
          SET available_credits=available_credits-$2,
              frozen_credits=frozen_credits+$2,
              version=version+1,
              updated_at=now()
        WHERE user_id=$1
        RETURNING available_credits,frozen_credits`,
      [userId, paidCredits]
    );
    wallet = updated.rows[0];
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id,entry_type,delta_available,delta_frozen,balance_available,
         balance_frozen,reference_type,reference_id,idempotency_key,metadata)
       VALUES ($1,'hold',$2,$3,$4,$5,'agent_run',$6,$7,$8)`,
      [
        userId,
        -paidCredits,
        paidCredits,
        wallet.available_credits,
        wallet.frozen_credits,
        runId,
        `agent-hold:${runId}`,
        JSON.stringify({
          maxCredits: budget,
          freeCredits,
          trialFreeCredits,
          dailyFreeCredits: dailyFreeReserved
        })
      ]
    );
  }
  if (trialFreeCredits > 0) {
    await client.query(
      `UPDATE agent_trial_usage
          SET reserved_credits=reserved_credits+$2,updated_at=now()
        WHERE user_id=$1`,
      [userId, trialFreeCredits]
    );
  }
  if (dailyFreeReserved > 0) {
    await client.query(
      `UPDATE agent_daily_free_usage
          SET reserved_credits=reserved_credits+$2,updated_at=now()
        WHERE user_id=$1 AND usage_date=current_date`,
      [userId, dailyFreeReserved]
    );
  }
  await client.query(
    `INSERT INTO agent_budget_holds
      (run_id,user_id,max_credits,free_credits,paid_credits,
       trial_credits,daily_free_credits,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
       clock_timestamp()+($8::text || ' minutes')::interval)`,
    [
      runId,
      userId,
      budget,
      freeCredits,
      paidCredits,
      trialFreeCredits,
      dailyFreeReserved,
      Math.max(1, holdMinutes)
    ]
  );
  return {
    maxCredits: budget,
    freeCredits,
    trialFreeCredits,
    dailyFreeCredits: dailyFreeReserved,
    paidCredits
  };
};

const settleAgentBudget = async ({
  client,
  runId,
  actualCredits = 0,
  refundable = false,
  reason = 'completed'
}) => {
  const holdResult = await client.query(
    `SELECT * FROM agent_budget_holds WHERE run_id=$1 FOR UPDATE`,
    [runId]
  );
  if (!holdResult.rowCount) throw new ApiError(404, 'AGENT_BUDGET_HOLD_NOT_FOUND');
  const hold = holdResult.rows[0];
  if (hold.status !== 'held') {
    return {
      replayed: true,
      chargedCredits: Number(hold.charged_credits || 0),
      releasedCredits: 0
    };
  }
  const maximum = Number(hold.max_credits || 0);
  const billable = refundable
    ? 0
    : Math.max(0, Math.min(maximum, Math.ceil(Number(actualCredits || 0))));
  const trialHeld = Number(hold.trial_credits || 0);
  const dailyHeld = Number(hold.daily_free_credits || 0);
  const trialCharged = Math.min(trialHeld, billable);
  const dailyCharged = Math.min(dailyHeld, Math.max(0, billable - trialCharged));
  const freeCharged = trialCharged + dailyCharged;
  const paidCharged = Math.max(0, billable - freeCharged);
  const paidReleased = Number(hold.paid_credits || 0) - paidCharged;
  const freeReleased = Number(hold.free_credits || 0) - freeCharged;

  if (trialHeld > 0) {
    await client.query(
      `UPDATE agent_trial_usage
          SET reserved_credits=GREATEST(0,reserved_credits-$2),
              consumed_credits=consumed_credits+$3,
              updated_at=now()
        WHERE user_id=$1`,
      [hold.user_id, trialHeld, trialCharged]
    );
  }

  if (dailyHeld > 0) {
    await client.query(
      `UPDATE agent_daily_free_usage
          SET reserved_credits=GREATEST(0,reserved_credits-$2),
              consumed_credits=consumed_credits+$3,
              updated_at=now()
        WHERE user_id=$1 AND usage_date=$4::date`,
      [hold.user_id, dailyHeld, dailyCharged, hold.created_at]
    );
  }

  if (paidCharged > 0) {
    const wallet = await client.query(
      `UPDATE wallets
          SET frozen_credits=frozen_credits-$2,version=version+1,updated_at=now()
        WHERE user_id=$1
        RETURNING available_credits,frozen_credits`,
      [hold.user_id, paidCharged]
    );
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id,entry_type,delta_available,delta_frozen,balance_available,
         balance_frozen,reference_type,reference_id,idempotency_key,metadata)
       VALUES ($1,'charge',0,$2,$3,$4,'agent_run',$5,$6,$7)`,
      [
        hold.user_id,
        -paidCharged,
        wallet.rows[0].available_credits,
        wallet.rows[0].frozen_credits,
        runId,
        `agent-charge:${runId}`,
        JSON.stringify({ reason, freeCharged })
      ]
    );
  }

  if (paidReleased > 0) {
    const wallet = await client.query(
      `UPDATE wallets
          SET available_credits=available_credits+$2,
              frozen_credits=frozen_credits-$2,
              version=version+1,
              updated_at=now()
        WHERE user_id=$1
        RETURNING available_credits,frozen_credits`,
      [hold.user_id, paidReleased]
    );
    await client.query(
      `INSERT INTO wallet_ledger
        (user_id,entry_type,delta_available,delta_frozen,balance_available,
         balance_frozen,reference_type,reference_id,idempotency_key,metadata)
       VALUES ($1,'release',$2,$3,$4,$5,'agent_run',$6,$7,$8)`,
      [
        hold.user_id,
        paidReleased,
        -paidReleased,
        wallet.rows[0].available_credits,
        wallet.rows[0].frozen_credits,
        runId,
        `agent-release:${runId}`,
        JSON.stringify({ reason, freeReleased })
      ]
    );
  }

  await client.query(
    `UPDATE agent_budget_holds
        SET status=$2,charged_credits=$3,resolved_at=now()
      WHERE run_id=$1`,
    [runId, billable > 0 ? 'settled' : 'released', billable]
  );
  await client.query(
    `UPDATE agent_runs
        SET charged_credits=$2,
            refunded_credits=CASE WHEN $3 THEN $2 ELSE refunded_credits END,
            updated_at=now()
      WHERE id=$1`,
    [runId, billable, false]
  );
  return {
    replayed: false,
    chargedCredits: billable,
    freeCharged,
    trialCharged,
    dailyCharged,
    paidCharged,
    releasedCredits: paidReleased,
    freeReleased
  };
};

module.exports = {
  clampCredits,
  reserveAgentBudget,
  settleAgentBudget
};

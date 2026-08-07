const REQUIRED_TABLES = [
  'users',
  'wallets',
  'wallet_ledger',
  'payment_packages',
  'payment_orders',
  'payment_callback_events',
  'tool_task_quotes',
  'tool_tasks',
  'credit_holds',
  'agent_runs',
  'agent_model_checkpoints',
  'agent_events',
  'agent_artifacts',
  'agent_budget_holds'
];

const COUNT_CHECKS = [
  {
    name: 'wallet_nonnegative',
    tables: ['wallets'],
    sql: `
      SELECT count(*)::text AS violations
        FROM wallets
       WHERE available_credits < 0
          OR frozen_credits < 0
          OR version < 0
    `
  },
  {
    name: 'wallet_ledger_chain',
    tables: ['wallet_ledger'],
    sql: `
      WITH chain AS (
        SELECT id, user_id, delta_available, delta_frozen,
               balance_available, balance_frozen,
               lag(balance_available, 1, 0::bigint)
                 OVER (PARTITION BY user_id ORDER BY id) AS prior_available,
               lag(balance_frozen, 1, 0::bigint)
                 OVER (PARTITION BY user_id ORDER BY id) AS prior_frozen
          FROM wallet_ledger
      )
      SELECT count(*)::text AS violations
        FROM chain
       WHERE balance_available <> prior_available + delta_available
          OR balance_frozen <> prior_frozen + delta_frozen
    `
  },
  {
    name: 'wallet_matches_ledger_tail',
    tables: ['wallets', 'wallet_ledger'],
    sql: `
      WITH latest AS (
        SELECT DISTINCT ON (user_id)
               user_id, id, balance_available, balance_frozen
          FROM wallet_ledger
         ORDER BY user_id, id DESC
      )
      SELECT count(*)::text AS violations
        FROM wallets wallet
        LEFT JOIN latest ledger USING (user_id)
       WHERE (
               ledger.id IS NULL
               AND (wallet.available_credits <> 0 OR wallet.frozen_credits <> 0)
             )
          OR (
               ledger.id IS NOT NULL
               AND (
                 wallet.available_credits <> ledger.balance_available
                 OR wallet.frozen_credits <> ledger.balance_frozen
               )
             )
    `
  },
  {
    name: 'wallet_frozen_matches_held_holds',
    tables: ['wallets', 'credit_holds', 'agent_budget_holds'],
    sql: `
      WITH held AS (
        SELECT user_id, sum(credits)::bigint AS credits
          FROM (
            SELECT user_id, credits
              FROM credit_holds
             WHERE status = 'held'
            UNION ALL
            SELECT user_id, paid_credits AS credits
              FROM agent_budget_holds
             WHERE status = 'held'
          ) active_holds
         GROUP BY user_id
      )
      SELECT count(*)::text AS violations
        FROM wallets wallet
        FULL JOIN held USING (user_id)
       WHERE coalesce(wallet.frozen_credits, 0) <> coalesce(held.credits, 0)
    `
  },
  {
    name: 'agent_run_has_exactly_one_hold',
    tables: ['agent_runs', 'agent_budget_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT run.id
            FROM agent_runs run
            LEFT JOIN agent_budget_holds hold ON hold.run_id = run.id
           GROUP BY run.id
          HAVING count(hold.id) <> 1
        ) invalid
    `
  },
  {
    name: 'agent_run_hold_state_matrix',
    tables: ['agent_runs', 'agent_budget_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM agent_runs run
        JOIN agent_budget_holds hold ON hold.run_id = run.id
       WHERE hold.user_id <> run.user_id
          OR hold.max_credits <> run.max_credits
          OR hold.free_credits + hold.paid_credits <> hold.max_credits
          OR hold.charged_credits <> run.charged_credits
          OR (
               hold.status = 'held'
               AND run.status NOT IN (
                 'draft','queued','provisioning','running',
                 'waiting_user','paused','verifying'
               )
             )
          OR (
               hold.status = 'settled'
               AND (
                 run.status NOT IN ('succeeded','failed','cancelled')
                 OR hold.charged_credits <= 0
               )
             )
          OR (
               hold.status = 'released'
               AND (
                 run.status NOT IN ('failed','cancelled','succeeded')
                 OR hold.charged_credits <> 0
               )
             )
          OR (hold.status = 'held' AND hold.resolved_at IS NOT NULL)
          OR (hold.status <> 'held' AND hold.resolved_at IS NULL)
          OR (
               run.status IN ('succeeded','failed','cancelled')
               AND (
                 run.finished_at IS NULL
                 OR run.worker_id IS NOT NULL
                 OR run.lease_expires_at IS NOT NULL
               )
             )
    `
  },
  {
    name: 'agent_run_verified_success',
    tables: ['agent_runs', 'agent_artifacts'],
    sql: `
      SELECT count(*)::text AS violations
        FROM agent_runs run
       WHERE run.status = 'succeeded'
         AND (
           NOT EXISTS (
             SELECT 1 FROM agent_artifacts artifact
              WHERE artifact.run_id = run.id
                AND artifact.verification_status = 'passed'
           )
           OR EXISTS (
             SELECT 1 FROM agent_artifacts artifact
              WHERE artifact.run_id = run.id
                AND artifact.verification_status <> 'passed'
           )
           OR NOT EXISTS (
             SELECT 1 FROM agent_artifacts artifact
              WHERE artifact.run_id = run.id
                AND artifact.role IN ('editable','source','website','package')
           )
         )
    `
  },
  {
    name: 'agent_run_single_active',
    tables: ['agent_runs'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT user_id
            FROM agent_runs
           WHERE status IN (
             'draft','queued','provisioning','running',
             'waiting_user','paused','verifying'
           )
           GROUP BY user_id
          HAVING count(*) > 1
        ) duplicate_active
    `
  },
  {
    name: 'agent_ledger_has_run',
    tables: ['agent_runs', 'wallet_ledger'],
    sql: `
      SELECT count(*)::text AS violations
        FROM wallet_ledger ledger
       WHERE ledger.reference_type = 'agent_run'
         AND ledger.entry_type IN ('hold', 'charge', 'release')
         AND NOT EXISTS (
           SELECT 1
             FROM agent_runs run
            WHERE run.id::text = ledger.reference_id
         )
    `
  },
  {
    name: 'agent_hold_not_stale',
    tables: ['agent_budget_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM agent_budget_holds
       WHERE status = 'held'
         AND expires_at <= clock_timestamp() - interval '5 minutes'
    `
  },
  {
    name: 'task_has_exactly_one_hold',
    tables: ['tool_tasks', 'credit_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT task.id
            FROM tool_tasks task
            LEFT JOIN credit_holds hold ON hold.task_id = task.id
           GROUP BY task.id
          HAVING count(hold.id) <> 1
        ) invalid
    `
  },
  {
    name: 'task_hold_state_matrix',
    tables: ['tool_tasks', 'credit_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM tool_tasks task
        JOIN credit_holds hold ON hold.task_id = task.id
       WHERE hold.user_id <> task.user_id
          OR hold.credits <> task.quoted_credits
          OR (hold.status = 'held' AND task.status NOT IN ('queued', 'running'))
          OR (
               hold.status = 'settled'
               AND (
                 task.status <> 'success'
                 OR task.charged_credits <> hold.credits
                 OR task.refunded_credits <> 0
               )
             )
          OR (
               hold.status = 'released'
               AND (
                 task.status NOT IN ('failed', 'cancelled')
                 OR task.charged_credits <> 0
                 OR task.refunded_credits <> hold.credits
               )
             )
          OR (hold.status = 'held' AND hold.resolved_at IS NOT NULL)
          OR (hold.status <> 'held' AND hold.resolved_at IS NULL)
          OR (
               task.status IN ('success', 'failed', 'cancelled')
               AND task.finished_at IS NULL
             )
          OR (
               task.status IN ('queued', 'running')
               AND (task.charged_credits <> 0 OR task.refunded_credits <> 0)
             )
    `
  },
  {
    name: 'task_quote_snapshot',
    tables: ['tool_tasks', 'tool_task_quotes'],
    sql: `
      SELECT count(*)::text AS violations
        FROM tool_tasks task
        LEFT JOIN tool_task_quotes quote ON quote.id = task.quote_id
       WHERE (
               task.sku IS NOT NULL
               AND (
                 quote.id IS NULL
                 OR quote.user_id <> task.user_id
                 OR quote.sku <> task.sku
                 OR quote.credits <> task.quoted_credits
                 OR quote.consumed_at IS NULL
               )
             )
          OR (
               task.quote_id IS NOT NULL
               AND (
                 task.sku IS NULL
                 OR quote.id IS NULL
                 OR quote.user_id <> task.user_id
                 OR quote.sku <> task.sku
                 OR quote.credits <> task.quoted_credits
                 OR quote.consumed_at IS NULL
               )
             )
    `
  },
  {
    name: 'quote_used_once',
    tables: ['tool_tasks'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT quote_id
            FROM tool_tasks
           WHERE quote_id IS NOT NULL
           GROUP BY quote_id
          HAVING count(*) > 1
        ) duplicate_quotes
    `
  },
  {
    name: 'task_ledger_cardinality',
    tables: ['tool_tasks', 'credit_holds', 'wallet_ledger'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT task.id, hold.status, hold.credits,
                 count(ledger.id) FILTER (
                   WHERE ledger.entry_type IN ('hold', 'charge', 'release')
                 ) AS financial_count,
                 count(ledger.id) FILTER (
                   WHERE ledger.entry_type = 'hold'
                     AND ledger.user_id = task.user_id
                     AND ledger.delta_available = -hold.credits
                     AND ledger.delta_frozen = hold.credits
                 ) AS exact_hold_count,
                 count(ledger.id) FILTER (
                   WHERE ledger.entry_type = 'charge'
                     AND ledger.user_id = task.user_id
                     AND ledger.delta_available = 0
                     AND ledger.delta_frozen = -hold.credits
                 ) AS exact_charge_count,
                 count(ledger.id) FILTER (
                   WHERE ledger.entry_type = 'release'
                     AND ledger.user_id = task.user_id
                     AND ledger.delta_available = hold.credits
                     AND ledger.delta_frozen = -hold.credits
                 ) AS exact_release_count
            FROM tool_tasks task
            JOIN credit_holds hold ON hold.task_id = task.id
            LEFT JOIN wallet_ledger ledger
              ON ledger.reference_type = 'tool_task'
             AND ledger.reference_id = task.id::text
             AND ledger.entry_type IN ('hold', 'charge', 'release')
           GROUP BY task.id, hold.status, hold.credits
        ) accounting
       WHERE (
               credits = 0
               AND financial_count <> 0
             )
          OR (
               credits > 0
               AND (
                 exact_hold_count <> 1
                 OR (
                      status = 'held'
                      AND (
                        financial_count <> 1
                        OR exact_charge_count <> 0
                        OR exact_release_count <> 0
                      )
                    )
                 OR (
                      status = 'settled'
                      AND (
                        financial_count <> 2
                        OR exact_charge_count <> 1
                        OR exact_release_count <> 0
                      )
                    )
                 OR (
                      status = 'released'
                      AND (
                        financial_count <> 2
                        OR exact_charge_count <> 0
                        OR exact_release_count <> 1
                      )
                    )
               )
             )
    `
  },
  {
    name: 'task_ledger_has_task',
    tables: ['tool_tasks', 'wallet_ledger'],
    sql: `
      SELECT count(*)::text AS violations
        FROM wallet_ledger ledger
       WHERE ledger.reference_type = 'tool_task'
         AND ledger.entry_type IN ('hold', 'charge', 'release')
         AND NOT EXISTS (
           SELECT 1
             FROM tool_tasks task
            WHERE task.id::text = ledger.reference_id
         )
    `
  },
  {
    name: 'held_hold_not_stale',
    tables: ['credit_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM credit_holds
       WHERE status = 'held'
         AND expires_at <= clock_timestamp() - interval '5 minutes'
    `
  },
  {
    name: 'hold_release_not_stuck',
    tables: ['credit_holds'],
    sql: `
      SELECT count(*)::text AS violations
        FROM credit_holds
       WHERE status = 'held'
         AND release_attempts > 0
         AND coalesce(next_release_at, expires_at) <= clock_timestamp()
         AND coalesce(release_lease_until, '-infinity'::timestamptz) <= clock_timestamp()
    `
  },
  {
    name: 'payment_order_state',
    tables: ['payment_orders'],
    sql: `
      SELECT count(*)::text AS violations
        FROM payment_orders
       WHERE (
               status = 'paid'
               AND (
                 provider_order_id IS NULL
                 OR btrim(provider_order_id) = ''
                 OR paid_at IS NULL
               )
             )
          OR (status <> 'paid' AND paid_at IS NOT NULL)
    `
  },
  {
    name: 'payment_order_callback_and_ledger',
    tables: ['payment_orders', 'payment_callback_events', 'wallet_ledger'],
    sql: `
      WITH callback_accounting AS (
        SELECT callback.payment_order_id,
               count(*) FILTER (
                 WHERE callback.status = 'processed'
               ) AS processed_callbacks,
               count(*) FILTER (
                 WHERE callback.status = 'processed'
                   AND callback.signature_valid
                   AND callback.processed_at IS NOT NULL
                   AND callback.provider = payment.provider
                   AND callback.provider_event_id = payment.provider_order_id
               ) AS exact_processed_callbacks
          FROM payment_callback_events callback
          JOIN payment_orders payment ON payment.id = callback.payment_order_id
         GROUP BY callback.payment_order_id
      ),
      purchase_accounting AS (
        SELECT payment.id AS payment_order_id,
               count(ledger.id) AS purchase_entries,
               count(ledger.id) FILTER (
                 WHERE ledger.user_id = payment.user_id
                   AND ledger.delta_available = payment.expected_credits
                   AND ledger.delta_frozen = 0
               ) AS exact_purchase_entries
          FROM payment_orders payment
          JOIN wallet_ledger ledger
            ON ledger.reference_type = 'payment_order'
           AND ledger.reference_id = payment.id::text
           AND ledger.entry_type = 'purchase'
         GROUP BY payment.id
      )
      SELECT count(*)::text AS violations
        FROM payment_orders payment
        LEFT JOIN callback_accounting callback
          ON callback.payment_order_id = payment.id
        LEFT JOIN purchase_accounting purchase
          ON purchase.payment_order_id = payment.id
       WHERE (
               payment.status = 'paid'
               AND (
                 coalesce(callback.processed_callbacks, 0) <> 1
                 OR coalesce(callback.exact_processed_callbacks, 0) <> 1
                 OR coalesce(purchase.purchase_entries, 0) <> 1
                 OR coalesce(purchase.exact_purchase_entries, 0) <> 1
               )
             )
          OR (
               payment.status <> 'paid'
               AND (
                 coalesce(callback.processed_callbacks, 0) <> 0
                 OR coalesce(purchase.purchase_entries, 0) <> 0
               )
             )
    `
  },
  {
    name: 'payment_callback_terminal_state',
    tables: ['payment_callback_events'],
    sql: `
      SELECT count(*)::text AS violations
        FROM payment_callback_events
       WHERE (
               status LIKE 'dead_letter:%'
               AND (
                 processed_at IS NULL
                 OR last_error IS NULL
                 OR status <> 'dead_letter:' || last_error
               )
             )
          OR (
               status = 'received'
               AND received_at <= clock_timestamp() - interval '5 minutes'
             )
    `
  },
  {
    name: 'payment_provider_order_unique',
    tables: ['payment_orders'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT provider, provider_order_id
            FROM payment_orders
           WHERE provider_order_id IS NOT NULL
           GROUP BY provider, provider_order_id
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'payment_legacy_order_unique',
    tables: ['payment_orders'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT legacy_order_id
            FROM payment_orders
           WHERE legacy_order_id IS NOT NULL
           GROUP BY legacy_order_id
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'payment_callback_event_unique',
    tables: ['payment_callback_events'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT provider, provider_event_id
            FROM payment_callback_events
           GROUP BY provider, provider_event_id
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'wallet_ledger_idempotency_unique',
    tables: ['wallet_ledger'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT user_id, idempotency_key
            FROM wallet_ledger
           WHERE idempotency_key IS NOT NULL
           GROUP BY user_id, idempotency_key
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'tool_task_idempotency_unique',
    tables: ['tool_tasks'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT user_id, idempotency_key
            FROM tool_tasks
           GROUP BY user_id, idempotency_key
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'active_payment_package_alias_unique',
    tables: ['payment_packages'],
    sql: `
      SELECT count(*)::text AS violations
        FROM (
          SELECT regexp_replace(
                   regexp_replace(lower(sku), '^credits\\.', ''),
                   '\\.v[0-9]+$',
                   ''
                 ) AS alias
            FROM payment_packages
           WHERE active = true
           GROUP BY alias
          HAVING count(*) > 1
        ) duplicates
    `
  },
  {
    name: 'financial_protection_triggers',
    tables: [],
    sql: `
      WITH required(table_name, trigger_name) AS (
        VALUES
          ('wallet_ledger', 'wallet_ledger_append_only'),
          ('payment_orders', 'payment_order_snapshot_immutable'),
          ('agent_events', 'agent_events_append_only')
      )
      SELECT count(*)::text AS violations
        FROM required
        LEFT JOIN pg_class relation
          ON relation.relname = required.table_name
         AND relation.relnamespace = 'public'::regnamespace
        LEFT JOIN pg_trigger trigger
          ON trigger.tgrelid = relation.oid
         AND trigger.tgname = required.trigger_name
         AND NOT trigger.tgisinternal
       WHERE trigger.oid IS NULL
          OR trigger.tgenabled = 'D'
    `
  },
  {
    name: 'financial_unique_indexes',
    tables: [],
    sql: `
      WITH required(index_name) AS (
        VALUES
          ('wallet_ledger_user_id_idempotency_key_unique_index'),
          ('payment_orders_provider_provider_order_id_unique_index'),
          ('payment_orders_legacy_order_unique'),
          ('payment_callback_provider_event_unique'),
          ('tool_tasks_user_idempotency_unique'),
          ('credit_holds_task_id_key')
      )
      SELECT count(*)::text AS violations
        FROM required
        LEFT JOIN pg_class relation
          ON relation.relname = required.index_name
         AND relation.relnamespace = 'public'::regnamespace
        LEFT JOIN pg_index index_state ON index_state.indexrelid = relation.oid
       WHERE relation.oid IS NULL
          OR index_state.indexrelid IS NULL
          OR NOT index_state.indisunique
          OR NOT index_state.indisvalid
          OR NOT index_state.indisready
    `
  }
];

const readExistingTables = async (client) => {
  const result = await client.query(
    `SELECT tablename
       FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  return new Set(result.rows.map((row) => String(row.tablename)));
};

const runDatabaseAudit = async (
  client,
  { manageTransaction = true, now = new Date() } = {}
) => {
  let transactionOpen = false;
  try {
    if (manageTransaction) {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      transactionOpen = true;
    }
    const existingTables = await readExistingTables(client);
    const checks = REQUIRED_TABLES.map((table) => ({
      name: `required_table:${table}`,
      ok: existingTables.has(table),
      violations: existingTables.has(table) ? '0' : '1'
    }));

    for (const definition of COUNT_CHECKS) {
      const missingTables = definition.tables.filter((table) => !existingTables.has(table));
      if (missingTables.length) {
        checks.push({
          name: definition.name,
          ok: false,
          violations: '0',
          skipped: true,
          reason: 'required_table_missing',
          missingTables
        });
        continue;
      }
      const result = await client.query(
        `/* artigen_database_audit:${definition.name} */\n${definition.sql}`
      );
      const violations = String(result.rows[0]?.violations || '0');
      checks.push({
        name: definition.name,
        ok: violations === '0',
        violations
      });
    }

    if (manageTransaction) {
      await client.query('COMMIT');
      transactionOpen = false;
    }
    const failedChecks = checks.filter((check) => !check.ok);
    const totalViolations = failedChecks.reduce(
      (total, check) => total + BigInt(check.violations || 0),
      0n
    );
    return {
      ok: failedChecks.length === 0,
      checkedAt: now.toISOString(),
      checks,
      failedChecks: failedChecks.map((check) => check.name),
      totalViolations: totalViolations.toString()
    };
  } catch (error) {
    if (manageTransaction && transactionOpen) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw error;
  }
};

module.exports = {
  COUNT_CHECKS,
  REQUIRED_TABLES,
  runDatabaseAudit
};

exports.shorthands = undefined;

exports.up = (pgm) => {
  // A wallet can legitimately grow past PostgreSQL INT_MAX after a purchase.
  // Keeping balances at integer would roll the whole verified callback back
  // forever for a near-limit account.
  pgm.sql(`
    ALTER TABLE wallets
      ALTER COLUMN available_credits TYPE bigint USING available_credits::bigint,
      ALTER COLUMN frozen_credits TYPE bigint USING frozen_credits::bigint;
    ALTER TABLE wallet_ledger
      ALTER COLUMN delta_available TYPE bigint USING delta_available::bigint,
      ALTER COLUMN delta_frozen TYPE bigint USING delta_frozen::bigint,
      ALTER COLUMN balance_available TYPE bigint USING balance_available::bigint,
      ALTER COLUMN balance_frozen TYPE bigint USING balance_frozen::bigint;
  `);

  pgm.addColumns('administrators', {
    active: { type: 'boolean', notNull: true, default: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('administrators', ['active', 'role'], {
    name: 'administrators_active_role_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('administrators', ['active', 'role'], {
    name: 'administrators_active_role_idx',
    ifExists: true
  });
  pgm.dropColumns('administrators', ['active', 'updated_at']);
  pgm.sql(`
    ALTER TABLE wallet_ledger
      ALTER COLUMN delta_available TYPE integer USING delta_available::integer,
      ALTER COLUMN delta_frozen TYPE integer USING delta_frozen::integer,
      ALTER COLUMN balance_available TYPE integer USING balance_available::integer,
      ALTER COLUMN balance_frozen TYPE integer USING balance_frozen::integer;
    ALTER TABLE wallets
      ALTER COLUMN available_credits TYPE integer USING available_credits::integer,
      ALTER COLUMN frozen_credits TYPE integer USING frozen_credits::integer;
  `);
};

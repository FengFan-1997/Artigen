exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('payment_orders', {
    legacy_order_id: { type: 'text' }
  });
  pgm.createIndex('payment_orders', 'legacy_order_id', {
    name: 'payment_orders_legacy_order_unique',
    unique: true,
    where: 'legacy_order_id IS NOT NULL'
  });

  pgm.sql(`
    CREATE FUNCTION reject_wallet_ledger_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'wallet_ledger is append-only' USING ERRCODE = '55000';
    END;
    $$;

    CREATE TRIGGER wallet_ledger_append_only
    BEFORE UPDATE OR DELETE ON wallet_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_wallet_ledger_mutation();

    CREATE FUNCTION protect_payment_order_snapshot()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.package_id IS DISTINCT FROM NEW.package_id
         OR OLD.provider IS DISTINCT FROM NEW.provider
         OR OLD.expected_amount_minor IS DISTINCT FROM NEW.expected_amount_minor
         OR OLD.currency IS DISTINCT FROM NEW.currency
         OR OLD.expected_credits IS DISTINCT FROM NEW.expected_credits
         OR OLD.legacy_order_id IS DISTINCT FROM NEW.legacy_order_id
         OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'payment order snapshot fields are immutable' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER payment_order_snapshot_immutable
    BEFORE UPDATE ON payment_orders
    FOR EACH ROW EXECUTE FUNCTION protect_payment_order_snapshot();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS payment_order_snapshot_immutable ON payment_orders;
    DROP FUNCTION IF EXISTS protect_payment_order_snapshot();
    DROP TRIGGER IF EXISTS wallet_ledger_append_only ON wallet_ledger;
    DROP FUNCTION IF EXISTS reject_wallet_ledger_mutation();
  `);
  pgm.dropIndex('payment_orders', 'legacy_order_id', {
    name: 'payment_orders_legacy_order_unique',
    ifExists: true
  });
  pgm.dropColumn('payment_orders', 'legacy_order_id', { ifExists: true });
};

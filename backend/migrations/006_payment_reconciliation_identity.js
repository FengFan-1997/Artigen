exports.shorthands = undefined;

exports.up = (pgm) => {
  // Database UUIDs are private canonical identities. Public legacy IDs must
  // never share that namespace, otherwise an unordered lookup can target the
  // wrong wallet.
  pgm.addConstraint('users', 'users_legacy_id_not_uuid', {
    check: `legacy_user_id IS NULL OR legacy_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`
  });

  // Only one active version may own a marketplace short alias such as
  // "starter". Exact UUID/full-SKU requests remain canonical.
  pgm.sql(`
    CREATE UNIQUE INDEX payment_packages_active_alias_unique
      ON payment_packages ((
        regexp_replace(
          regexp_replace(lower(sku), '^credits\\.', ''),
          '\\.v[0-9]+$', ''
        )
      ))
      WHERE active=true;
  `);

  pgm.addColumns('payment_callback_events', {
    attempt_count: { type: 'integer', notNull: true, default: 1, check: 'attempt_count > 0' },
    last_error: { type: 'text' }
  });
  pgm.sql(`
    UPDATE payment_callback_events
       SET status='dead_letter:' || substring(status from 10),
           last_error=substring(status from 10)
     WHERE status LIKE 'rejected:%';
  `);
  pgm.createIndex('payment_callback_events', ['status', 'received_at'], {
    name: 'payment_callback_dead_letter_idx',
    where: "status LIKE 'dead_letter:%'"
  });

  pgm.addColumns('credit_holds', {
    release_attempts: { type: 'integer', notNull: true, default: 0, check: 'release_attempts >= 0' },
    next_release_at: { type: 'timestamptz' },
    release_lease_until: { type: 'timestamptz' },
    last_release_error: { type: 'text' }
  });
  pgm.createIndex('credit_holds', ['status', 'expires_at', 'next_release_at', 'release_lease_until'], {
    name: 'credit_holds_release_sweep_idx',
    where: "status='held'"
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('credit_holds', ['status', 'expires_at', 'next_release_at', 'release_lease_until'], {
    name: 'credit_holds_release_sweep_idx',
    ifExists: true
  });
  pgm.dropColumns('credit_holds', [
    'release_attempts', 'next_release_at', 'release_lease_until', 'last_release_error'
  ]);
  pgm.dropIndex('payment_callback_events', ['status', 'received_at'], {
    name: 'payment_callback_dead_letter_idx',
    ifExists: true
  });
  pgm.sql(`
    UPDATE payment_callback_events
       SET status='rejected:' || substring(status from 13)
     WHERE status LIKE 'dead_letter:%';
  `);
  pgm.dropColumns('payment_callback_events', ['attempt_count', 'last_error']);
  pgm.sql('DROP INDEX IF EXISTS payment_packages_active_alias_unique;');
  pgm.dropConstraint('users', 'users_legacy_id_not_uuid', { ifExists: true });
};

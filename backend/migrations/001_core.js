/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('citext', { ifNotExists: true });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    legacy_user_id: { type: 'text', unique: true },
    email: { type: 'citext', unique: true },
    phone: { type: 'text', unique: true },
    display_name: { type: 'text', notNull: true, default: '' },
    password_hash: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'active', check: "status IN ('active','disabled','deleted')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('user_identities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    provider: { type: 'text', notNull: true },
    subject: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('user_identities', 'user_identities_provider_subject_unique', { unique: ['provider', 'subject'] });

  pgm.createTable('sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token_hash: { type: 'bytea', notNull: true, unique: true },
    csrf_hash: { type: 'bytea', notNull: true },
    user_agent_hash: { type: 'bytea' },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('sessions', ['user_id', 'expires_at']);

  pgm.createTable('otp_challenges', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    target_hash: { type: 'bytea', notNull: true },
    purpose: { type: 'text', notNull: true },
    code_hmac: { type: 'bytea', notNull: true },
    attempts: { type: 'smallint', notNull: true, default: 0, check: 'attempts BETWEEN 0 AND 5' },
    expires_at: { type: 'timestamptz', notNull: true },
    cooldown_until: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('otp_challenges', ['target_hash', 'purpose', 'created_at']);

  pgm.createTable('administrators', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, default: 'operator', check: "role IN ('operator','admin','owner')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('wallets', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'RESTRICT' },
    available_credits: { type: 'integer', notNull: true, default: 0, check: 'available_credits >= 0' },
    frozen_credits: { type: 'integer', notNull: true, default: 0, check: 'frozen_credits >= 0' },
    version: { type: 'bigint', notNull: true, default: 0, check: 'version >= 0' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('wallet_ledger', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    entry_type: { type: 'text', notNull: true, check: "entry_type IN ('purchase','hold','charge','release','refund','admin_adjustment','migration')" },
    delta_available: { type: 'integer', notNull: true, default: 0 },
    delta_frozen: { type: 'integer', notNull: true, default: 0 },
    balance_available: { type: 'integer', notNull: true, check: 'balance_available >= 0' },
    balance_frozen: { type: 'integer', notNull: true, check: 'balance_frozen >= 0' },
    reference_type: { type: 'text', notNull: true },
    reference_id: { type: 'text', notNull: true },
    idempotency_key: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('wallet_ledger', ['user_id', 'created_at']);
  pgm.createIndex('wallet_ledger', ['user_id', 'idempotency_key'], { unique: true, where: 'idempotency_key IS NOT NULL' });

  pgm.createTable('price_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    version: { type: 'integer', notNull: true, unique: true },
    active: { type: 'boolean', notNull: true, default: false },
    effective_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('price_skus', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    price_version_id: { type: 'uuid', notNull: true, references: 'price_versions', onDelete: 'RESTRICT' },
    sku: { type: 'text', notNull: true },
    credits: { type: 'integer', notNull: true, check: 'credits >= 0' },
    active: { type: 'boolean', notNull: true, default: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' }
  });
  pgm.addConstraint('price_skus', 'price_skus_version_sku_unique', { unique: ['price_version_id', 'sku'] });

  pgm.createTable('payment_packages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sku: { type: 'text', notNull: true, unique: true },
    title: { type: 'text', notNull: true },
    amount_minor: { type: 'integer', notNull: true, check: 'amount_minor > 0' },
    currency: { type: 'char(3)', notNull: true, default: 'CNY' },
    credits: { type: 'integer', notNull: true, check: 'credits > 0' },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('payment_orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    package_id: { type: 'uuid', notNull: true, references: 'payment_packages', onDelete: 'RESTRICT' },
    provider: { type: 'text', notNull: true },
    provider_order_id: { type: 'text' },
    expected_amount_minor: { type: 'integer', notNull: true, check: 'expected_amount_minor > 0' },
    currency: { type: 'char(3)', notNull: true },
    expected_credits: { type: 'integer', notNull: true, check: 'expected_credits > 0' },
    status: { type: 'text', notNull: true, default: 'pending', check: "status IN ('pending','paid','expired','cancelled','rejected')" },
    paid_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('payment_orders', ['provider', 'provider_order_id'], { unique: true, where: 'provider_order_id IS NOT NULL' });

  pgm.createTable('payment_callback_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    provider: { type: 'text', notNull: true },
    provider_event_id: { type: 'text', notNull: true },
    payment_order_id: { type: 'uuid', references: 'payment_orders', onDelete: 'RESTRICT' },
    payload_hash: { type: 'bytea', notNull: true },
    signature_valid: { type: 'boolean', notNull: true },
    status: { type: 'text', notNull: true },
    received_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    processed_at: { type: 'timestamptz' }
  });
  pgm.addConstraint('payment_callback_events', 'payment_callback_provider_event_unique', { unique: ['provider', 'provider_event_id'] });

  pgm.createTable('tool_task_quotes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true },
    price_version_id: { type: 'uuid', notNull: true, references: 'price_versions', onDelete: 'RESTRICT' },
    credits: { type: 'integer', notNull: true, check: 'credits >= 0' },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('tool_tasks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    tool_id: { type: 'text', notNull: true },
    operation: { type: 'text', notNull: true },
    options: { type: 'jsonb', notNull: true, default: '{}' },
    quote_id: { type: 'uuid', references: 'tool_task_quotes', onDelete: 'RESTRICT' },
    sku: { type: 'text' },
    quoted_credits: { type: 'integer', notNull: true, default: 0, check: 'quoted_credits >= 0' },
    charged_credits: { type: 'integer', notNull: true, default: 0, check: 'charged_credits >= 0' },
    refunded_credits: { type: 'integer', notNull: true, default: 0, check: 'refunded_credits >= 0' },
    idempotency_key: { type: 'text', notNull: true },
    request_hash: { type: 'bytea', notNull: true },
    status: { type: 'text', notNull: true, check: "status IN ('queued','running','success','failed','cancelled')" },
    error_code: { type: 'text' },
    result: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('tool_tasks', 'tool_tasks_user_idempotency_unique', { unique: ['user_id', 'idempotency_key'] });
  pgm.createIndex('tool_tasks', ['status', 'created_at']);

  pgm.createTable('credit_holds', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    task_id: { type: 'uuid', notNull: true, unique: true, references: 'tool_tasks', onDelete: 'RESTRICT' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    credits: { type: 'integer', notNull: true, check: 'credits >= 0' },
    status: { type: 'text', notNull: true, default: 'held', check: "status IN ('held','settled','released')" },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' }
  });
  pgm.createIndex('credit_holds', ['status', 'expires_at']);

  pgm.createTable('assets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // Never turn a private asset into a guest asset as a side effect of account
    // deletion. Account removal must explicitly delete/migrate owned assets.
    owner_user_id: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
    storage_driver: { type: 'text', notNull: true, check: "storage_driver IN ('file','s3')" },
    uri: { type: 'text', notNull: true, unique: true },
    mime_type: { type: 'text', notNull: true },
    byte_size: { type: 'bigint', notNull: true, check: 'byte_size > 0' },
    width: { type: 'integer', check: 'width IS NULL OR width > 0' },
    height: { type: 'integer', check: 'height IS NULL OR height > 0' },
    sha256: { type: 'bytea', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    expires_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('tool_task_assets', {
    task_id: { type: 'uuid', notNull: true, references: 'tool_tasks', onDelete: 'CASCADE' },
    asset_id: { type: 'uuid', notNull: true, references: 'assets', onDelete: 'RESTRICT' },
    role: { type: 'text', notNull: true, check: "role IN ('input','output')" },
    position: { type: 'integer', notNull: true, default: 0 }
  });
  pgm.addConstraint('tool_task_assets', 'tool_task_assets_pk', { primaryKey: ['task_id', 'asset_id', 'role'] });

  pgm.createTable('editor_transfers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    owner_user_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    asset_id: { type: 'uuid', notNull: true, references: 'assets', onDelete: 'RESTRICT' },
    consumed_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('audit_events', {
    id: { type: 'bigserial', primaryKey: true },
    actor_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    event_type: { type: 'text', notNull: true },
    target_type: { type: 'text' },
    target_id: { type: 'text' },
    request_id: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
};

exports.down = (pgm) => {
  [
    'audit_events', 'editor_transfers', 'tool_task_assets', 'assets', 'credit_holds',
    'tool_tasks', 'tool_task_quotes', 'payment_callback_events', 'payment_orders',
    'payment_packages', 'price_skus', 'price_versions', 'wallet_ledger', 'wallets',
    'administrators', 'otp_challenges', 'sessions', 'user_identities', 'users'
  ].forEach((table) => pgm.dropTable(table, { ifExists: true, cascade: true }));
};

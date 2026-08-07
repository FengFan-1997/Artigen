exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('otp_delivery_attempts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    idempotency_hash: { type: 'bytea', notNull: true },
    target_hash: { type: 'bytea', notNull: true },
    ip_hash: { type: 'bytea', notNull: true },
    purpose: { type: 'text', notNull: true },
    challenge_id: {
      type: 'uuid',
      references: 'otp_challenges',
      onDelete: 'SET NULL'
    },
    state: { type: 'text', notNull: true, default: 'reserved' },
    provider: { type: 'text' },
    provider_message_hash: { type: 'bytea' },
    error_code: { type: 'text' },
    cooldown_until: { type: 'timestamptz' },
    lease_expires_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('otp_delivery_attempts', 'otp_delivery_attempt_hash_shape_check', {
    check: `
      octet_length(idempotency_hash) = 32
      AND octet_length(target_hash) = 32
      AND octet_length(ip_hash) = 32
      AND (provider_message_hash IS NULL OR octet_length(provider_message_hash) = 32)
    `
  });
  pgm.addConstraint('otp_delivery_attempts', 'otp_delivery_attempt_purpose_check', {
    check: "purpose IN ('login','password-reset')"
  });
  pgm.addConstraint('otp_delivery_attempts', 'otp_delivery_attempt_state_check', {
    check: `
      state IN (
        'reserved','challenge_ready','accepted','debug','unknown','failed','rejected'
      )
    `
  });
  pgm.addConstraint('otp_delivery_attempts', 'otp_delivery_attempt_text_shape_check', {
    check: `
      (provider IS NULL OR length(provider) BETWEEN 1 AND 32)
      AND (error_code IS NULL OR length(error_code) BETWEEN 1 AND 96)
    `
  });
  pgm.createIndex('otp_delivery_attempts', ['idempotency_hash'], {
    name: 'otp_delivery_attempt_idempotency_idx',
    unique: true
  });
  pgm.createIndex('otp_delivery_attempts', ['target_hash', 'created_at'], {
    name: 'otp_delivery_attempt_target_quota_idx'
  });
  pgm.createIndex('otp_delivery_attempts', ['ip_hash', 'created_at'], {
    name: 'otp_delivery_attempt_ip_quota_idx'
  });
  pgm.createIndex('otp_delivery_attempts', ['state', 'created_at'], {
    name: 'otp_delivery_attempt_state_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('otp_delivery_attempts', { ifExists: true, cascade: true });
};

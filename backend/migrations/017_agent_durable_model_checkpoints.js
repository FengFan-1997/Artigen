/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('agent_model_checkpoints', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    run_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'agent_runs',
      onDelete: 'CASCADE'
    },
    algorithm: { type: 'text', notNull: true, default: 'aes-256-gcm-v1' },
    key_version: { type: 'smallint', notNull: true, default: 1 },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    ciphertext: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint(
    'agent_model_checkpoints',
    'agent_model_checkpoints_crypto_shape_check',
    {
      check: `
        algorithm='aes-256-gcm-v1'
        AND key_version > 0
        AND octet_length(iv)=12
        AND octet_length(auth_tag)=16
        AND octet_length(ciphertext) BETWEEN 1 AND 1048576
      `
    }
  );
  pgm.createIndex('agent_model_checkpoints', ['expires_at'], {
    name: 'agent_model_checkpoints_expiry_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropTable('agent_model_checkpoints', { ifExists: true, cascade: true });
};

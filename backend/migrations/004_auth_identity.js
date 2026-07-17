exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('users', {
    username: { type: 'citext', unique: true }
  });
  pgm.createIndex('sessions', ['expires_at'], {
    where: 'revoked_at IS NULL'
  });
  pgm.createIndex('otp_challenges', ['target_hash', 'purpose'], {
    name: 'otp_challenges_active_lookup_idx',
    where: 'consumed_at IS NULL'
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('otp_challenges', ['target_hash', 'purpose'], {
    name: 'otp_challenges_active_lookup_idx',
    ifExists: true
  });
  pgm.dropIndex('sessions', ['expires_at'], { ifExists: true });
  pgm.dropColumns('users', ['username']);
};

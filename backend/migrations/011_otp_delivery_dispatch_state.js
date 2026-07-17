exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('otp_delivery_attempts', {
    provider_dispatched_at: { type: 'timestamptz' }
  });
  pgm.createIndex('otp_delivery_attempts', ['state', 'lease_expires_at'], {
    name: 'otp_delivery_attempt_recovery_idx',
    where: "state IN ('reserved','challenge_ready')"
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('otp_delivery_attempts', ['state', 'lease_expires_at'], {
    name: 'otp_delivery_attempt_recovery_idx',
    ifExists: true
  });
  pgm.dropColumn('otp_delivery_attempts', 'provider_dispatched_at', {
    ifExists: true
  });
};

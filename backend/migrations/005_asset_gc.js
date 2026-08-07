exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('assets', {
    gc_state: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "gc_state IN ('active','writing','deleting')"
    },
    gc_lease_until: { type: 'timestamptz' },
    gc_attempts: { type: 'integer', notNull: true, default: 0, check: 'gc_attempts >= 0' },
    last_gc_error: { type: 'text' }
  });
  pgm.createIndex('assets', ['gc_state', 'expires_at', 'gc_lease_until'], {
    name: 'assets_gc_candidates_idx'
  });

  // Older installations used SET NULL, which could silently turn a private
  // asset into a guest-readable asset when its owner was deleted.
  pgm.dropConstraint('assets', 'assets_owner_user_id_fkey', { ifExists: true });
  pgm.addConstraint('assets', 'assets_owner_user_id_fkey', {
    foreignKeys: {
      columns: 'owner_user_id',
      references: 'users(id)',
      onDelete: 'RESTRICT'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('assets', 'assets_owner_user_id_fkey', { ifExists: true });
  pgm.addConstraint('assets', 'assets_owner_user_id_fkey', {
    foreignKeys: {
      columns: 'owner_user_id',
      references: 'users(id)',
      onDelete: 'SET NULL'
    }
  });
  pgm.dropIndex('assets', ['gc_state', 'expires_at', 'gc_lease_until'], {
    name: 'assets_gc_candidates_idx',
    ifExists: true
  });
  pgm.dropColumns('assets', ['gc_state', 'gc_lease_until', 'gc_attempts', 'last_gc_error']);
};

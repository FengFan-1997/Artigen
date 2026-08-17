/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_subagents', {
    consecutive_failures: {
      type: 'smallint',
      notNull: true,
      default: 0,
      check: 'consecutive_failures BETWEEN 0 AND 2'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('agent_subagents', ['consecutive_failures'], { ifExists: true });
};

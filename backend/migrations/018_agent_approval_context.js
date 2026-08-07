/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('agent_approvals', {
    evidence_summary: { type: 'text', notNull: true, default: '' },
    impact_summary: { type: 'text', notNull: true, default: '' },
    rollback_summary: { type: 'text', notNull: true, default: '' }
  });
  pgm.addConstraint('agent_approvals', 'agent_approvals_context_length_check', {
    check: `
      char_length(evidence_summary) <= 1000
      AND char_length(impact_summary) <= 1000
      AND char_length(rollback_summary) <= 1000
    `
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('agent_approvals', 'agent_approvals_context_length_check', {
    ifExists: true
  });
  pgm.dropColumns('agent_approvals', [
    'evidence_summary',
    'impact_summary',
    'rollback_summary'
  ]);
};

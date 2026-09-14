/* eslint-disable camelcase */

exports.shorthands = undefined;

// Conversation history is user-owned product data. Existing rows are moved
// to permanent retention; explicit DELETE remains the only normal removal
// path. Short-lived upload/editor transfer expiry is intentionally unchanged.
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE design_conversations SET expires_at = NULL;
    UPDATE design_messages SET expires_at = NULL;
  `);
};

exports.down = () => {};


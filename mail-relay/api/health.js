'use strict';

const { resolveConfig } = require('../lib/handler');

module.exports = (_request, response) => {
  response
    .status(resolveConfig(process.env) ? 200 : 503)
    .setHeader('Cache-Control', 'no-store')
    .setHeader('X-Content-Type-Options', 'nosniff')
    .json({ ok: Boolean(resolveConfig(process.env)) });
};

const paidFeaturesEnabled = (env = process.env) => {
  return /^(1|true)$/i.test(String(env.PAID_FEATURES_ENABLED || '').trim());
};

const paymentsEnabled = (env = process.env) => {
  if (Object.prototype.hasOwnProperty.call(env, 'PAYMENTS_ENABLED')) {
    return paidFeaturesEnabled(env) &&
      /^(1|true)$/i.test(String(env.PAYMENTS_ENABLED || '').trim());
  }
  return paidFeaturesEnabled(env);
};

module.exports = { paidFeaturesEnabled, paymentsEnabled };

// Signup display and wallet creation share the same configured amount.
const initialCredits = (env = process.env, override) => {
  const parsed = Number.parseInt(String(override ?? env.CREDITS_INIT ?? '100'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
};

module.exports = { initialCredits };

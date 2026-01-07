const credits = require('./credits');

const installImgagentRoutes = (app, opts) => {
  const assertAuthUserMatches = opts?.assertAuthUserMatches;

  app.get('/api/credits/balance', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (typeof assertAuthUserMatches === 'function') {
      const auth = assertAuthUserMatches(req, res, userId);
      if (!auth) return;
    }
    const bal = credits.getBalance(userId);
    if (!bal) return res.status(400).json({ error: 'UserId is required' });
    res.json(bal);
  });

  app.post('/api/pay/afdian/webhook', (req, res) => {
    const expected = String(process.env.AFDIAN_WEBHOOK_TOKEN || '').trim();
    if (expected) {
      const got =
        String(req.headers['x-afdian-token'] || '').trim() ||
        String(req.body?.token || '').trim();
      if (!got || got !== expected) return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const { afdianOrderId, userId, credits: creditsCount } = req.body || {};
    const uid = String(userId || '').trim();
    const result = credits.applyAfdianOrder({
      afdianOrderId,
      userId: uid,
      credits: creditsCount
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, alreadyProcessed: !!result.alreadyProcessed, wallet: result.wallet });
  });
};

module.exports = { installImgagentRoutes, credits };

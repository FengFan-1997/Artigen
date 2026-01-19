const crypto = require('crypto');
const { rateLimit } = require('../lib/rateLimit');
const {
  resolveConsoleAdminAccount,
  createAdminToken,
  assertAdmin,
  sanitizeUserProfile,
  readUsersMap
} = require('../lib/auth-utils');
const {
  readJson,
  USERS_FILE,
  CHATS_FILE,
  PAY_ORDERS_FILE,
  CREDITS_ORDERS_FILE,
  ANALYTICS_EVENTS_FILE,
  readUserMemory
} = require('../utils/storage');
const { credits: imgCredits } = require('../imgagent');

const clampInt = (n, min, max) => {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
};

const installAdminRoutes = (app) => {
  app.post('/api/admin/login', rateLimit('admin_login', { max: 30, windowMs: 60 * 1000 }), (req, res) => {
    try {
      const body = req && req.body && typeof req.body === 'object' ? req.body : {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return res.status(400).json({ error: 'INVALID_INPUT' });

      const cfg = resolveConsoleAdminAccount();
      const masterKey = String(process.env.ADMIN_KEY || '').trim();
      const masterOk = (() => {
        if (!masterKey) return false;
        try {
          const a = Buffer.from(password, 'utf8');
          const b = Buffer.from(masterKey, 'utf8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        } catch {
          return false;
        }
      })();
      if (!cfg.ok) {
        if (masterOk) {
          const issued = createAdminToken(username);
          return res.json({ ok: true, token: issued.token, expiresAt: issued.expiresAt });
        }
        return res.status(501).json({ error: 'ADMIN_ACCOUNT_NOT_CONFIGURED' });
      }

      const uOk = (() => {
        try {
          const a = Buffer.from(username, 'utf8');
          const b = Buffer.from(cfg.username, 'utf8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        } catch {
          return false;
        }
      })();
      const pOk = (() => {
        try {
          const a = Buffer.from(password, 'utf8');
          const b = Buffer.from(cfg.password, 'utf8');
          if (a.length !== b.length) return false;
          return crypto.timingSafeEqual(a, b);
        } catch {
          return false;
        }
      })();
      if ((!uOk || !pOk) && !masterOk) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

      const issued = createAdminToken(username);
      return res.json({ ok: true, token: issued.token, expiresAt: issued.expiresAt });
    } catch (e) {
      console.error('Error in POST /api/admin/login:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/users', rateLimit('admin_users', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const users = readUsersMap();
      const list = Object.values(users)
        .filter((u) => u && typeof u === 'object')
        .map((u) => sanitizeUserProfile(u))
        .map((u) => ({
          userId: String(u?.id || '').trim(),
          email: typeof u?.email === 'string' ? u.email : '',
          username: typeof u?.username === 'string' ? u.username : '',
          name: typeof u?.name === 'string' ? u.name : '',
          createdAt: Number(u?.createdAt || 0) || 0,
          lastSeen: Number(u?.lastSeen || 0) || 0,
          visits: Number(u?.visits || 0) || 0
        }))
        .filter((u) => !!u.userId)
        .filter((u) => {
          if (!q) return true;
          return (
            u.userId.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const total = list.length;
      const page = list.slice(offset, offset + limit);
      const items = page.map((u) => {
        let wallet = null;
        try {
          wallet = imgCredits.getBalance(u.userId);
        } catch { }
        return { ...u, wallet };
      });
      return res.json({ ok: true, total, items });
    } catch (e) {
      console.error('Error in GET /api/admin/users:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/chats/history', rateLimit('admin_chats_history', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const allChats = readJson(CHATS_FILE, {});
      const history = allChats && typeof allChats === 'object' && Array.isArray(allChats[userId]) ? allChats[userId] : [];
      const total = history.length;

      const end = Math.max(0, Math.min(total, total - offset));
      const start = Math.max(0, end - limit);
      const items = history.slice(start, end);
      return res.json({ ok: true, total, items });
    } catch (e) {
      console.error('Error in GET /api/admin/chats/history:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/orders', rateLimit('admin_orders', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const payRaw = readJson(PAY_ORDERS_FILE, {});
      const creditsRaw = readJson(CREDITS_ORDERS_FILE, {});
      const payMap = payRaw && typeof payRaw === 'object' ? payRaw : {};
      const creditsMap = creditsRaw && typeof creditsRaw === 'object' ? creditsRaw : {};

      const payItems = Object.values(payMap)
        .filter((o) => o && typeof o === 'object' && String(o.userId || '').trim() === userId)
        .map((o) => ({
          kind: 'pay',
          id: String(o.orderId || '').trim(),
          orderId: String(o.orderId || '').trim(),
          userId: String(o.userId || '').trim(),
          packageId: String(o.packageId || '').trim(),
          amountCny: Number(o.amountCny ?? 0) || 0,
          credits: Number(o.credits ?? 0) || 0,
          createdAt: Number(o.createdAt ?? 0) || 0,
          updatedAt: Number(o.updatedAt ?? 0) || 0
        }))
        .filter((o) => !!o.id);

      const creditsItems = Object.values(creditsMap)
        .filter((o) => o && typeof o === 'object' && String(o.userId || '').trim() === userId)
        .map((o) => ({
          kind: 'credits',
          id: String(o.afdianOrderId || '').trim(),
          afdianOrderId: String(o.afdianOrderId || '').trim(),
          userId: String(o.userId || '').trim(),
          packageId: typeof o.packageId === 'string' ? String(o.packageId || '').trim() : '',
          credits: Number(o.credits ?? 0) || 0,
          createdAt: Number(o.createdAt ?? 0) || 0
        }))
        .filter((o) => !!o.id);

      const all = [...payItems, ...creditsItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const total = all.length;
      const items = all.slice(offset, offset + limit);
      return res.json({ ok: true, total, items });
    } catch (e) {
      console.error('Error in GET /api/admin/orders:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/admin/users/credits', rateLimit('admin_user_credits', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const body = req && req.body && typeof req.body === 'object' ? req.body : {};
      const userId = String(body.userId || '').trim();
      const availableRaw = Number.parseInt(String(body.available ?? ''), 10);
      const available = Number.isFinite(availableRaw) && availableRaw >= 0 ? availableRaw : null;
      if (!userId) return res.status(400).json({ error: 'MISSING_USER_ID' });
      if (available === null) return res.status(400).json({ error: 'INVALID_AVAILABLE' });

      const result = imgCredits.setAvailableCredits({ userId, available });
      if (!result || !result.ok) return res.status(400).json({ error: result?.error || 'SET_CREDITS_FAILED' });
      return res.json({ ok: true, wallet: result.wallet || null });
    } catch (e) {
      console.error('Error in POST /api/admin/users/credits:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/images/history', rateLimit('admin_images_history', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      let items = [];

      if (userId) {
        const mem = readUserMemory(userId, {});
        items = Array.isArray(mem?.image_history) ? mem.image_history : [];
      } else {
        const users = readUsersMap();
        const allIds = Object.values(users)
          .map((u) => String(u?.id || '').trim())
          .filter(Boolean);

        for (const uid of allIds) {
          const mem = readUserMemory(uid, {});
          if (Array.isArray(mem?.image_history)) {
            items.push(...mem.image_history);
          }
        }
      }

      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const total = items.length;
      const page = items.slice(offset, offset + limit);
      return res.json({ ok: true, total, items: page });
    } catch (e) {
      console.error('Error in GET /api/admin/images/history:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/events', rateLimit('admin_events', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const userId = String(req.query.userId || '').trim();
      const limit = clampInt(req.query.limit, 50, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const allEvents = readJson(ANALYTICS_EVENTS_FILE, []);
      let filtered = Array.isArray(allEvents) ? allEvents : [];

      if (userId) {
        filtered = filtered.filter((e) => String(e?.userId || '') === userId);
      }

      filtered.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const total = filtered.length;
      const page = filtered.slice(offset, offset + limit);
      return res.json({ ok: true, total, items: page });
    } catch (e) {
      console.error('Error in GET /api/admin/events:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

module.exports = { installAdminRoutes };

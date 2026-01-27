const installUsageRoutes = (app, deps) => {
  const rateLimit = deps?.rateLimit;
  const assertAuthUserMatches = deps?.assertAuthUserMatches;
  const assertAdmin = deps?.assertAdmin;
  const sanitizeLedgerId = deps?.sanitizeLedgerId;
  const computeCreditsDelta = deps?.computeCreditsDelta;
  const upsertUsageLedgerItem = deps?.upsertUsageLedgerItem;
  const readUsageLedgerStore = deps?.readUsageLedgerStore;
  const getClientIp = deps?.getClientIp;
  const clampInt = deps?.clampInt;
  const appendAnalyticsEvent = deps?.appendAnalyticsEvent;
  const readAnalyticsEventsStore = deps?.readAnalyticsEventsStore;
  const readUsersMap = deps?.readUsersMap;

  const stringifyPageContext = (input) => {
    if (typeof input === 'string') return input.trim();
    if (!input) return '';
    try {
      return JSON.stringify(input);
    } catch {
      return '';
    }
  };

  app.post('/api/collection/event', rateLimit('collection_event', { max: 180, windowMs: 60 * 1000 }), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const eventType = sanitizeLedgerId(body.eventType, 'event');
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
      const path = String(body.path || '').trim();
      const location = String(body.location || '').trim();
      const referrer = String(body.referrer || '').trim();
      const ts = typeof body.ts === 'number' && Number.isFinite(body.ts) ? body.ts : Date.now();
      const userId = sanitizeLedgerId(body.userId, '');
      const requestId = sanitizeLedgerId(body.requestId, '');
      const sessionId = sanitizeLedgerId(body.sessionId, '');
      const projectId = sanitizeLedgerId(body.projectId, '');
      const pageContext = stringifyPageContext(body.pageContext);
      const requestSource = String(body.requestSource || '').trim();

      const item = appendAnalyticsEvent({
        ...(requestId ? { id: requestId, requestId } : {}),
        ts,
        eventType,
        payload,
        path,
        location,
        referrer,
        userId,
        ...(sessionId ? { sessionId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(pageContext ? { pageContext } : {}),
        ...(requestSource ? { requestSource } : {}),
        req
      });
      return res.json({ ok: true, item });
    } catch (e) {
      console.error('Error in POST /api/collection/event:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/collection/events', rateLimit('admin_collection_events', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const limit = clampInt(req.query.limit, 50, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);
      const eventType = String(req.query.eventType || '').trim().toLowerCase();

      const store = readAnalyticsEventsStore();
      const all = store.items
        .filter((x) => (eventType ? String(x?.eventType || '').toLowerCase() === eventType : true))
        .sort((a, b) => (Number(b?.ts || 0) || 0) - (Number(a?.ts || 0) || 0));
      const items = all.slice(offset, offset + limit);
      return res.json({ ok: true, total: all.length, items });
    } catch (e) {
      console.error('Error in GET /api/admin/collection/events:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/usage/ingest', rateLimit('usage_ingest', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = String(body.userId || '').trim() || 'anonymous';
      if (!assertAuthUserMatches(req, res, userId)) return;

      const requestId = sanitizeLedgerId(body.requestId);
      if (!requestId) return res.status(400).json({ error: 'requestId is required' });

      const tokensIn = Number(body.tokensIn ?? body.promptTokens ?? 0) || 0;
      const tokensOut = Number(body.tokensOut ?? body.completionTokens ?? 0) || 0;
      const tokensTotal = Number(body.tokensTotal ?? body.totalTokens ?? 0) || 0;
      const ragUsed = !!(body.rag && body.rag.used);
      const creditsDeltaRaw = body.creditsDelta;
      const creditsDelta =
        typeof creditsDeltaRaw === 'number'
          ? creditsDeltaRaw
          : Number.isFinite(Number(creditsDeltaRaw))
            ? Number(creditsDeltaRaw)
            : computeCreditsDelta({ tokensTotal, ragUsed });

      const item = {
        requestId,
        ts: typeof body.ts === 'number' ? body.ts : Date.now(),
        userId,
        sessionId: sanitizeLedgerId(body.sessionId),
        projectId: sanitizeLedgerId(body.projectId),
        trigger: String(body.trigger || '').trim().slice(0, 80),
        provider: String(body.provider || '').trim().slice(0, 40),
        model: String(body.model || '').trim().slice(0, 80),
        usedUrl: String(body.usedUrl || '').trim().slice(0, 240),
        tokensIn: Math.max(0, tokensIn),
        tokensOut: Math.max(0, tokensOut),
        tokensTotal: Math.max(0, tokensTotal || tokensIn + tokensOut),
        creditsDelta,
        rag: body.rag && typeof body.rag === 'object' ? body.rag : undefined,
        plan: body.plan && typeof body.plan === 'object' ? body.plan : undefined,
        status: String(body.status || '').trim().slice(0, 40),
        durationMs: typeof body.durationMs === 'number' ? Math.max(0, body.durationMs) : undefined,
        ip: getClientIp(req),
        ua: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : ''
      };

      const result = upsertUsageLedgerItem(item);
      if (!result.ok) return res.status(400).json({ error: result.error || 'Bad Request' });
      res.json({ ok: true, existed: result.existed, item: result.item });
    } catch (error) {
      console.error('Error in POST /api/usage/ingest:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  const parseTime = (raw) => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const s = String(raw || '').trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) return n;
    const d = Date.parse(s);
    return Number.isFinite(d) ? d : null;
  };

  app.get('/api/usage/ledger', rateLimit('usage_ledger', { max: 120, windowMs: 60 * 1000 }), (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim() || 'anonymous';
      if (!assertAuthUserMatches(req, res, userId)) return;

      const from = parseTime(req.query.from);
      const to = parseTime(req.query.to);
      const trigger = String(req.query.trigger || '').trim().toLowerCase();
      const model = String(req.query.model || '').trim().toLowerCase();
      const sessionId = sanitizeLedgerId(req.query.sessionId);
      const projectId = sanitizeLedgerId(req.query.projectId);

      const limit = clampInt(req.query.limit, 20, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const store = readUsageLedgerStore();
      const all = store.items
        .filter((x) => String(x?.userId || '') === userId)
        .filter((x) => {
          const ts = Number(x?.ts || 0) || 0;
          if (from && ts < from) return false;
          if (to && ts > to) return false;
          if (trigger && String(x?.trigger || '').toLowerCase() !== trigger) return false;
          if (model && String(x?.model || '').toLowerCase() !== model) return false;
          if (sessionId && String(x?.sessionId || '') !== sessionId) return false;
          if (projectId && String(x?.projectId || '') !== projectId) return false;
          return true;
        })
        .sort((a, b) => (Number(b?.ts || 0) || 0) - (Number(a?.ts || 0) || 0));

      const items = all.slice(offset, offset + limit);
      res.json({ ok: true, total: all.length, items });
    } catch (error) {
      console.error('Error in GET /api/usage/ledger:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/admin/usage/ledger', rateLimit('admin_usage_ledger', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;

      const userId = String(req.query.userId || '').trim();
      const from = parseTime(req.query.from);
      const to = parseTime(req.query.to);
      const trigger = String(req.query.trigger || '').trim().toLowerCase();
      const model = String(req.query.model || '').trim().toLowerCase();
      const sessionId = sanitizeLedgerId(req.query.sessionId);
      const projectId = sanitizeLedgerId(req.query.projectId);

      const limit = clampInt(req.query.limit, 200, 2000);
      const offset = clampInt(req.query.offset, 0, 2000000);

      const store = readUsageLedgerStore();
      const all = store.items
        .filter((x) => (userId ? String(x?.userId || '') === userId : true))
        .filter((x) => {
          const ts = Number(x?.ts || 0) || 0;
          if (from && ts < from) return false;
          if (to && ts > to) return false;
          if (trigger && String(x?.trigger || '').toLowerCase() !== trigger) return false;
          if (model && String(x?.model || '').toLowerCase() !== model) return false;
          if (sessionId && String(x?.sessionId || '') !== sessionId) return false;
          if (projectId && String(x?.projectId || '') !== projectId) return false;
          return true;
        })
        .sort((a, b) => (Number(b?.ts || 0) || 0) - (Number(a?.ts || 0) || 0));

      const users = readUsersMap();
      const usersIndex = (() => {
        const idx = new Map();
        if (!users || typeof users !== 'object') return idx;
        for (const [k, raw] of Object.entries(users)) {
          const u = raw && typeof raw === 'object' ? raw : null;
          if (!u) continue;
          const key = String(k || '').trim();
          const id = typeof u.id === 'string' ? u.id.trim() : '';
          const userId0 = typeof u.userId === 'string' ? u.userId.trim() : '';
          const email0 = typeof u.email === 'string' ? u.email.trim() : '';
          const username0 = typeof u.username === 'string' ? u.username.trim() : '';
          for (const alias of [key, id, userId0, email0, username0]) {
            if (!alias) continue;
            if (!idx.has(alias)) idx.set(alias, u);
          }
        }
        return idx;
      })();
      const getUserBrief = (uid) => {
        const key = String(uid || '').trim();
        const u = key ? (usersIndex.get(key) || (users && typeof users === 'object' ? users[key] : null)) : null;
        const username = typeof u?.username === 'string' ? u.username : '';
        const email = typeof u?.email === 'string' ? u.email : '';
        return { username, email };
      };

      const items = all.slice(offset, offset + limit).map((x) => {
        const uid = String(x?.userId || '').trim();
        return { ...x, ...getUserBrief(uid) };
      });
      return res.json({ ok: true, total: all.length, items });
    } catch (e) {
      console.error('Error in GET /api/admin/usage/ledger:', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/usage/summary', rateLimit('usage_summary', { max: 60, windowMs: 60 * 1000 }), (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim() || 'anonymous';
      if (!assertAuthUserMatches(req, res, userId)) return;

      const from = parseTime(req.query.from);
      const to = parseTime(req.query.to);
      const groupBy = String(req.query.groupBy || 'day').trim().toLowerCase();

      const store = readUsageLedgerStore();
      const items = store.items
        .filter((x) => String(x?.userId || '') === userId)
        .filter((x) => {
          const ts = Number(x?.ts || 0) || 0;
          if (from && ts < from) return false;
          if (to && ts > to) return false;
          return true;
        });

      const bucketKey = (x) => {
        if (groupBy === 'trigger') return String(x?.trigger || '') || 'unknown';
        if (groupBy === 'model') return String(x?.model || '') || 'unknown';
        if (groupBy === 'projectid') return String(x?.projectId || '') || 'unknown';
        if (groupBy === 'sessionid') return String(x?.sessionId || '') || 'unknown';
        const ts = Number(x?.ts || 0) || 0;
        const d = new Date(ts || Date.now());
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const groups = new Map();
      const totals = { count: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0, credits: 0 };
      for (const x of items) {
        const key = bucketKey(x);
        const cur = groups.get(key) || { key, count: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0, credits: 0 };
        const tokensIn = Number(x?.tokensIn || 0) || 0;
        const tokensOut = Number(x?.tokensOut || 0) || 0;
        const tokensTotal = Number(x?.tokensTotal || 0) || (tokensIn + tokensOut);
        const credits = Number(x?.creditsDelta || 0) || 0;
        cur.count += 1;
        cur.tokensIn += tokensIn;
        cur.tokensOut += tokensOut;
        cur.tokensTotal += tokensTotal;
        cur.credits += credits;
        groups.set(key, cur);

        totals.count += 1;
        totals.tokensIn += tokensIn;
        totals.tokensOut += tokensOut;
        totals.tokensTotal += tokensTotal;
        totals.credits += credits;
      }

      const list = Array.from(groups.values()).sort((a, b) => {
        if (groupBy === 'day') return String(a.key).localeCompare(String(b.key));
        return Number(b.credits || 0) - Number(a.credits || 0);
      });

      res.json({ ok: true, groupBy, totals, groups: list });
    } catch (error) {
      console.error('Error in GET /api/usage/summary:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

module.exports = { installUsageRoutes };

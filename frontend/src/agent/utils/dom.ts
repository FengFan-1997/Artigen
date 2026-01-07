const isVisible = (el: HTMLElement): boolean => {
  try {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) <= 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    if (el.offsetParent === null && style.position !== 'fixed') return false;
    return true;
  } catch {
    return false;
  }
};

export const findByText = (text: string): HTMLElement | null => {
  const q = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return null;

  const normalize = (s: unknown) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  const lower = (s: unknown) => normalize(s).toLowerCase();

  const getViewportDist = (el: HTMLElement) => {
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const vx = window.innerWidth / 2;
      const vy = window.innerHeight / 2;
      const dx = cx - vx;
      const dy = cy - vy;
      return Math.sqrt(dx * dx + dy * dy);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  const isDisabled = (el: HTMLElement) => {
    try {
      const anyEl = el as any;
      if (typeof anyEl.disabled === 'boolean' && anyEl.disabled) return true;
      const ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase();
      if (ariaDisabled === 'true') return true;
      return false;
    } catch {
      return false;
    }
  };

  const getTextParts = (el: HTMLElement) => {
    const aria = normalize(el.getAttribute('aria-label'));
    const title = normalize(el.getAttribute('title'));
    const placeholder = normalize((el as any).placeholder);
    const alt = normalize((el as any).alt);
    const value = normalize((el as any).value);
    const name = normalize((el as any).name);
    const id = normalize((el as any).id);
    const textContent = normalize(el.innerText || el.textContent || '');
    return { textContent, aria, title, placeholder, alt, value, name, id };
  };

  const scoreCandidate = (el: HTMLElement, needleRaw: string) => {
    const tag = el.tagName.toLowerCase();
    const role = lower(el.getAttribute('role'));
    const needle = lower(needleRaw);
    const parts = getTextParts(el);
    const haystackParts = [
      lower(parts.textContent),
      lower(parts.aria),
      lower(parts.title),
      lower(parts.placeholder),
      lower(parts.alt),
      lower(parts.value)
    ].filter(Boolean);
    const has = haystackParts.some((p) => p.includes(needle));
    if (!has) return null;
    const exact = haystackParts.some((p) => p === needle);
    const starts = !exact && haystackParts.some((p) => p.startsWith(needle));
    let weight = 1;
    if (tag === 'button') weight = 6;
    else if (tag === 'a') weight = 5;
    else if (tag === 'input' || tag === 'textarea' || tag === 'select') weight = 4;
    else if (role === 'button') weight = 4;
    else if (role === 'tab' || role === 'menuitem') weight = 3;
    else if (/^h[1-4]$/.test(tag)) weight = 2;
    if (exact) weight += 4;
    else if (starts) weight += 2;
    else weight += 1;
    if (el.hasAttribute('data-agent-target')) weight += 1;
    if (isDisabled(el)) weight -= 2;
    const dist = getViewportDist(el);
    if (Number.isFinite(dist) && dist !== Number.POSITIVE_INFINITY) {
      const maxDist = Math.sqrt(
        Math.pow(window.innerWidth / 2, 2) + Math.pow(window.innerHeight / 2, 2)
      );
      const closeness = maxDist > 0 ? Math.max(0, Math.min(1, 1 - dist / maxDist)) : 0;
      weight += closeness * 2;
    }
    const shouldPromoteToControl = tag === 'label';
    if (shouldPromoteToControl) {
      try {
        const label = el as HTMLLabelElement;
        const control = (label as any).control as HTMLElement | null;
        const forId = normalize((label as any).htmlFor);
        const forEl = forId ? (document.getElementById(forId) as HTMLElement | null) : null;
        const next = (control || forEl) as HTMLElement | null;
        if (
          next &&
          next instanceof HTMLElement &&
          isVisible(next) &&
          !next.hasAttribute('data-agent-block')
        ) {
          return { el: next, score: weight + 1, dist: getViewportDist(next) };
        }
      } catch {}
    }
    return { el, score: weight, dist };
  };

  const candidates = Array.from(
    document.querySelectorAll(
      'button, a, input, textarea, select, [role="button"], label, h1, h2, h3, h4, [data-agent-target]'
    )
  ) as HTMLElement[];

  const scored = [];
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    if (el.hasAttribute('data-agent-block')) continue;
    const hit = scoreCandidate(el, q);
    if (hit) scored.push(hit);
  }
  scored.sort((a, b) => (b.score === a.score ? a.dist - b.dist : b.score - a.score));
  if (scored.length > 0) return scored[0].el;

  const escapeXpathLiteral = (s: string) => {
    const v = String(s || '');
    if (!v.includes("'")) return `'${v}'`;
    const parts = v.split("'");
    const seq = [];
    for (let i = 0; i < parts.length; i++) {
      seq.push(`'${parts[i]}'`);
      if (i !== parts.length - 1) seq.push(`"'"`);
    }
    return `concat(${seq.join(',')})`;
  };

  const lit = escapeXpathLiteral(q);
  const xpath = `//*[(self::button or self::a or @role='button' or self::label or self::h1 or self::h2 or self::h3 or self::h4) and contains(normalize-space(.), ${lit})] | //*[contains(normalize-space(.), ${lit})]`;
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    const max = Math.min(40, result.snapshotLength);
    const hits: Array<{ el: HTMLElement; score: number; dist: number }> = [];
    for (let i = 0; i < max; i++) {
      const node = result.snapshotItem(i) as HTMLElement | null;
      if (!node || !(node instanceof HTMLElement)) continue;
      if (!isVisible(node) || node.hasAttribute('data-agent-block')) continue;
      const hit = scoreCandidate(node, q);
      if (hit) hits.push(hit);
    }
    hits.sort((a, b) => (b.score === a.score ? a.dist - b.dist : b.score - a.score));
    if (hits.length > 0) return hits[0].el;
  } catch {}

  return null;
};

/**
 * Resolve a target string to an HTMLElement.
 * Handles 'text:' prefix.
 */
export const resolveTarget = (target: string): HTMLElement | null => {
  if (!target) return null;

  const rawTarget = String(target || '').trim();
  if (!rawTarget) return null;
  if (rawTarget.length > 260) return null;

  if (rawTarget.startsWith('text:')) {
    const text = rawTarget.replace('text:', '').trim();
    return findByText(text);
  }

  const toTextCandidate = (raw: string) => {
    const t = String(raw || '')
      .replace(/[#.[\]():>+~*"'=,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < 2) return '';
    return t.slice(0, 80);
  };

  try {
    if (rawTarget.includes('*') || /:has\s*\(/i.test(rawTarget)) {
      const fallback = toTextCandidate(rawTarget);
      return fallback ? findByText(fallback) : null;
    }

    const first = document.querySelector(rawTarget) as HTMLElement | null;
    if (first && first instanceof HTMLElement) {
      if (!first.hasAttribute('data-agent-block') && isVisible(first)) return first;
    }

    const nodeList = document.querySelectorAll(rawTarget);
    const broad = !/[#.[\]:]/.test(rawTarget);
    const max = Math.min(broad ? 18 : 60, nodeList.length);
    if (max > 0) {
      const scored: Array<{ el: HTMLElement; score: number }> = [];
      for (let idx = 0; idx < max; idx++) {
        const el = nodeList[idx] as HTMLElement | null;
        if (!el || !(el instanceof HTMLElement)) continue;
        if (el.hasAttribute('data-agent-block')) continue;
        if (!isVisible(el)) continue;
        const hit = (() => {
          try {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const inViewport =
              cx >= 0 &&
              cy >= 0 &&
              cx <= (window.innerWidth || document.documentElement.clientWidth) &&
              cy <= (window.innerHeight || document.documentElement.clientHeight);
            const area = Math.max(0, rect.width * rect.height);
            let score = 1;
            if (inViewport) score += 2;
            score += Math.min(2, area / 20000);
            return { el, score };
          } catch {
            return { el, score: 1 };
          }
        })();
        scored.push(hit);
      }
      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) return scored[0].el;
    }

    const fallback = toTextCandidate(rawTarget);
    return fallback ? findByText(fallback) : null;
  } catch {
    const raw = rawTarget;
    const isSelectorish = /[#.[\]():>+~*]|\\/.test(raw);
    if (!isSelectorish && raw.length <= 80) return findByText(raw);
    try {
      const fallback = toTextCandidate(raw) || raw;
      return findByText(fallback);
    } catch {
      return null;
    }
  }
};

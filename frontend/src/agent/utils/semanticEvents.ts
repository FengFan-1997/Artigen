export type InteractionSample = {
  ts: number;
  x: number;
  y: number;
  speed: number;
  relX: number;
  relY: number;
  hitAreas?: string[];
};

export type InteractionMetrics = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  clickCount: number;
  spinDegrees: number;
  samples: number;
  maxSpeed: number;
  avgSpeed: number;
  hitAreaCounts: Record<string, number>;
  primaryHitAreas: string[];
};

export type SemanticInteractionContext = {
  primaryTargets: string[];
  tags: string[];
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const normalizeArea = (s: string) => (s || '').toLowerCase().trim();

const pickTopKeys = (counts: Record<string, number>, topN: number) => {
  const entries = Object.entries(counts).filter(([, n]) => typeof n === 'number' && n > 0);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, Math.max(0, topN)).map(([k]) => k);
};

export const buildInteractionMetrics = (input: {
  samples: InteractionSample[];
  clickCount: number;
  spinDegrees: number;
}): InteractionMetrics => {
  const samples = input.samples || [];
  const startedAt = samples.length > 0 ? samples[0].ts : Date.now();
  const endedAt = samples.length > 0 ? samples[samples.length - 1].ts : startedAt;
  const durationMs = Math.max(0, endedAt - startedAt);

  let maxSpeed = 0;
  let speedSum = 0;
  const hitAreaCounts: Record<string, number> = {};

  for (const s of samples) {
    const sp = Number.isFinite(s.speed) ? s.speed : 0;
    if (sp > maxSpeed) maxSpeed = sp;
    speedSum += sp;
    if (Array.isArray(s.hitAreas)) {
      for (const a of s.hitAreas) {
        const key = normalizeArea(a);
        if (!key) continue;
        hitAreaCounts[key] = (hitAreaCounts[key] || 0) + 1;
      }
    }
  }

  const avgSpeed = samples.length > 0 ? speedSum / samples.length : 0;
  const primaryHitAreas = pickTopKeys(hitAreaCounts, 4);

  return {
    startedAt,
    endedAt,
    durationMs,
    clickCount: input.clickCount || 0,
    spinDegrees: input.spinDegrees || 0,
    samples: samples.length,
    maxSpeed,
    avgSpeed,
    hitAreaCounts,
    primaryHitAreas
  };
};

const speedBucket = (pxPerMs: number) => {
  if (pxPerMs <= 0.25) return 'slow';
  if (pxPerMs <= 0.7) return 'normal';
  if (pxPerMs <= 1.4) return 'fast';
  return 'very_fast';
};

const spinBucket = (deg: number) => {
  const a = Math.abs(deg);
  if (a < 120) return 'small';
  if (a < 280) return 'medium';
  if (a < 420) return 'full';
  return 'multi';
};

const hitsToText = (hits: string[]) => {
  const filtered = hits.map(normalizeArea).filter(Boolean);
  const unique = Array.from(new Set(filtered));
  return unique.slice(0, 6).join(', ');
};

const mapAreaToTarget = (raw: string) => {
  const s = normalizeArea(raw);
  if (!s) return 'unknown';

  if (/(accessory|ribbon|bow|pin|clip|bell|hat|crown|earring|necklace)/i.test(s))
    return 'accessory';
  if (/(eye|eyes|瞳|眼)/i.test(s)) return 'eyes';
  if (/(cheek|face|頬|ほお|脸|脸颊)/i.test(s)) return 'cheek';
  if (/(mouth|lip|嘴|口)/i.test(s)) return 'mouth';
  if (/(hair|bang|braid|辫|发)/i.test(s)) return 'hair';
  if (/(head|forehead|额|头)/i.test(s)) return 'head';
  if (/(hand|arm|finger|手|胳膊|臂)/i.test(s)) return 'hand';
  if (/(bust|boob|breast|chest|torso|body|胸|躯干|身|肚)/i.test(s)) return 'body';
  if (/(leg|foot|feet|knee|腿|脚)/i.test(s)) return 'legs';
  return 'unknown';
};

const buildTargetCounts = (counts: Record<string, number>) => {
  const targetCounts: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts || {})) {
    const v = typeof n === 'number' ? n : 0;
    if (v <= 0) continue;
    const t = mapAreaToTarget(k);
    targetCounts[t] = (targetCounts[t] || 0) + v;
  }
  return targetCounts;
};

const pickPrimaryTargets = (counts: Record<string, number>) => {
  const top = pickTopKeys(counts, 3);
  return top.length ? top : ['unknown'];
};

const pushTag = (tags: string[], v: string) => {
  const s = String(v || '').trim();
  if (!s) return;
  if (!tags.includes(s)) tags.push(s);
};

export const buildSemanticInteractionContext = (
  metrics: InteractionMetrics
): SemanticInteractionContext => {
  const targetCounts = buildTargetCounts(metrics.hitAreaCounts || {});
  const primaryTargets = pickPrimaryTargets(targetCounts);

  const durationMs = Math.max(0, metrics.durationMs || 0);
  const clicks = Math.max(0, metrics.clickCount || 0);
  const spin = Math.abs(metrics.spinDegrees || 0);
  const maxSpeed = Math.max(0, metrics.maxSpeed || 0);
  const avgSpeed = Math.max(0, metrics.avgSpeed || 0);

  const tags: string[] = [];
  if (spin >= 360) pushTag(tags, 'USER_MAKING_ME_DIZZY');
  else if (spin >= 180) pushTag(tags, 'USER_CIRCLING_ME');

  if (clicks >= 6) pushTag(tags, 'USER_RAPID_TAPS');
  else if (clicks >= 3) pushTag(tags, 'USER_MULTI_TAPS');
  else if (clicks >= 1) pushTag(tags, 'USER_TAPS');

  if (durationMs >= 1200 && avgSpeed <= 0.25) pushTag(tags, 'USER_SLOW_HOVER');
  if (durationMs >= 600 && maxSpeed >= 1.4) pushTag(tags, 'USER_FAST_SWEEP');

  const totalHits = Object.values(targetCounts).reduce(
    (sum, n) => sum + (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0),
    0
  );
  const ratio = (k: string) => {
    const n = typeof targetCounts[k] === 'number' ? targetCounts[k] : 0;
    if (totalHits <= 0) return 0;
    return n / totalHits;
  };

  const tagByTarget = (target: string, tag: string, minRatio = 0.28, minHits = 4) => {
    const hits = typeof targetCounts[target] === 'number' ? targetCounts[target] : 0;
    if (hits >= minHits && ratio(target) >= minRatio) pushTag(tags, tag);
  };

  tagByTarget('eyes', 'USER_STARING_EYES', durationMs >= 900 ? 0.18 : 0.28, 3);
  tagByTarget('cheek', 'USER_STROKES_CHEEK', 0.22, 3);
  tagByTarget('head', 'USER_PATS_HEAD', 0.26, 3);
  tagByTarget('hair', 'USER_TOUCHES_HAIR', 0.26, 3);
  tagByTarget('accessory', 'USER_TOUCHES_ACCESSORY', 0.22, 2);
  tagByTarget('body', 'USER_TOUCHES_BODY', 0.18, 2);
  tagByTarget('hand', 'USER_TOUCHES_HAND', 0.24, 3);
  tagByTarget('mouth', 'USER_TOUCHES_MOUTH', 0.18, 2);

  if (
    tags.includes('USER_SLOW_HOVER') &&
    clicks <= 2 &&
    (ratio('head') + ratio('hair') >= 0.42 || ratio('cheek') >= 0.28)
  ) {
    pushTag(tags, 'USER_GENTLE_PETTING');
  }
  if (clicks >= 4 && (tags.includes('USER_TOUCHES_BODY') || tags.includes('USER_TOUCHES_MOUTH'))) {
    pushTag(tags, 'USER_TEASING');
  }

  return { primaryTargets, tags };
};

const computeInteractionIntensity = (
  metrics: InteractionMetrics,
  semantic: SemanticInteractionContext
) => {
  const clicks = Math.max(0, metrics?.clickCount || 0);
  const spin = Math.abs(metrics?.spinDegrees || 0);
  const maxSpeed = Math.max(0, metrics?.maxSpeed || 0);
  const durationMs = Math.max(0, metrics?.durationMs || 0);
  const avgSpeed = Math.max(0, metrics?.avgSpeed || 0);

  const clickScore = clamp(clicks / 8, 0, 1);
  const spinScore = clamp(spin / 540, 0, 1);
  const speedScore = clamp(maxSpeed / 1.7, 0, 1);
  const hoverScore = durationMs >= 1200 && avgSpeed <= 0.25 ? 0.18 : 0;

  const tags = Array.isArray(semantic?.tags) ? semantic.tags : [];
  const sensitiveScore =
    (tags.includes('USER_TOUCHES_BODY') ? 0.18 : 0) +
    (tags.includes('USER_TOUCHES_MOUTH') ? 0.18 : 0) +
    (tags.includes('USER_STARING_EYES') ? 0.12 : 0) +
    (tags.includes('USER_STROKES_CHEEK') ? 0.08 : 0);

  return clamp(
    clickScore * 0.55 + spinScore * 0.45 + speedScore * 0.25 + hoverScore + sensitiveScore,
    0,
    1
  );
};

export const buildInteractionSummary = (metrics: InteractionMetrics, lang: 'zh' | 'en') => {
  const durationS = (metrics.durationMs / 1000).toFixed(2);
  const clicks = metrics.clickCount;
  const spin = Math.round(metrics.spinDegrees);
  const speed = speedBucket(metrics.maxSpeed);
  const spinKind = spinBucket(metrics.spinDegrees);
  const hits = metrics.primaryHitAreas;
  const hitText = hits.length > 0 ? hitsToText(hits) : '';
  const semantic = buildSemanticInteractionContext(metrics);
  const semanticTargetsText = semantic.primaryTargets.join(', ');
  const semanticTagsText = semantic.tags.length ? semantic.tags.slice(0, 8).join(', ') : '';

  if (lang === 'en') {
    const parts = [
      `[System Event]: Interaction session ended.`,
      `duration=${durationS}s`,
      `clicks=${clicks}`,
      `spinDeg=${spin}(${spinKind})`,
      `cursorSpeed=${speed}`
    ];
    if (hitText) parts.push(`hitAreas=${hitText}`);
    if (semanticTargetsText) parts.push(`targets=${semanticTargetsText}`);
    if (semanticTagsText) parts.push(`tags=${semanticTagsText}`);
    parts.push(`Decide avatar reaction based on persona and this interaction.`);
    return parts.join(' ');
  }

  const parts = [
    `[System Event]: 用户交互片段结束。`,
    `时长=${durationS}s`,
    `点击=${clicks}次`,
    `绕圈角度=${spin}°(${spinKind})`,
    `鼠标速度=${speed}`
  ];
  if (hitText) parts.push(`命中区域=${hitText}`);
  if (semanticTargetsText) parts.push(`语义目标=${semanticTargetsText}`);
  if (semanticTagsText) parts.push(`语义标签=${semanticTagsText}`);
  parts.push(`请结合人设决定此刻角色的反应与动作微调。`);
  return parts.join(' ');
};

export const shouldAskAiForInteraction = (metrics: InteractionMetrics) => {
  const semantic = buildSemanticInteractionContext(metrics);
  const clicks = Math.max(0, metrics?.clickCount || 0);
  const spin = Math.abs(metrics?.spinDegrees || 0);
  const durationMs = Math.max(0, metrics?.durationMs || 0);
  const maxSpeed = Math.max(0, metrics?.maxSpeed || 0);
  const tags = Array.isArray(semantic?.tags) ? semantic.tags : [];

  if (durationMs < 260 && clicks < 2 && spin < 120) return false;

  const intensity = computeInteractionIntensity(metrics, semantic);
  const primary = Array.isArray(semantic?.primaryTargets) ? semantic.primaryTargets[0] : '';
  const unknownPrimary = String(primary || '').toLowerCase() === 'unknown';

  if (tags.includes('USER_MAKING_ME_DIZZY') && durationMs >= 450) return true;
  if (clicks >= 6) return true;
  if (clicks >= 4 && spin >= 120) return true;
  if (maxSpeed >= 1.4 && durationMs >= 650 && !tags.includes('USER_SLOW_HOVER')) return true;

  if (unknownPrimary && intensity < 0.72) return false;

  if (tags.includes('USER_TOUCHES_BODY') && clicks >= 2) return true;
  if (tags.includes('USER_TOUCHES_MOUTH') && clicks >= 1) return true;
  if (tags.includes('USER_STARING_EYES') && tags.includes('USER_SLOW_HOVER') && durationMs >= 1200)
    return true;

  return intensity >= 0.62;
};

export const computeRelativePoint = (
  agentX: number,
  agentY: number,
  agentSize: number,
  clientX: number,
  clientY: number
) => {
  const cx = agentX + agentSize / 2;
  const cy = agentY + agentSize / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const sensitivity = Math.max(120, agentSize * 1.2);
  return {
    relX: clamp(dx / sensitivity, -1, 1),
    relY: clamp(dy / sensitivity, -1, 1)
  };
};

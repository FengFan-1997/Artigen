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

export const buildInteractionSummary = (metrics: InteractionMetrics, lang: 'zh' | 'en') => {
  const durationS = (metrics.durationMs / 1000).toFixed(2);
  const clicks = metrics.clickCount;
  const spin = Math.round(metrics.spinDegrees);
  const speed = speedBucket(metrics.maxSpeed);
  const spinKind = spinBucket(metrics.spinDegrees);
  const hits = metrics.primaryHitAreas;
  const hitText = hits.length > 0 ? hitsToText(hits) : '';

  if (lang === 'en') {
    const parts = [
      `[System Event]: Interaction session ended.`,
      `duration=${durationS}s`,
      `clicks=${clicks}`,
      `spinDeg=${spin}(${spinKind})`,
      `cursorSpeed=${speed}`
    ];
    if (hitText) parts.push(`hitAreas=${hitText}`);
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
  parts.push(`请结合人设决定此刻角色的反应与动作微调。`);
  return parts.join(' ');
};

export const shouldAskAiForInteraction = (metrics: InteractionMetrics) => {
  const clicks = metrics.clickCount;
  const spin = Math.abs(metrics.spinDegrees);
  const hasUnknownHit = metrics.primaryHitAreas.some(
    (h) => !/(head|face|hair|body|chest|breast|bust|torso)/i.test(h)
  );

  if (hasUnknownHit) return true;
  if (spin >= 360 && clicks >= 1) return true;
  if (clicks >= 6) return true;
  if (clicks >= 4 && spin >= 120) return true;
  if (metrics.maxSpeed >= 1.4 && metrics.durationMs >= 600) return true;
  return false;
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

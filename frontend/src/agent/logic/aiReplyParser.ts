import type { AvatarPlanStep } from '../types/avatarPlan';

export type ExtractedJsonBlock = { raw: string; jsonText: string };

export const extractJsonAfterLabel = (text: string, label: string): ExtractedJsonBlock | null => {
  const re = new RegExp(`${label}\\s*:\\s*`, 'i');
  const match = re.exec(text);
  if (!match || typeof match.index !== 'number') return null;

  let i = match.index + match[0].length;
  while (i < text.length && /\s/.test(text[i] || '')) i++;

  const first = text[i];
  if (first !== '{' && first !== '[') return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      const ok = (last === '{' && ch === '}') || (last === '[' && ch === ']');
      if (!ok) return null;
      stack.pop();
      if (stack.length === 0) {
        const jsonText = text.slice(i, j + 1);
        const raw = text.slice(match.index, j + 1);
        return { raw, jsonText };
      }
    }
  }

  return null;
};

export type ParsedAiReply = {
  cleanResponse: string;
  parsedPlan: any[] | null;
  parsedAvatarPlan: AvatarPlanStep[] | null;
  queuedAvatarSteps: AvatarPlanStep[];
  hasExplicitMotion: boolean;
  primaryEmotion: string | null;
  envelopeFallback?: string;
  lockMs?: number;
  exprOverride?: string;
  emotionTag?: { primary: string; intensity: number };
  tags: {
    angry: boolean;
    happy: boolean;
    poutingOrShy: boolean;
    dizzy: boolean;
    cry: boolean;
    confused: boolean;
    tiredOrFaint: boolean;
  };
};

export function parseAiReply(
  rawResponse: string,
  input: {
    allowPlan: boolean;
    normalizeMotionName: (raw: string | undefined) => string | null;
  }
): ParsedAiReply {
  let cleanResponse = rawResponse;
  const allowPlan = input.allowPlan;

  let parsedPlan: any[] | null = null;
  let parsedAvatarPlan: AvatarPlanStep[] | null = null;
  const queuedAvatarSteps: AvatarPlanStep[] = [];
  let hasExplicitMotion = false;
  let primaryEmotion: string | null = null;
  let envelopeFallback: string | undefined = undefined;

  const tags = {
    angry: false,
    happy: false,
    poutingOrShy: false,
    dizzy: false,
    cry: false,
    confused: false,
    tiredOrFaint: false
  };

  const trimmedEnvelope = (rawResponse || '').trim();
  if (trimmedEnvelope.startsWith('{') && trimmedEnvelope.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmedEnvelope);
      const v = typeof obj?.v === 'string' ? obj.v.trim() : '';
      if (v === '1') {
        if (allowPlan && Array.isArray(obj?.plan)) parsedPlan = obj.plan;
        if (Array.isArray(obj?.avatarPlan)) {
          parsedAvatarPlan = obj.avatarPlan as AvatarPlanStep[];
          hasExplicitMotion =
            hasExplicitMotion ||
            parsedAvatarPlan.some(
              (s) => s?.type === 'motion' || s?.type === 'pose' || !!(s as any)?.motion
            );
        }
        const decision = obj?.decision;
        const kind = typeof decision?.kind === 'string' ? decision.kind.trim() : '';
        const decisionText =
          (typeof decision?.text === 'string' && decision.text.trim() && decision.text.trim()) ||
          (typeof decision?.prompt === 'string' &&
            decision.prompt.trim() &&
            decision.prompt.trim()) ||
          (typeof decision?.reason === 'string' &&
            decision.reason.trim() &&
            decision.reason.trim()) ||
          '';
        if (kind && decisionText) envelopeFallback = decisionText;
        cleanResponse = '';
      }
    } catch {}
  }

  const lockMatch = rawResponse.match(/\[LOCK:\s*(\d+)\]/i);
  const lockMs = lockMatch ? Number.parseInt(lockMatch[1], 10) : undefined;
  if (lockMatch) cleanResponse = cleanResponse.replace(lockMatch[0], '');

  const exprInlineMatch = rawResponse.match(/\[EXPR:\s*([a-zA-Z0-9_\-]+)\]/);
  let exprOverride =
    exprInlineMatch && typeof exprInlineMatch[1] === 'string' ? exprInlineMatch[1] : undefined;
  if (exprInlineMatch) cleanResponse = cleanResponse.replace(exprInlineMatch[0], '');

  const expressionTagMatch = rawResponse.match(/expressionTag:\s*("[^"]+"|\w+)/i);
  if (expressionTagMatch) {
    const rawVal = expressionTagMatch[1];
    const value = rawVal.startsWith('"')
      ? (() => {
          try {
            return JSON.parse(rawVal);
          } catch {
            return rawVal.replace(/"/g, '');
          }
        })()
      : rawVal;
    if (typeof value === 'string' && value.trim() && !exprOverride) exprOverride = value;
    cleanResponse = cleanResponse.replace(expressionTagMatch[0], '');
  }

  const planExtract = parsedPlan ? null : extractJsonAfterLabel(cleanResponse, 'plan');
  if (allowPlan && planExtract) {
    try {
      const planJson = JSON.parse(planExtract.jsonText);
      if (Array.isArray(planJson)) parsedPlan = planJson;
    } catch {}
    cleanResponse = cleanResponse.replace(planExtract.raw, '');
  }

  const avatarPlanExtract = parsedAvatarPlan
    ? null
    : extractJsonAfterLabel(cleanResponse, 'avatarPlan');
  if (avatarPlanExtract) {
    try {
      const avatarPlanJson = JSON.parse(avatarPlanExtract.jsonText);
      if (Array.isArray(avatarPlanJson)) {
        parsedAvatarPlan = avatarPlanJson as AvatarPlanStep[];
        hasExplicitMotion =
          hasExplicitMotion ||
          parsedAvatarPlan.some(
            (s) => s?.type === 'motion' || s?.type === 'pose' || !!(s as any)?.motion
          );
      }
    } catch {}
    cleanResponse = cleanResponse.replace(avatarPlanExtract.raw, '');
  }

  const motionJsonExtract = extractJsonAfterLabel(cleanResponse, 'motionTag');
  if (motionJsonExtract) {
    try {
      const motions = JSON.parse(motionJsonExtract.jsonText);
      if (Array.isArray(motions) && motions.length > 0) {
        for (const m of motions) {
          if (!m || typeof m.name !== 'string') continue;
          const logicName = input.normalizeMotionName(m.name);
          if (!logicName) continue;
          const duration = typeof m.duration === 'number' ? m.duration : 900;
          const step: AvatarPlanStep = { type: 'motion', motion: logicName, duration };
          queuedAvatarSteps.push(step);
        }
        if (queuedAvatarSteps.length > 0) hasExplicitMotion = true;
      }
    } catch {}
    cleanResponse = cleanResponse.replace(motionJsonExtract.raw, '');
  }

  const motionCommandMatch = cleanResponse.match(/motionCommand\s*:\s*([^\n]+)/i);
  if (motionCommandMatch) {
    const motion = input.normalizeMotionName(motionCommandMatch[1]);
    if (motion) {
      const step: AvatarPlanStep = { type: 'motion', motion, duration: 1400 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
    cleanResponse = cleanResponse.replace(motionCommandMatch[0], '');
  }

  let emotionTag: { primary: string; intensity: number } | undefined = undefined;
  const emotionJsonExtract = extractJsonAfterLabel(cleanResponse, 'emotionTag');
  if (emotionJsonExtract) {
    try {
      const emotionJson = JSON.parse(emotionJsonExtract.jsonText);
      const primary = (emotionJson?.primary || '').toLowerCase().trim();
      const intensity = typeof emotionJson?.intensity === 'number' ? emotionJson.intensity : 0.6;
      if (primary) {
        emotionTag = { primary, intensity };
        primaryEmotion = primary;
      }
    } catch {}
    cleanResponse = cleanResponse.replace(emotionJsonExtract.raw, '');
  }

  if (
    rawResponse.includes('[ANGRY]') ||
    rawResponse.includes('Baka') ||
    rawResponse.includes('Hmph') ||
    rawResponse.includes('💢')
  ) {
    tags.angry = true;
    primaryEmotion = primaryEmotion || 'angry';
    cleanResponse = cleanResponse.replace('[ANGRY]', '');
  }
  if (rawResponse.includes('[POUT]') || rawResponse.includes('[SHY]')) {
    tags.poutingOrShy = true;
    primaryEmotion = primaryEmotion || 'shy';
    cleanResponse = cleanResponse.replace('[POUT]', '').replace('[SHY]', '');
  }
  if (rawResponse.includes('[HAPPY]')) {
    tags.happy = true;
    primaryEmotion = primaryEmotion || 'happy';
    cleanResponse = cleanResponse.replace('[HAPPY]', '');
  }
  if (rawResponse.includes('[DIZZY]')) {
    tags.dizzy = true;
    primaryEmotion = primaryEmotion || 'dizzy';
    cleanResponse = cleanResponse.replace('[DIZZY]', '');
  }
  if (rawResponse.includes('[CRY]')) {
    tags.cry = true;
    primaryEmotion = primaryEmotion || 'sad';
    cleanResponse = cleanResponse.replace('[CRY]', '');
  }
  if (rawResponse.includes('[CONFUSED]')) {
    tags.confused = true;
    primaryEmotion = primaryEmotion || 'confused';
    cleanResponse = cleanResponse.replace('[CONFUSED]', '');
  }
  if (
    rawResponse.includes('[FAINT]') ||
    rawResponse.includes('[TIRED]') ||
    rawResponse.includes('[SLEEPY]')
  ) {
    tags.tiredOrFaint = true;
    primaryEmotion = primaryEmotion || 'tired';
    cleanResponse = cleanResponse
      .replace('[FAINT]', '')
      .replace('[TIRED]', '')
      .replace('[SLEEPY]', '');
  }

  const legacyMotionMatch = rawResponse.match(/\[MOTION:\s*([^\]]+?)\s*\]/);
  if (legacyMotionMatch) {
    const motion = input.normalizeMotionName(legacyMotionMatch[1]);
    if (motion) {
      const step: AvatarPlanStep = { type: 'motion', motion, duration: 2000 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
  }
  cleanResponse = cleanResponse.replace(/\[MOTION:\s*[^\]]+?\]/g, '');

  return {
    cleanResponse,
    parsedPlan,
    parsedAvatarPlan,
    queuedAvatarSteps,
    hasExplicitMotion,
    primaryEmotion,
    envelopeFallback,
    lockMs: Number.isFinite(lockMs as any) && (lockMs as any) > 0 ? lockMs : undefined,
    exprOverride,
    emotionTag,
    tags
  };
}

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

const extractJsonObjectFromIndex = (
  text: string,
  startIndex: number
): { raw: string; jsonText: string; endIndex: number } | null => {
  if (text[startIndex] !== '{') return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let j = startIndex; j < text.length; j++) {
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
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      stack.push(ch);
      continue;
    }

    if (ch === '}') {
      const last = stack[stack.length - 1];
      if (last !== '{') return null;
      stack.pop();
      if (stack.length === 0) {
        const jsonText = text.slice(startIndex, j + 1);
        return { raw: jsonText, jsonText, endIndex: j + 1 };
      }
    }
  }

  return null;
};

const extractEnvelopeObject = (text: string): { raw: string; obj: any } | null => {
  const s = String(text || '');
  const maxScan = Math.min(s.length, 60000);
  for (let i = 0; i < maxScan; i++) {
    if (s[i] !== '{') continue;
    const block = extractJsonObjectFromIndex(s, i);
    if (!block) continue;
    if (block.jsonText.length > 60000) continue;
    try {
      const obj = JSON.parse(block.jsonText);
      const vRaw = obj?.v;
      const v =
        typeof vRaw === 'number' ? String(vRaw) : typeof vRaw === 'string' ? vRaw.trim() : '';
      if (v === '1') return { raw: block.raw, obj };
    } catch {}
    i = Math.max(i, block.endIndex - 1);
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
  memoryFacts?: string[];
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
  let workingRaw = String(rawResponse || '');
  let cleanResponse = workingRaw;
  const allowPlan = input.allowPlan;

  let parsedPlan: any[] | null = null;
  let parsedAvatarPlan: AvatarPlanStep[] | null = null;
  const queuedAvatarSteps: AvatarPlanStep[] = [];
  let hasExplicitMotion = false;
  let primaryEmotion: string | null = null;
  let envelopeFallback: string | undefined = undefined;
  let memoryFacts: string[] | undefined = undefined;
  let lockMs: number | undefined = undefined;
  let exprOverride: string | undefined = undefined;
  let emotionTag: { primary: string; intensity: number } | undefined = undefined;

  const tags = {
    angry: false,
    happy: false,
    poutingOrShy: false,
    dizzy: false,
    cry: false,
    confused: false,
    tiredOrFaint: false
  };

  const envelope = extractEnvelopeObject(workingRaw);
  if (envelope) {
    const obj = envelope.obj;
    if (allowPlan && Array.isArray(obj?.plan)) parsedPlan = obj.plan;
    if (Array.isArray(obj?.avatarPlan)) {
      parsedAvatarPlan = obj.avatarPlan as AvatarPlanStep[];
      hasExplicitMotion =
        hasExplicitMotion ||
        parsedAvatarPlan.some(
          (s) => s?.type === 'motion' || s?.type === 'pose' || !!(s as any)?.motion
        );
    }
    const txt =
      (typeof obj?.text === 'string' && obj.text.trim() && obj.text.trim()) ||
      (typeof obj?.message === 'string' && obj.message.trim() && obj.message.trim()) ||
      '';
    if (txt) cleanResponse = txt;

    const decision = obj?.decision;
    const kind = typeof decision?.kind === 'string' ? decision.kind.trim() : '';
    const decisionText =
      (typeof decision?.text === 'string' && decision.text.trim() && decision.text.trim()) ||
      (typeof decision?.prompt === 'string' && decision.prompt.trim() && decision.prompt.trim()) ||
      (typeof decision?.reason === 'string' && decision.reason.trim() && decision.reason.trim()) ||
      '';
    if (kind && decisionText) envelopeFallback = decisionText;

    const lockCandidate = obj?.lockMs ?? obj?.lock;
    const lockNum =
      typeof lockCandidate === 'number'
        ? lockCandidate
        : Number.parseInt(String(lockCandidate || ''), 10);
    if (Number.isFinite(lockNum) && lockNum > 0) lockMs = Math.max(0, Math.min(60000, lockNum));

    const exprCandidate = obj?.exprOverride ?? obj?.expr ?? obj?.expression;
    if (typeof exprCandidate === 'string' && exprCandidate.trim())
      exprOverride = exprCandidate.trim();

    const emotionCandidate = obj?.emotionTag;
    if (emotionCandidate && typeof emotionCandidate === 'object') {
      const primary = String((emotionCandidate as any)?.primary || '')
        .toLowerCase()
        .trim();
      const intensityRaw = (emotionCandidate as any)?.intensity;
      const intensity =
        typeof intensityRaw === 'number' ? intensityRaw : Number.parseFloat(String(intensityRaw));
      if (primary) {
        emotionTag = {
          primary,
          intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.6
        };
        primaryEmotion = primaryEmotion || primary;
      }
    }

    const factsCandidate = obj?.memoryFacts ?? obj?.facts;
    if (Array.isArray(factsCandidate)) {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const raw of factsCandidate) {
        const t = String(raw || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
        if (!t) continue;
        const k0 = t.toLowerCase();
        if (seen.has(k0)) continue;
        seen.add(k0);
        out.push(t);
        if (out.length >= 6) break;
      }
      if (out.length > 0) memoryFacts = out;
    }

    workingRaw = workingRaw.replace(envelope.raw, '').trim();
    if (!txt) cleanResponse = workingRaw;
  }

  if (lockMs === undefined) {
    const lockMatch = workingRaw.match(/\[LOCK:\s*(\d+)\]/i);
    const lockParsed = lockMatch ? Number.parseInt(lockMatch[1], 10) : undefined;
    if (Number.isFinite(lockParsed as any) && (lockParsed as any) > 0) lockMs = lockParsed;
    if (lockMatch) cleanResponse = cleanResponse.replace(lockMatch[0], '');
  }

  if (exprOverride === undefined) {
    const exprInlineMatch = workingRaw.match(/\[EXPR:\s*([a-zA-Z0-9_\-]+)\]/);
    if (exprInlineMatch && typeof exprInlineMatch[1] === 'string')
      exprOverride = exprInlineMatch[1];
    if (exprInlineMatch) cleanResponse = cleanResponse.replace(exprInlineMatch[0], '');
  }

  if (exprOverride === undefined) {
    const expressionTagMatch = workingRaw.match(/expressionTag:\s*("[^"]+"|\w+)/i);
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
      if (typeof value === 'string' && value.trim()) exprOverride = value;
      cleanResponse = cleanResponse.replace(expressionTagMatch[0], '');
    }
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
          const rawTempo = (m as any)?.tempo;
          const tempo =
            typeof rawTempo === 'number' && Number.isFinite(rawTempo)
              ? rawTempo
              : typeof rawTempo === 'string'
                ? rawTempo
                : undefined;
          const rawGap = (m as any)?.gap ?? (m as any)?.after;
          const gap =
            typeof rawGap === 'number' && Number.isFinite(rawGap) ? Math.max(0, rawGap) : undefined;
          const rawInterrupt = (m as any)?.interrupt;
          const interrupt =
            typeof rawInterrupt === 'string'
              ? rawInterrupt.trim().toLowerCase() === 'soft'
                ? 'soft'
                : rawInterrupt.trim().toLowerCase() === 'hard'
                  ? 'hard'
                  : undefined
              : undefined;

          const step: AvatarPlanStep = { type: 'motion', motion: logicName, duration };
          if (tempo !== undefined) (step as any).tempo = tempo;
          if (gap !== undefined) (step as any).gap = gap;
          if (interrupt !== undefined) (step as any).interrupt = interrupt;
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

  if (!emotionTag) {
    const emotionJsonExtract = extractJsonAfterLabel(cleanResponse, 'emotionTag');
    if (emotionJsonExtract) {
      try {
        const emotionJson = JSON.parse(emotionJsonExtract.jsonText);
        const primary = (emotionJson?.primary || '').toLowerCase().trim();
        const intensity = typeof emotionJson?.intensity === 'number' ? emotionJson.intensity : 0.6;
        if (primary) {
          emotionTag = { primary, intensity };
          primaryEmotion = primaryEmotion || primary;
        }
      } catch {}
      cleanResponse = cleanResponse.replace(emotionJsonExtract.raw, '');
    }
  }

  if (!memoryFacts) {
    const memoryFactsExtract =
      extractJsonAfterLabel(cleanResponse, 'memoryFacts') ||
      extractJsonAfterLabel(cleanResponse, 'facts');
    if (memoryFactsExtract) {
      try {
        const arr = JSON.parse(memoryFactsExtract.jsonText);
        if (Array.isArray(arr)) {
          const out: string[] = [];
          const seen = new Set<string>();
          for (const raw of arr) {
            const t = String(raw || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 240);
            if (!t) continue;
            const k = t.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(t);
            if (out.length >= 6) break;
          }
          if (out.length > 0) memoryFacts = out;
        }
      } catch {}
      cleanResponse = cleanResponse.replace(memoryFactsExtract.raw, '');
    }
  }

  const tagSource = `${workingRaw}\n${cleanResponse}`;
  if (
    tagSource.includes('[ANGRY]') ||
    tagSource.includes('Baka') ||
    tagSource.includes('Hmph') ||
    tagSource.includes('💢')
  ) {
    tags.angry = true;
    primaryEmotion = primaryEmotion || 'angry';
    cleanResponse = cleanResponse.replace('[ANGRY]', '');
  }
  if (tagSource.includes('[POUT]') || tagSource.includes('[SHY]')) {
    tags.poutingOrShy = true;
    primaryEmotion = primaryEmotion || 'shy';
    cleanResponse = cleanResponse.replace('[POUT]', '').replace('[SHY]', '');
  }
  if (tagSource.includes('[HAPPY]')) {
    tags.happy = true;
    primaryEmotion = primaryEmotion || 'happy';
    cleanResponse = cleanResponse.replace('[HAPPY]', '');
  }
  if (tagSource.includes('[DIZZY]')) {
    tags.dizzy = true;
    primaryEmotion = primaryEmotion || 'dizzy';
    cleanResponse = cleanResponse.replace('[DIZZY]', '');
  }
  if (tagSource.includes('[CRY]')) {
    tags.cry = true;
    primaryEmotion = primaryEmotion || 'sad';
    cleanResponse = cleanResponse.replace('[CRY]', '');
  }
  if (tagSource.includes('[CONFUSED]')) {
    tags.confused = true;
    primaryEmotion = primaryEmotion || 'confused';
    cleanResponse = cleanResponse.replace('[CONFUSED]', '');
  }
  if (
    tagSource.includes('[FAINT]') ||
    tagSource.includes('[TIRED]') ||
    tagSource.includes('[SLEEPY]')
  ) {
    tags.tiredOrFaint = true;
    primaryEmotion = primaryEmotion || 'tired';
    cleanResponse = cleanResponse
      .replace('[FAINT]', '')
      .replace('[TIRED]', '')
      .replace('[SLEEPY]', '');
  }

  const legacyMotionMatch = tagSource.match(/\[MOTION:\s*([^\]]+?)\s*\]/);
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
    memoryFacts,
    tags
  };
}

import { buildApiUrl } from '@/utils/api';
import { getPageContext } from '@/agent/utils/pageContext';
import {
  ensureGuestUserId,
  getAuthToken,
  getOrCreateProjectId,
  getOrCreateSessionId
} from '@/login/session';

const API_URL = buildApiUrl('/api/generate');
const FIXED_TEXT_MODEL = 'Qwen/Qwen3-8B';

type SupplementTableItem = {
  name: string;
  amount: string;
  dv: string;
};

type WarningsContent = {
  do_not_use?: string[];
  ask_doctor_before_use?: string[];
  ask_doctor_or_pharmacist?: string[];
  when_using_this_product?: string[];
  stop_use_and_ask_doctor?: string[];
  pregnancy_breastfeeding?: string[];
  keep_out_of_reach?: string[];
};

type DirectionsGroup = {
  age: string;
  dose: string;
  frequency: string;
};

type DirectionsContent = {
  groups?: DirectionsGroup[];
  general?: string[];
};

type Section = {
  title: string;
  content:
    | string
    | string[]
    | SupplementTableItem[]
    | { servingSize?: string; servingsPerContainer?: string }
    | WarningsContent
    | DirectionsContent;
  isTable?: boolean;
  isHeader?: boolean;
};

const callAI = async (input: { userText: string; productType: string }) => {
  const requestId = `ingredient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const userId = ensureGuestUserId();
  const token = getAuthToken();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      userId,
      requestId,
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'ingredient_label',
      model: FIXED_TEXT_MODEL,
      purpose: 'agentimg_ingredient_label',
      userText: String(input.userText || '').trim(),
      agentImg: {
        userText: String(input.userText || '').trim(),
        productType: String(input.productType || '').trim()
      },
      timeoutMs: 120000
    })
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const errorCode = typeof json?.error === 'string' && json.error.trim() ? json.error.trim() : '';
    throw new Error(errorCode || `API_ERROR_${response.status}`);
  }

  const data = await response.json().catch(() => null);
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = String(rawText || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid JSON format');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
    layoutType: parsed?.layoutType || 'standard'
  };
};

export const buildLabelSectionsUnified = async (
  userText: string,
  productType: string
): Promise<{
  sections: Section[];
  layoutType: 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts';
}> => {
  const { sections: parsedSections, layoutType } = await callAI({
    userText,
    productType
  });
  const sections = Array.isArray(parsedSections) ? parsedSections : [];
  return {
    sections,
    layoutType:
      (layoutType as 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts') ||
      'standard'
  };
};

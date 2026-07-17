import type { ToolTaskQuote } from '../services/toolTasks';

export const DEFAULT_GENERATION_PROFILE_ID = 'standard-v1';
export const DEFAULT_GENERATION_ASPECT_RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16'];

export type GenerationOperation = 'directions' | 'generate';

export type ProductProfileSnapshot = {
  productName: string;
  productCategory: string;
  material: string;
  sceneType: string;
  lighting: string;
  primaryColor: string;
  brandName: string;
  designElements: string[];
  styles: string[];
  colors: string[];
};

export type GenerationDirection = {
  id: string;
  title: string;
  summary: string;
  prompt?: string;
};

export type PendingGenerationSubmission = {
  version: 1;
  operation: GenerationOperation;
  idempotencyKey: string;
  quote: ToolTaskQuote;
  options: Record<string, unknown>;
  files: File[];
  historyId: string;
  userText: string;
  refThumbs: string[];
  taskId?: string;
  cancelRequested?: boolean;
  createdAt: number;
};

export type StarterTemplate = {
  id: string;
  zh: string;
  en: string;
  promptZh: string;
  promptEn: string;
};

export const GENERATION_STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'marketplace-hero',
    zh: '白底商品主图',
    en: 'White hero image',
    promptZh: '生成一张电商白底商品主图，主体居中、边缘清晰、柔和棚拍阴影，保留真实材质与比例，不添加文字或水印。',
    promptEn: 'Create an e-commerce product hero image on a clean white background, centered with crisp edges and a soft studio shadow. Preserve realistic material and proportions; add no text or watermark.'
  },
  {
    id: 'lifestyle',
    zh: '生活方式场景',
    en: 'Lifestyle scene',
    promptZh: '把商品放入自然可信的生活方式场景，主体清晰突出，光影与环境一致，画面适合商业广告。',
    promptEn: 'Place the product in a natural, believable lifestyle scene with coherent lighting, a clearly emphasized subject, and a commercial campaign finish.'
  },
  {
    id: 'detail-banner',
    zh: '详情页横幅',
    en: 'Detail-page banner',
    promptZh: '生成适合电商详情页的横幅视觉，商品位于画面一侧，另一侧保留干净的文案留白，不生成任何文字。',
    promptEn: 'Create a wide e-commerce detail-page banner with the product on one side and clean copy space on the other. Do not generate any text.'
  },
  {
    id: 'social-vertical',
    zh: '社媒竖图',
    en: 'Social vertical',
    promptZh: '生成适合社交媒体的竖版商品视觉，构图有冲击力、主体在移动端清晰可见，并预留安全边距。',
    promptEn: 'Create a vertical social-media product visual with strong composition, a clearly readable subject on mobile, and safe margins.'
  },
  {
    id: 'material-closeup',
    zh: '材质特写',
    en: 'Material close-up',
    promptZh: '生成商品材质与工艺特写，微距细节清晰、纹理真实、光线克制，保持商品结构准确。',
    promptEn: 'Create a restrained macro close-up that highlights authentic material texture and craftsmanship while keeping the product structure accurate.'
  },
  {
    id: 'handheld',
    zh: '人物手持商品',
    en: 'Product in hand',
    promptZh: '生成自然的人物手持商品场景，手部结构准确、商品外观不变形、肤色与光线真实，突出使用尺度。',
    promptEn: 'Create a natural product-in-hand scene with anatomically accurate hands, an undistorted product, realistic skin and lighting, and clear scale.'
  }
];

export const generationReferenceSlotLabels = (lang: string) =>
  lang === 'zh'
    ? ['商品参考', '风格参考', '场景参考']
    : ['Product reference', 'Style reference', 'Scene reference'];

export const normalizeGenerationDirections = (value: unknown): GenerationDirection[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw: any, index): GenerationDirection | null => {
      const id = String(raw?.id || `direction-${index + 1}`).trim();
      const title = String(raw?.title || '').trim();
      const summary = String(raw?.summary || '').trim();
      const prompt = String(raw?.prompt || '').trim();
      if (!id || !title || !summary) return null;
      return { id, title, summary, ...(prompt ? { prompt } : {}) };
    })
    .filter((entry: GenerationDirection | null): entry is GenerationDirection => entry !== null)
    .slice(0, 4);
};

export const agentImgPromptLibrary = {
  baseStyle: [
    'high quality',
    'high detail',
    'sharp focus',
    'cinematic lighting',
    'volumetric light',
    'clean composition'
  ],
  safeNegative: [
    'nsfw',
    'nudity',
    'gore',
    'violence',
    'lowres',
    'bad anatomy',
    'blurry',
    'watermark',
    'signature',
    'text'
  ],
  mustReadPromptRules: `# 🎨 AI绘画提示词通用公式 & 模块详解
我把图里的核心信息整理成了一个清晰的模块拆解表，你可以直接套用这个公式来写提示词。

## 🔢 通用公式
\`风格限定 + 视角构图 + 主体描述 + 背景设定 + 细节修饰 + 光影色调 + 质量词\`

## 🧩 模块拆解
| 模块 | 作用 | 示例关键词 |
|------|------|------------|
| **风格限定** | 决定画面整体画风 | 奇幻风、手绘风格、水彩风格、写实风、赛博朋克、宫崎骏风格 |
| **视角构图** | 确定观察角度与画面布局 | 低角度摄影、中心构图、仰拍、俯视、三分构图、对称构图 |
| **主体描述** | 明确画面核心对象的特征 | 一只优雅的独角兽（白色皮毛、银色角）、穿汉服的少女（微笑、手持团扇） |
| **背景设定** | 交代主体所处的环境 | 密林中、阳光透过树叶洒下斑驳光影、星空下的麦田、未来都市街道 |
| **细节修饰** | 丰富画面的具体元素 | 独角兽脚下长着各色鲜花、小动物们好奇地围观、复古留声机、飘落的樱花 |
| **光影色调** | 描述画面的光线与色彩氛围 | 温暖的阳光、柔和的阴影、冷色调、逆光、丁达尔效应、静谧祥和的氛围 |
| **质量词** | 对图像质量提出要求 | 高清、细腻、唯美、逼真、8K分辨率、有质感 |

## ✨ 完整示例
**提示词**：
\`奇幻风，手绘风格，水彩风格，低角度摄影，中心构图，一只优雅的独角兽，白色的皮毛，银色角，密林中，阳光透过树叶洒下斑驳的光影，独角兽脚下长着各色鲜花，小动物们好奇地围观，温暖的阳光和柔和的阴影，营造出宁静祥和的氛围，高清、细腻、唯美。\``,
  directionSystem: [
    `You are an expert creative director and prompt engineer for text-to-image models. Master the universal formula for crafting high-quality text-to-image prompts: Style Definition + Perspective & Composition + Subject Description + Background Setting + Detail Enhancement + Light, Shadow & Tone + Quality Keywords. Here is the detailed breakdown of each module: Style Definition determines the overall artistic style of the image, examples: fantasy style, hand-drawn, watercolor, photorealistic, cyberpunk, Hayao Miyazaki style. Perspective & Composition defines the viewing angle and layout, examples: low-angle shot, centered composition, upward view, bird's-eye view, rule of thirds, symmetrical composition. Subject Description clarifies the core object's characteristics with detailed traits. Background Setting describes the environment where the subject is located with scene details. Detail Enhancement enriches the image with specific delicate elements. Light, Shadow & Tone shapes the lighting effect, color palette and emotional atmosphere of the image. Quality Keywords specifies the image quality requirements, examples: high definition, exquisite details, aesthetic, realistic, 8K resolution, textured. Given a short, vague user request, propose 4 distinct visual directions. Each direction must be meaningfully different in style, composition, and mood, and each direction must strictly follow the above prompt formula and module rules for creation. Output must be compact but richer than a short blurb: summary must be a single string containing exactly 7 labeled lines (one per module) and no extra paragraphs; keep the total summary length roughly 200–360 Chinese characters (or 120–220 English words). Each styleTags array must contain 12–16 concise tags covering style/medium, composition/camera, subject traits, background, details, lighting/tone, and quality. Each negativeTags array must contain 12–20 concise tags relevant to the direction. Output 4 options exactly with ids opt_1..opt_4 in order. Do not include any unescaped double quotes inside string values. Return ONLY valid JSON. No markdown, no explanations.`
  ].join('\n'),
  directionSchema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            styleTags: { type: 'array', items: { type: 'string' } },
            negativeTags: { type: 'array', items: { type: 'string' } },
            suggested: {
              type: 'object',
              properties: {
                imageSize: { type: 'string' },
                steps: { type: 'number' },
                guidanceScale: { type: 'number' },
                seed: { type: 'number' }
              }
            }
          },
          required: ['id', 'title', 'summary', 'styleTags']
        }
      }
    },
    required: ['options']
  },
  finalPromptSystem: [
    'You are an expert prompt engineer for text-to-image models.',
    'You must produce a final, model-ready prompt with a safe negative prompt.',
    'Return ONLY valid JSON. No markdown, no explanations.'
  ].join('\n'),
  finalPromptSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      negativePrompt: { type: 'string' },
      params: {
        type: 'object',
        properties: {
          imageSize: { type: 'string' },
          steps: { type: 'number' },
          guidanceScale: { type: 'number' },
          seed: { type: 'number' }
        }
      }
    },
    required: ['prompt', 'negativePrompt']
  }
} as const;

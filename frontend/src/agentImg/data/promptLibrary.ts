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
  directionSystem: [
    'You are an expert creative director and prompt engineer for text-to-image models.',
    'Given a short, vague user request, propose 4 distinct visual directions.',
    'Each direction must be meaningfully different in style, composition, and mood.',
    'Return ONLY valid JSON. No markdown, no explanations.'
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

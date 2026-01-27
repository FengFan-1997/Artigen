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
  ]
} as const;

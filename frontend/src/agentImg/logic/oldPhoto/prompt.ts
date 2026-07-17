export type OldPhotoEnhancementOptions = {
  colorize: boolean;
  denoise: boolean;
};

/**
 * Contract prompt for the compatibility img2img route. It intentionally
 * prioritizes source preservation over generative beautification.
 */
export const buildOldPhotoPrompt = (options: OldPhotoEnhancementOptions) => {
  const base = [
    'Restore and enhance the old photo from the reference image.',
    'Keep every person identity, face, pose, expression, object, and the original composition unchanged.',
    'Do not add, remove, replace, or invent any person, facial feature, object, clothing detail, symbol, or background element.',
    'Preserve all existing writing exactly; never add new text and never guess unreadable characters.',
    'Remove scratches, stains, dust, and crease marks.',
    'Increase clarity naturally; do not synthesize detail that is absent from the source.',
    'Reduce noise and blur; preserve realistic textures.'
  ].join(' ');
  const color = options.colorize
    ? 'If the photo is black-and-white, apply restrained inferred colors. Treat every color as an artistic estimate, not historical fact, and do not use colorization to invent details.'
    : 'Keep original colors; do not colorize.';
  const denoise = options.denoise ? 'Apply denoise and deblur conservatively.' : 'Apply only light denoise.';
  return `${base} ${denoise} ${color}`;
};

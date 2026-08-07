import { describe, expect, it } from 'vitest';
import { buildOldPhotoPrompt } from './prompt';

describe('old-photo enhancement provider contract', () => {
  it.each([
    { colorize: false, denoise: false },
    { colorize: false, denoise: true },
    { colorize: true, denoise: false },
    { colorize: true, denoise: true }
  ])('always prohibits invented people, text, objects and composition changes: %j', (options) => {
    const prompt = buildOldPhotoPrompt(options);
    expect(prompt).toContain('original composition unchanged');
    expect(prompt).toContain('Do not add, remove, replace, or invent any person');
    expect(prompt).toContain('Preserve all existing writing exactly');
    expect(prompt).toContain('do not synthesize detail that is absent from the source');
  });

  it('labels colorization as an artistic estimate rather than factual reconstruction', () => {
    const prompt = buildOldPhotoPrompt({ colorize: true, denoise: true });
    expect(prompt).toContain('artistic estimate, not historical fact');
  });
});

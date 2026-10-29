import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Capture = {
  viewport: { width: number; height: number };
  borderStyle: string;
  borderColor: string;
  backgroundColor: string;
  stage: { x: number; y: number; width: number; height: number } | null;
  uploadButton: { x: number; y: number; width: number; height: number } | null;
  hover?: { active: boolean; borderStyle: string; backgroundColor: string };
  focus?: { visible: boolean; outlineStyle: string; outlineWidth: string };
};

test('image editor empty stage keeps upload affordance without a decorative lime frame', async ({ page }) => {
  await page.goto('/artigen/image-workshop/image-editor?editor=v2');
  const stage = page.locator('.empty-stage');
  const uploadButton = page.getByRole('button', { name: '选择图片' });
  await expect(stage).toBeVisible();
  await expect(uploadButton).toBeVisible();
  await expect(page.getByText('也可以把图片拖到这里')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const captures: Record<string, Capture> = {};
  const artifactRoot = join(process.cwd(), '..', 'ui-review', 'image-editor-empty-stage-20261028', 'after');

  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(stage).toBeVisible();

    const device = viewport.width === 390 ? 'mobile-390' : 'desktop-1440';
    const artifactDir = join(artifactRoot, device);
    await mkdir(artifactDir, { recursive: true });

    const measure = async (): Promise<Capture> => stage.evaluate((element) => {
      const box = (target: Element | null) => {
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const style = getComputedStyle(element);
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        borderStyle: style.borderTopStyle,
        borderColor: style.borderTopColor,
        backgroundColor: style.backgroundColor,
        stage: box(element),
        uploadButton: box(element.querySelector('button'))
      };
    });

    captures[device] = await measure();
    expect(captures[device].borderStyle).toBe('none');

    await page.screenshot({ path: join(artifactDir, 'default.png'), animations: 'disabled' });

    if (viewport.width > 640) {
      await stage.hover();
      captures[device].hover = await stage.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: element.matches(':hover'),
          borderStyle: style.borderTopStyle,
          backgroundColor: style.backgroundColor
        };
      });
      expect(captures[device].hover.active).toBe(true);
      expect(captures[device].hover.borderStyle).toBe('none');
      await page.screenshot({ path: join(artifactDir, 'hover.png'), animations: 'disabled' });
    }

    await page.mouse.move(0, 0);
    await page.locator('body').click({ position: { x: 4, y: 4 } });
    let focused = false;
    for (let index = 0; index < 40; index += 1) {
      if (await uploadButton.evaluate((element) => element === document.activeElement)) {
        focused = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(focused, `keyboard navigation reaches upload button at ${viewport.width}px`).toBe(true);
    await expect(uploadButton).toBeFocused();
    captures[device].focus = await uploadButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        visible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth
      };
    });
    expect(captures[device].focus).toEqual({ visible: true, outlineStyle: 'solid', outlineWidth: '2px' });
    await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });

    if (viewport.width === 390) {
      const documentWidth = await page.evaluate(() => Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ));
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(captures[device].stage?.x).toBeGreaterThanOrEqual(0);
      expect((captures[device].stage?.x ?? 0) + (captures[device].stage?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    }
  }

  await writeFile(join(artifactRoot, 'geometry.json'), JSON.stringify(captures, null, 2));
});

import { expect, test } from '@playwright/test';
import { installAgentInputFixture } from './helpers/agentInputFixtures';

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1440]) {
    test(`composer attachments sit above and align with the draft (${theme}, ${width}px)`, async ({ page }) => {
      await installAgentInputFixture(page, { theme });
      await page.setViewportSize({ width, height: width < 500 ? 844 : 960 });
      await page.goto('/artigen/agent');
      const textarea = page.getByRole('textbox', { name: '任务目标' });
      await textarea.fill('请参考附件完成本轮工作');
      const input = page.locator('input[type=file]').first();
      await input.setInputFiles(Array.from({ length: 9 }, (_, index) => ({
        name: `reference-${index}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`reference ${index}`)
      })));

      const cards = page.locator('.attachment-card');
      await expect(cards).toHaveCount(9);
      const geometry = await cards.first().evaluate(element => {
        const form = element.closest('form')!;
        const input = form.querySelector('textarea')!;
        const cardRect = element.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        return {
          cardBottom: cardRect.bottom,
          inputTop: inputRect.top,
          cardLeft: cardRect.left,
          textLeft: inputRect.left + Number.parseFloat(getComputedStyle(input).paddingLeft)
        };
      });
      expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.inputTop);
      expect(Math.abs(geometry.cardLeft - geometry.textLeft)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('button', { name: '查看后面的附件' })).toBeVisible();
      await expect(textarea).toHaveValue('请参考附件完成本轮工作');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

for (const width of [390, 1440]) {
  test(`attachment strip scrolls by keyboard and restores focus after removal (${width}px)`, async ({ page }) => {
    const fixture = await installAgentInputFixture(page);
    await page.setViewportSize({ width, height: width < 500 ? 844 : 960 });
    await page.goto('/artigen/agent');
    await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: 8 }, (_, index) => ({
      name: `reference-${index}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`reference ${index}`)
    })));

    const list = page.locator('.attachment-list');
    const next = page.getByRole('button', { name: '查看后面的附件' });
    await next.focus();
    await next.press('Enter');
    await expect.poll(() => list.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: '查看前面的附件' })).toBeVisible();
    await expect(list).toHaveClass(/fade-left/);

    const firstRemove = page.getByRole('button', { name: '移除 reference-0.txt' });
    await firstRemove.focus();
    await firstRemove.press('Enter');
    await expect(page.locator('.attachment-card')).toHaveCount(7);
    await expect(page.getByRole('button', { name: '移除 reference-1.txt' })).toBeFocused();
    expect(fixture.state.uploads).toBe(0);
    expect(fixture.state.creates).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('image previews stay local and release their object URL when removed', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { createdUrls: string[]; revokedUrls: string[] }).createdUrls = [];
    (window as unknown as { createdUrls: string[]; revokedUrls: string[] }).revokedUrls = [];
    URL.createObjectURL = blob => {
      const url = create(blob);
      (window as unknown as { createdUrls: string[] }).createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      (window as unknown as { revokedUrls: string[] }).revokedUrls.push(url);
      revoke(url);
    };
  });
  await page.goto('/artigen/agent');
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    // A complete RGBA PNG with valid chunk checksums; verify decoding below.
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
  });

  const thumbnail = page.locator('.attachment-card.image img');
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveJSProperty('naturalWidth', 1);
  const url = await thumbnail.getAttribute('src');
  expect(url).toMatch(/^blob:/);
  const remove = page.getByRole('button', { name: '移除 preview.png' });
  await remove.focus();
  await remove.press('Enter');
  await expect(page.locator('.attachment-card')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '任务目标' })).toBeFocused();
  await expect.poll(() => page.evaluate(value => (window as unknown as { revokedUrls: string[] }).revokedUrls.includes(value!), url)).toBe(true);
  expect(fixture.state.uploads).toBe(0);
});

test('file type cards remain distinct and a failed image preview has a labelled fallback', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  await page.goto('/artigen/agent');
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }
  ]);
  const cards = page.locator('.attachment-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('small')).toContainText('PDF');
  await expect(cards.nth(1).locator('small')).toContainText('CSV');
  expect(await cards.nth(0).locator('.file-icon').getAttribute('src')).not.toBe(await cards.nth(1).locator('.file-icon').getAttribute('src'));
  await expect(page.getByRole('status', { name: '无法预览 broken.png' })).toBeVisible();
  await page.getByRole('button', { name: '移除 broken.png' }).click();
  await expect(cards).toHaveCount(2);
  expect(fixture.state.uploads).toBe(0);
});

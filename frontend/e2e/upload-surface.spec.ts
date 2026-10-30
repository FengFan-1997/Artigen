import { expect, test } from '@playwright/test';
import { installAgentInputFixture } from './helpers/agentInputFixtures';
const projectId = '99999999-9999-4999-8999-999999999999';
const project = { projectId, title: '测试项目', status: 'active', productName: '咖啡礼盒', brief: '原始需求', brandProfile: { brandName: '', colors: [], styleKeywords: [], prohibitedElements: [], logoAssetId: null }, designMemory: { audience: '', goals: [], tone: [], visualKeywords: [], mustInclude: [], avoid: [], outputPreferences: { deliverables: [], aspectRatio: '', language: '' }, factualConstraints: [] }, coverAssetId: null, coverUrl: null, revision: 1, assets: [], versions: [] };
for (const width of [390, 1440]) test(`project upload status stays in the relevant card and preserves draft ${width}`, async ({ page }) => {
  await installAgentInputFixture(page); let fail = false;
  await page.route(`**/api/projects/${projectId}`, route => route.fulfill({ json: { project } }));
  await page.route(`**/api/projects/${projectId}/assets`, async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.fulfill(fail ? { status: 400, json: { error: { code: 'BAD_IMAGE' } } } : { json: { asset: {} } }); });
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/artigen/projects/${projectId}`);
  const first = page.locator('.asset-slot').first(); await expect(first).toBeVisible();
  const brief = page.locator('.project-sidebar textarea').first(); await brief.fill('尚未保存的新需求');
  const file = { name: 'product.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') };
  await first.locator('input[type=file]').setInputFiles(file);
  await expect(first).toHaveAttribute('aria-busy', 'true'); await expect(first.getByRole('status')).toContainText('正在上传素材');
  await expect(page.locator('.project-shell > .notice')).toHaveCount(0);
  await expect(page.locator('.asset-slot input[type=file]').nth(1)).toBeDisabled();
  await expect(first.getByRole('status')).toContainText('素材已加入项目'); await expect(brief).toHaveValue('尚未保存的新需求');
  fail = true; await first.locator('input[type=file]').setInputFiles(file);
  await expect(first.getByRole('status')).toContainText('上传失败'); await expect(first.locator('input[type=file]')).toBeEnabled();
  await expect(brief).toHaveValue('尚未保存的新需求');
});

for (const width of [390, 1440]) test(`composer attachments scroll with keyboard and restore focus ${width}`, async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  await page.setViewportSize({ width, height: 900 }); await page.goto('/artigen/agent');
  const items = Array.from({ length: 8 }, (_, i) => ({ name: `reference-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('test') }));
  await page.locator('input[type=file]').first().setInputFiles(items);
  const cards = page.locator('.attachment-list > span'); await expect(cards).toHaveCount(8);
  expect(await cards.first().evaluate(el => el.getBoundingClientRect().height)).toBe(60);
  const next = page.getByRole('button', { name: '查看后面的附件' }); await expect(next).toBeVisible(); await next.focus(); await next.press('Enter');
  await expect.poll(() => page.locator('.attachment-list').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  const previous = page.getByRole('button', { name: '查看前面的附件' }); await expect(previous).toBeVisible();
  await page.getByRole('button', { name: '移除 reference-0.txt' }).click(); await expect(cards).toHaveCount(7);
  expect(fixture.state.uploads).toBe(0); expect(fixture.state.creates).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('image thumbnail stays local and revokes its object URL on removal', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { createdUrls: string[]; revokedUrls: string[] }).createdUrls = [];
    (window as unknown as { createdUrls: string[]; revokedUrls: string[] }).revokedUrls = [];
    URL.createObjectURL = blob => { const url = create(blob); (window as unknown as { createdUrls: string[] }).createdUrls.push(url); return url; };
    URL.revokeObjectURL = url => { (window as unknown as { revokedUrls: string[] }).revokedUrls.push(url); revoke(url); };
  });
  await page.goto('/artigen/agent');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8WEAAAAASUVORK5CYII=', 'base64') });
  const thumbnail = page.locator('.attachment-card.image img'); await expect(thumbnail).toBeVisible();
  const url = await thumbnail.getAttribute('src'); expect(url).toMatch(/^blob:/);
  const remove = page.getByRole('button', { name: '移除 preview.png' }); await remove.focus(); await remove.press('Enter');
  await expect(page.locator('.attachment-card')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '任务目标' })).toBeFocused();
  await expect.poll(() => page.evaluate(value => (window as unknown as { revokedUrls: string[] }).revokedUrls.includes(value!), url)).toBe(true);
  expect(fixture.state.uploads).toBe(0);
});

test('a successful upload followed by a failed refresh is not reported as an upload failure', async ({ page }) => {
  await installAgentInputFixture(page);
  let uploaded = false;
  await page.route(`**/api/projects/${projectId}`, route => route.fulfill(uploaded ? { status: 503, json: { error: { code: 'UNAVAILABLE' } } } : { json: { project } }));
  await page.route(`**/api/projects/${projectId}/assets`, route => { uploaded = true; return route.fulfill({ json: { asset: {} } }); });
  await page.goto(`/artigen/projects/${projectId}`);
  const brief = page.locator('.project-sidebar textarea').first(); await brief.fill('保留未保存草稿');
  const slot = page.locator('.asset-slot').first();
  await slot.locator('input[type=file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await expect(slot.getByRole('status')).toContainText('素材已上传，刷新失败');
  await expect(brief).toHaveValue('保留未保存草稿');
});

test('attachment cards identify file types and handle broken previews without uploading', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  await page.goto('/artigen/agent');
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
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

for (const theme of ['light', 'dark']) for (const width of [390, 1440]) test(`attachments precede and align with the input ${theme} ${width}`, async ({ page }) => {
  await installAgentInputFixture(page, { theme });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/artigen/agent');
  const textarea = page.getByRole('textbox', { name: '任务目标' });
  await textarea.fill('请参考附件');
  const input = page.locator('input[type=file]').first();
  const file = (i: number) => ({ name: `reference-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('test') });
  await input.setInputFiles([file(0)]);
  const card = page.locator('.attachment-card').first();
  const checkPosition = async () => {
    const geometry = await card.evaluate(el => {
      const input = el.closest('form')!.querySelector('textarea')!;
      const a = el.getBoundingClientRect(), b = input.getBoundingClientRect();
      return { bottom: a.bottom, inputTop: b.top, left: a.left, textLeft: b.left + parseFloat(getComputedStyle(input).paddingLeft) };
    });
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.inputTop);
    expect(Math.abs(geometry.left - geometry.textLeft)).toBeLessThanOrEqual(1);
  };
  await checkPosition();
  await input.setInputFiles(Array.from({length: 8}, (_, i) => file(i + 1)));
  await expect(page.locator('.attachment-card')).toHaveCount(9);
  await expect(page.getByRole('button', { name: '查看后面的附件' })).toBeVisible();
  await checkPosition();
  await page.getByRole('button', { name: '查看后面的附件' }).click();
  const previous = page.getByRole('button', { name: '查看前面的附件' });
  await expect(previous).toBeVisible();
  const bounds = await previous.evaluate(el => { const arrow = el.getBoundingClientRect(); const list = el.parentElement!.querySelector('.attachment-list')!.getBoundingClientRect(); return { arrowRight: arrow.right, listLeft: list.left }; });
  expect(bounds.arrowRight).toBeLessThanOrEqual(bounds.listLeft);
  await expect(textarea).toHaveValue('请参考附件');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const theme of ['light', 'dark']) for (const width of [390, 1440]) test(`attachment fades follow scroll and preserve focus ${theme} ${width}`, async ({ page }) => {
  await installAgentInputFixture(page, { theme });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/artigen/agent');
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles({ name: 'single.txt', mimeType: 'text/plain', buffer: Buffer.from('a') });
  const list = page.locator('.attachment-list');
  await expect(list).not.toHaveClass(/fade-(left|right)/);
  await input.setInputFiles(Array.from({length: 8}, (_, i) => ({ name: `long-reference-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('b') })));
  await expect(list).toHaveClass(/fade-right/);
  await expect(list).not.toHaveClass(/fade-left/);
  expect(await list.evaluate(el => getComputedStyle(el).maskImage)).toContain('linear-gradient');
  await page.getByRole('button', { name: '查看后面的附件' }).click();
  await expect(list).toHaveClass(/fade-left/);
  await expect(list).toHaveClass(/fade-right/);
  await list.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(list).not.toHaveClass(/fade-right/);
  await expect(list).toHaveClass(/fade-left/);
  const lastRemove = page.getByRole('button', { name: '移除 long-reference-7.txt' });
  await lastRemove.focus();
  await expect(lastRemove).toBeFocused();
  expect(await list.evaluate(el => getComputedStyle(el).maskImage)).toBe('none');
  await page.emulateMedia({ forcedColors: 'active' });
  expect(await list.evaluate(el => getComputedStyle(el).maskImage)).toBe('none');
  await lastRemove.press('Enter');
  await expect(page.locator('.attachment-card')).toHaveCount(8);
});

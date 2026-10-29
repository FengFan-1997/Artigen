import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

function twoPagePdf(): Buffer {
  const streams = ['BT /F1 24 Tf 40 90 Td (First page) Tj ET', 'BT /F1 24 Tf 40 90 Td (Second page) Tj ET'];
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${streams[0]!.length} >>\nstream\n${streams[0]}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${streams[1]!.length} >>\nstream\n${streams[1]}\nendstream`
  ];
  let text = '%PDF-1.4\n'; const offsets = [0];
  bodies.forEach((body, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 8\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`PDF navigation handles both pages ${theme} ${width}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
    try {
      const page = await context.newPage(); await installWorkspaceFixture(page, theme);
      await page.route('**/api/assets/80000000-0000-4000-8000-000000000005', route => route.fulfill({ contentType: 'application/pdf', body: twoPagePdf() }));
      await page.goto(`/artigen/agent/runs/${inputRunId}`); await expect(page.locator('.workspace-topbar')).toBeVisible();
      const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
      if (width === 390) await page.getByRole('button', { name: '打开检查器', exact: true }).click();
      await nav.getByRole('button', { name: '文件', exact: true }).click();
      const tree = page.getByRole('complementary', { name: '文件目录' });
      await tree.getByRole('button', { name: 'docs', exact: true }).click();
      await tree.getByRole('button', { name: 'report.pdf', exact: true }).click();
      const pdf = page.locator('.pdf-document'); const controls = pdf.getByRole('group', { name: 'PDF 页面导航' });
      const previous = controls.getByRole('button', { name: '上一页' }); const next = controls.getByRole('button', { name: '下一页' });
      await expect(controls.locator('output')).toHaveText('1 / 2'); await expect(previous).toBeDisabled(); await expect(next).toBeEnabled();
      const canvas = pdf.locator('canvas');
      await expect.poll(() => canvas.evaluate(el => { const c = el as HTMLCanvasElement; const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; return pixels.some((n, i) => i % 4 === 0 && n < 80 && pixels[i + 1]! < 80 && pixels[i + 2]! < 80 && pixels[i + 3]! > 0); })).toBe(true);
      const firstPage = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
      await next.focus(); await expect(next).toBeFocused(); await next.press('Enter');
      await expect(controls.locator('output')).toHaveText('2 / 2'); await expect(previous).toBeEnabled(); await expect(next).toBeDisabled();
      await expect.poll(() => canvas.evaluate((el, first) => { const c = el as HTMLCanvasElement; const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; return pixels.some((n, i) => i % 4 === 0 && n < 80 && pixels[i + 1]! < 80 && pixels[i + 2]! < 80 && pixels[i + 3]! > 0) && c.toDataURL() !== first; }, firstPage)).toBe(true);
      await previous.focus(); await previous.press('Enter');
      await expect(controls.locator('output')).toHaveText('1 / 2'); await expect(previous).toBeDisabled(); await expect(next).toBeEnabled();
      await expect(pdf.locator('canvas')).toBeVisible(); await expect(pdf.locator('.pdf-error')).toHaveCount(0);
    } finally { await context.close(); }
  });
}

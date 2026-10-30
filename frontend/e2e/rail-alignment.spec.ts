import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

for (const theme of ['dark', 'light']) for (const width of [1024, 1440]) test(`rail graphics align and retain edge spacing ${theme} ${width}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await installWorkspaceFixture(page, theme);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const rail = page.getByRole('navigation', { name: '功能切换', exact: true });
  await expect(rail).toBeVisible();
  const measurements = await rail.evaluate(el => [...el.querySelectorAll(':scope > a svg,:scope > button svg')].map(svg => {
    const graphic = svg as SVGGraphicsElement;
    const box = svg.parentElement!.getBoundingClientRect();
    const rect = svg.getBoundingClientRect();
    const bounds = graphic.getBBox();
    const scale = rect.width / 24;
    const stroke = 1.75 * scale / 2;
    const left = rect.left + bounds.x * scale - stroke;
    const right = rect.left + (bounds.x + bounds.width) * scale + stroke;
    return { offset: (left + right) / 2 - (box.left + box.right) / 2, left: left - box.left, right: box.right - right, width: box.width, height: box.height };
  }));
  expect(measurements).toHaveLength(8);
  for (const graphic of measurements) {
    expect(Math.abs(graphic.offset)).toBeLessThan(1);
    expect(graphic.left).toBeGreaterThanOrEqual(8);
    expect(graphic.right).toBeGreaterThanOrEqual(8);
    expect(graphic.width).toBeGreaterThanOrEqual(44);
    expect(graphic.height).toBeGreaterThanOrEqual(44);
  }
  const appearance = rail.getByRole('button', { name: /^外观：/ });
  await appearance.focus(); await expect(appearance).toBeFocused(); await appearance.press('Enter');
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
});

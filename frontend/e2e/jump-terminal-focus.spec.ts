import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
  test(`terminal jump restores keyboard focus ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installWorkspaceFixture(page, theme);
    fixture.state.run.status = 'succeeded';
    await page.route(`**/api/agent-runs/${inputRunId}/messages*`, route => route.fulfill({ json: {
      ok: true, nextCursor: null, messages: Array.from({ length: 12 }, (_, index) => ({
        id: `terminal-${index}`, role: 'assistant', kind: 'commentary',
        text: `第 ${index + 1} 条记录。核验页面、文件内容和完整交付结果。\n\n保留每一项执行记录，方便稍后查看。`, createdAt: '2026-10-15T03:00:00.000Z'
      }))
    } }));
    await page.goto(`/artigen/agent/runs/${inputRunId}`);
    const action = page.locator('.run-ended-action');
    await expect(action).toBeVisible();
    const area = page.locator('.conversation-scroll');
    await area.evaluate(el => { el.scrollTop = 0; });
    const jump = page.getByRole('button', { name: '回到底部', exact: true });
    await expect(jump).toBeVisible();
    await jump.focus();
    await jump.press('Enter');
    await expect(jump).toHaveCount(0);
    await expect(action).toBeFocused();
    await expect.poll(() => area.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(10);
  });
}

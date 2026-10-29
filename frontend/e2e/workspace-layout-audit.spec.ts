import { expect, test } from '@playwright/test';
import { expectWorkspaceGeometry } from './helpers/workspaceLayoutAudit';

test('layout audit distinguishes a scrollable subpixel edge from clipping and obstruction', async ({ page }) => {
  await page.setContent(`
    <main class="agent-workspace-shell">
      <div id="scroll" style="height:100px;width:240px;overflow:auto">
        <button style="display:block;margin-top:99.6px;width:200px;height:44px">Reachable after scrolling</button>
      </div>
    </main>
  `);
  await expectWorkspaceGeometry(page);
  await page.locator('#scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expectWorkspaceGeometry(page);
  await page.getByRole('button').click({ trial: true });

  await page.locator('#scroll').evaluate((element) => {
    element.scrollTop = 0;
    element.style.overflow = 'hidden';
  });
  await expect(expectWorkspaceGeometry(page)).rejects.toThrow();

  await page.locator('#scroll').evaluate((element) => {
    element.style.overflow = 'auto';
    element.scrollTop = element.scrollHeight;
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:999;background:white';
    document.body.append(cover);
  });
  await expect(expectWorkspaceGeometry(page)).rejects.toThrow();
});

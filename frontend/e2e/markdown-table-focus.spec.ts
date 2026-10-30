import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';
for (const theme of ['light','dark']) for (const width of [390,1440]) test(`${theme} ${width}`,async({page})=>{
 await installWorkspaceFixture(page,theme);
 await page.route(`**/api/agent-runs/${inputRunId}/messages*`,route=>route.fulfill({json:{ok:true,nextCursor:null,messages:[{id:'table-fixture',role:'assistant',kind:'commentary',text:'核验结果：\n\n| 项目 | 一月 | 二月 | 三月 | 四月 | 五月 | 六月 | 七月 | 八月 | 九月 | 十月 |\n|---|---|---|---|---|---|---|---|---|---|---|\n| 访问量 | 120 | 130 | 140 | 150 | 160 | 170 | 180 | 190 | 200 | 210 |',createdAt:'2026-10-15T03:00:00Z'}]}}));
 await page.setViewportSize({width,height:900});await page.goto(`/artigen/agent/runs/${inputRunId}`);
 const table=page.locator('.timeline-message table');await expect(table).toBeVisible();
 await expect(table).toHaveAttribute('tabindex','0');await table.focus();await expect(table).toBeFocused();
 await table.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

import { test, expect } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';
for(const theme of ['light','dark']) for(const width of [390,1440]) test(`${theme} ${width}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
 try {const page=await context.newPage();await installWorkspaceFixture(page,theme);await page.goto(`/artigen/agent/runs/${inputRunId}`);await expect(page.locator('.workspace-topbar')).toBeVisible();
 const nav=page.getByRole('navigation',{name:'资源面板',exact:true});if(width===390)await page.getByRole('button',{name:'打开检查器',exact:true}).click();await nav.getByRole('button',{name:'文件',exact:true}).click();
 const tree=page.getByRole('complementary',{name:'文件目录'});await tree.getByRole('button',{name:'docs',exact:true}).click();await tree.getByRole('button',{name:'report.pdf',exact:true}).click();const pdf=page.locator('.pdf-document');await expect(pdf.locator('canvas')).toBeVisible();await expect(pdf.locator('output')).toHaveText('1 / 1');
 const b=pdf.locator('.pdf-page-step').first();const metrics=await b.evaluate(el=>{const a=el.getBoundingClientRect(),i=el.querySelector('svg')!.getBoundingClientRect();return {w:a.width,h:a.height,dx:(i.left+i.right-a.left-a.right)/2,dy:(i.top+i.bottom-a.top-a.bottom)/2};});
 {expect(Math.abs(metrics.dx)).toBeLessThanOrEqual(1);expect(Math.abs(metrics.dy)).toBeLessThanOrEqual(1);expect(metrics.w).toBeGreaterThanOrEqual(width===390?43.9:32);}
 } finally {await context.close();}
});

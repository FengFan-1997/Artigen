import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';
for(const theme of ['light','dark']) for(const width of [390,1440]) test(`${theme} ${width}`,async({page})=>{
 await installWorkspaceFixture(page,theme);await page.setViewportSize({width,height:900});await page.goto(`/artigen/agent/runs/${inputRunId}`);
 await expect(page.locator('.workspace-topbar')).toBeVisible();
 if(width===390) await page.getByRole('button',{name:'打开历史'}).click();
 const button=page.getByRole('button',{name:'编辑会话 首页体验研究'});await expect(button).toBeAttached();await button.focus();await expect(button).toBeVisible();
 const dims=await button.evaluate(el=>{const b=el.getBoundingClientRect(), i=el.querySelector('svg')!.getBoundingClientRect();return {width:b.width,height:b.height,dx:(i.left+i.right-b.left-b.right)/2,dy:(i.top+i.bottom-b.top-b.bottom)/2};});
 {expect(Math.abs(dims.dx)).toBeLessThanOrEqual(1);expect(Math.abs(dims.dy)).toBeLessThanOrEqual(1);expect(dims.width).toBeGreaterThanOrEqual(width===390?43.9:32);}
 {await button.press('Enter');const form=page.getByRole('form',{name:'编辑会话'});await expect(form).toBeVisible();await form.getByRole('button',{name:'取消'}).click();await expect(form).toHaveCount(0);}
});

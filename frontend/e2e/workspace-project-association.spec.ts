import { test, expect, type Page } from '@playwright/test';
import { installAgentInputFixture, inputRunId } from './helpers/agentInputFixtures';
const projectA = '22222222-2222-4222-8222-222222222222';
const projectB = '33333333-3333-4333-8333-333333333333';
const runPath = `/artigen/agent/runs/${inputRunId}`;
async function openGithub(page: Page) {
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  if ((page.viewportSize()?.width || 1440) < 1440) await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await page.getByRole('navigation', { name: '资源面板' }).getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '查看项目', exact: true })).toBeVisible();
}
async function installProjects(page: Page) {
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: [
    { projectId: projectA, title: '品牌网站', status: 'active' }, { projectId: projectB, title: '产品手册', status: 'active' }
  ] } }));
  await page.route('**/api/workspace/projects/*/github**', route => route.fulfill({ json: { repository: null } }));
}
for (const theme of ['dark','light']) {
  test(`${theme}: project viewing is isolated, navigation has visible focus tips and no permanent resize grip`, async ({ page }) => {
    const fixture = await installAgentInputFixture(page, { theme, inspector: true }); fixture.state.run.projectId = projectA;
    await installProjects(page);
    const writes: string[] = []; page.on('request', request => { if (request.method() !== 'GET' && /\/api\/(?:agent-runs|projects|workspace)\//.test(request.url())) writes.push(request.url()); });
    await page.goto(runPath);
    if ((page.viewportSize()?.width || 1440) >= 800) {
      const rail = page.getByRole('navigation', { name: '功能切换' });
      await rail.getByRole('link', { name: '项目', exact: true }).focus();
      await expect(page.getByRole('tooltip')).toHaveText('项目');
      await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0);
      expect(await page.locator('.left-resizer').evaluate(element => getComputedStyle(element,'::before').content)).toBe('none');
    }
    await openGithub(page);
    await page.getByRole('combobox', { name:'查看项目', exact:true }).selectOption(projectB);
    await expect(page.locator('.project-scope-note').first()).toContainText('只影响 GitHub');
    await expect(page.getByRole('button',{name:'将当前任务关联到此项目'})).toHaveCount(0);
    expect(fixture.state.run.projectId).toBe(projectA); expect(writes).toEqual([]);
  });
  test(`${theme}: whole conversation scope is shown before association and click is explicit`, async ({ page }) => {
    const fixture = await installAgentInputFixture(page, { theme, inspector: true }); fixture.state.run.status = 'queued';
    await installProjects(page);
    const requests: any[] = [];
    const scope = {runId:inputRunId,projectId:null,scope:'conversation',conversationId:'conv',affectedRunCount:3,canAssociate:true,requiresPause:false,requiresPausedConfirmation:false,pausableRunIds:[],blockedReason:null};
    await page.route(`**/api/agent-runs/${inputRunId}/project`, route => {
      if (route.request().method()==='PUT') { requests.push(route.request().postDataJSON()); fixture.state.run.projectId=projectA; return route.fulfill({json:{...scope,projectId:projectA}}); }
      return route.fulfill({json:scope});
    });
    await page.goto(runPath); await openGithub(page);
    await page.getByRole('combobox',{name:'查看项目',exact:true}).selectOption(projectA);
    await page.getByRole('button',{name:'将当前任务关联到此项目'}).click();
    await expect(page.getByRole('region',{name:'确认项目关联'})).toContainText('整个会话及其 3 个任务'); expect(requests).toEqual([]);
    await page.getByRole('button',{name:'确认关联',exact:true}).click();
    await expect.poll(()=>requests.length).toBe(1); expect(requests[0]).toEqual({projectId:projectA,confirmConversation:true,confirmPaused:false});
    await expect(page.getByRole('button',{name:'将当前任务关联到此项目'})).toHaveCount(0);
  });
  test(`${theme}: inline pause reaches safe boundary before confirmed association`, async ({ page }) => {
    const fixture = await installAgentInputFixture(page, { theme, inspector:true }); await installProjects(page);
    let paused=false; const actions: string[]=[];
    await page.route(`**/api/agent-runs/${inputRunId}/pause`,route=> { paused=true; actions.push('pause'); fixture.state.run.status='paused'; return route.fulfill({json:{run:fixture.state.run}}); });
    await page.route(`**/api/agent-runs/${inputRunId}/project`,route=> {
      const scope={runId:inputRunId,projectId:null,scope:'run',conversationId:null,affectedRunCount:1,canAssociate:paused,requiresPause:!paused,requiresPausedConfirmation:paused,pausableRunIds:paused?[]:[inputRunId],blockedReason:paused?null:'AGENT_PROJECT_PAUSE_REQUIRED'};
      if(route.request().method()==='PUT') { expect(route.request().postDataJSON().confirmPaused).toBe(true); actions.push('associate'); fixture.state.run.projectId=projectA; return route.fulfill({json:{...scope,projectId:projectA}}); }
      return route.fulfill({json:scope});
    });
    await page.goto(runPath); await openGithub(page); await page.getByRole('combobox',{name:'查看项目',exact:true}).selectOption(projectA);
    await page.getByRole('button',{name:'将当前任务关联到此项目'}).click();
    await expect(page.getByRole('button',{name:'确认关联',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'暂停相关任务',exact:true}).click();
    await expect(page.getByRole('region',{name:'确认项目关联'})).toContainText('关联后保持暂停'); expect(actions).toEqual(['pause']);
    await page.getByRole('button',{name:'确认关联',exact:true}).click(); await expect.poll(()=>actions).toEqual(['pause','associate']); expect(fixture.state.run.status).toBe('paused');
  });
  test(`${theme}: failed project creation preserves name then creates in place without linking run`, async ({ page }) => {
    const fixture=await installAgentInputFixture(page,{theme,inspector:true}); let fail=true;
    await page.route('**/api/projects',route=> route.request().method()==='POST'
      ? route.fulfill(fail?{status:503,json:{error:{code:'UNAVAILABLE'}}}:{json:{project:{projectId:projectB,title:'新提案',status:'active'}}})
      : route.fulfill({json:{projects:[]}}));
    await page.route('**/api/workspace/projects/*/github**',route=>route.fulfill({json:{repository:null}}));
    await page.goto(runPath); await openGithub(page); await page.getByRole('button',{name:'新建项目',exact:true}).click();
    await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('新提案'); await page.getByRole('button',{name:'创建并查看',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'项目名称',exact:true})).toHaveValue('新提案'); await expect(page.locator('.project-error')).toContainText('未完成');
    fail=false; await page.getByRole('button',{name:'创建并查看',exact:true}).click(); await expect(page.getByRole('combobox',{name:'查看项目',exact:true})).toHaveValue(projectB);
    expect(fixture.state.run.projectId).toBe(null); await expect(page).toHaveURL(new RegExp(inputRunId));
  });
}

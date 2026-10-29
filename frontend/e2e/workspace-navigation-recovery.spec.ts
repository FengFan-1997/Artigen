import { test, expect } from '@playwright/test';
import { installAgentInputFixture, inputRunId, inputConversationId } from './helpers/agentInputFixtures';

const runPath = `/artigen/agent/runs/${inputRunId}`;
const projectId = '22222222-2222-4222-8222-222222222222';
const executionId = '55555555-5555-4555-8555-555555555555';

test('every desktop rail entry opens its destination or responds in place', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 1440) < 800, 'The mobile layout hides the rail.');
  await installAgentInputFixture(page, { inspector: true });
  await page.route('**/api/projects', route => route.fulfill({json:{projects:[]}}));
  for (const [label,path,selector] of [
    ['Artigen','/artigen/create','.conversation-heading'],
    ['会话','/artigen/create','.conversation-heading'],
    ['项目','/artigen/projects','.projects-page'],
    ['工具','/artigen/tools','.format-factory-page'],
    ['高级生图','/artigen/ai','.artigen-page'],
    ['账户设置','/login/account','.login-page']
  ]) {
    await page.goto(runPath);
    const link=page.getByRole('navigation',{name:'功能切换'}).getByRole('link',{name:label,exact:true});
    await link.hover(); await expect(page.getByRole('tooltip')).toContainText(label);
    await link.click(); await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator(selector).first()).toBeVisible();
  }
  await page.goto(runPath);
  const rail=page.getByRole('navigation',{name:'功能切换'});
  await rail.getByRole('button',{name:'项目与会话',exact:true}).click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/left-collapsed/);
  await rail.getByRole('button',{name:'展开左栏',exact:true}).click();
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/left-collapsed/);
  await rail.getByRole('button',{name:'GitHub',exact:true}).click();
  await expect(rail.getByRole('button',{name:'GitHub',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('combobox',{name:'查看项目',exact:true})).toBeVisible();
  await rail.getByRole('button',{name:'外观：深色',exact:true}).click();
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme','light');
  await page.locator('.account-action').first().click(); await expect(page).toHaveURL(/\/artigen\/usage$/);
});

test('failed lazy navigation is visible and retry opens the destination', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 1440) < 800, 'The mobile layout hides the rail.');
  await installAgentInputFixture(page);
  await page.route('**/api/projects',route=>route.fulfill({json:{projects:[]}}));
  let unavailable = true;
  await page.route('**/src/agentImg/views/ProjectsPage.vue',route=>unavailable?route.abort('failed'):route.continue());
  // The global router already attempts one document reload for stale chunks.
  // Exercise the remaining error boundary after that recovery was exhausted.
  await page.goto(`${runPath}?__reload=fixture`);
  await page.getByRole('navigation',{name:'功能切换'}).getByRole('link',{name:'项目',exact:true}).click();
  await expect(page.locator('.workspace-navigation-error')).toContainText('页面加载失败');
  await expect(page).toHaveURL(/__reload=fixture/);
  unavailable=false;
  await page.locator('.workspace-navigation-error').getByRole('button',{name:'重试',exact:true}).click();
  await expect(page).toHaveURL(/\/artigen\/projects$/);
  await expect(page.locator('.projects-page')).toBeVisible();
});

test('blocked project migration explains the recovery while title editing stays available', async ({ page }) => {
  await installAgentInputFixture(page);
  let title='有执行记录的会话';
  await page.route('**/api/workspace/navigation',route=>route.fulfill({json:{projects:[{projectId,title:'品牌项目'}],sessions:[{kind:'conversation',id:inputConversationId,title,projectId:null,status:'active'}],nextCursor:null}}));
  await page.route(`**/api/workspace/conversations/${inputConversationId}`,route=> {
    const body=route.request().postDataJSON();
    if(body.projectId) return route.fulfill({status:409,json:{error:{code:'WORKSPACE_CONVERSATION_PROJECT_LOCKED'}}});
    title=body.title; return route.fulfill({json:{ok:true}});
  });
  await page.goto(runPath);
  if((page.viewportSize()?.width || 1440)<1440) await page.getByRole('button',{name:'打开历史',exact:true}).click();
  await page.getByRole('button',{name:'编辑会话 有执行记录的会话',exact:true}).click();
  await page.getByRole('combobox',{name:'所属项目',exact:true}).selectOption(projectId);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('.session-editor')).toContainText('请从任务的 GitHub 面板关联项目');
  await expect(page.getByText('项目目录暂时无法读取。',{exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'所属项目',exact:true}).selectOption('');
  await page.getByLabel('会话名称',{exact:true}).fill('修改后的名称');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('.session-editor')).toHaveCount(0);
  await expect(page.locator('.session-row')).toContainText('修改后的名称');
});

for (const outcome of ['conflict','unknown','cancel-failed'] as const) {
  test(`design attach ${outcome}: clean up only a confirmed project conflict`,async ({page})=> {
    const fixture=await installAgentInputFixture(page); fixture.state.run.status='queued';
    const execution={executionId,conversationId:inputConversationId,sourceMessageId:'message',routeKind:'agent_run',status:'queued',agentRunId:null,toolTaskId:null,maxCredits:50,plan:{objective:'制作品牌提案',capabilities:{files:true},deliverables:['report'],attachmentClientIds:[]}};
    const conversation={conversationId:inputConversationId,projectId:null,title:'项目归属测试',status:'active',autoCreditCap:50,clarificationRounds:0,expiresAt:'2099-01-01T00:00:00Z',createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',messages:[{messageId:'message',sequence:1,role:'user',kind:'text',status:'complete',text:'制作品牌提案',attachments:[],questions:[],assumptions:[],memoryCandidates:[]}],executions:[execution],uploads:[]};
    await page.route(`**/api/design-conversations/${inputConversationId}`,route=>route.fulfill({json:{conversation}}));
    await page.route(`**/executions/${executionId}/agent-quote`,route=>route.fulfill({json:{execution,quote:{canStart:true}}}));
    await page.route(`**/executions/${executionId}/target`,route=>outcome==='unknown'?route.abort('failed'):route.fulfill({status:409,json:{error:{code:'DESIGN_EXECUTION_PROJECT_CONFLICT'}}}));
    let cancels=0;
    await page.route(`**/api/agent-runs/${inputRunId}/cancel`,route=> {
      cancels++;
      return outcome==='cancel-failed'?route.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}):route.fulfill({json:{run:{...fixture.state.run,status:'cancelled'}}});
    });
    await page.goto(`/artigen/create?c=${inputConversationId}`);
    await expect(page.locator('.conversation-heading')).toContainText('项目归属测试');
    await page.waitForFunction(id=>(window as any).inputFixtureSources?.some((source:any)=>source.url.includes(`/design-conversations/${id}/events`)&&!source.closed),inputConversationId);
    await page.evaluate(({id,executionId})=> {
      const source=(window as any).inputFixtureSources.find((source:any)=>source.url.includes(`/design-conversations/${id}/events`)&&!source.closed);
      source.dispatchEvent(new MessageEvent('execution.ready',{data:JSON.stringify({conversationId:id,type:'execution.ready',data:{executionId}})}));
    },{id:inputConversationId,executionId});
    await expect.poll(()=>fixture.state.creates.length).toBe(1);
    await expect(page.locator('.workspace-notice')).toBeVisible();
    if(outcome==='unknown') { expect(cancels).toBe(0); await expect(page.locator('.workspace-notice')).not.toContainText('已停止'); }
    else if(outcome==='conflict') { expect(cancels).toBe(1); await expect(page.locator('.workspace-notice')).toContainText('本次新任务已停止'); }
    else { expect(cancels).toBe(1); await expect(page.locator('.workspace-notice')).toContainText('停止操作尚未确认'); await expect(page.getByRole('link',{name:'查看任务',exact:true})).toHaveAttribute('href',runPath); }
  });
}

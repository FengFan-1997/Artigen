import { expect, test, type Page } from '@playwright/test';
import { activityEvents, inputRunId, installAgentInputFixture } from './helpers/agentInputFixtures';

const references = async (page: Page, names: string[]) => {
  await page.locator('input[type=file]').evaluate((input, names) => {
    const transfer = new DataTransfer();
    names.forEach((name) =>
      transfer.items.add(new File(['reference'], name, { type: 'text/plain', lastModified: 1 }))
    );
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, names);
};
const quote = async (page: Page) => {
  await page
    .getByRole('textbox', { name: '任务目标' })
    .fill('研究品牌网站，整理证据并交付 PDF 报告。');
  await page.getByRole('button', { name: '发送任务目标', exact: true }).click();
  await expect(page.locator('.quote-summary')).toBeVisible();
};

for (const [route, label, kind] of [
  ['/artigen/agent', '任务目标', 'quotes'],
  ['/artigen/create', '设计需求', 'designMessages'],
  [`/artigen/agent/runs/${inputRunId}`, '补充要求', 'inputs']
] as const) {
  test(`${kind}: Enter, Shift+Enter and composition share one contract`, async ({ page }) => {
    const fixture = await installAgentInputFixture(page);
    fixture.state.quoteDelay = fixture.state.inputDelay = fixture.state.designDelay = 400;
    await page.goto(route);
    const input = page.getByRole('textbox', { name: label });
    await input.fill('先保留证据');
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('先保留证据\n');
    await input.dispatchEvent('compositionstart');
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true
    });
    await input.dispatchEvent('compositionend');
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      keyCode: 229
    });
    expect(fixture.state[kind]).toHaveLength(0);
    await input.fill('先保留证据，再制作报告');
    await input.press('Enter');
    await expect.poll(() => fixture.state[kind].length).toBe(1);
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      repeat: true,
      bubbles: true,
      cancelable: true
    });
    await page.locator('.composer-box').dispatchEvent('submit');
    expect(fixture.state[kind]).toHaveLength(1);
    await expect(page.locator('.composer-status')).toHaveCount(0);
    expect(fixture.state.unknown).toEqual([]);
  });
}

test('a Run acknowledgement preserves a newer draft, including after reload', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  fixture.state.inputDelay = 650;
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const input = page.getByRole('textbox', { name: '补充要求' });
  await input.fill('这条已经发送');
  await input.press('Enter');
  await expect.poll(() => fixture.state.inputs.length).toBe(1);
  await expect(input).toBeEnabled();
  await input.fill('下一条尚未发送，请保留');
  await expect(page.locator('.composer-status')).toHaveCount(0);
  await expect(input).toHaveValue('下一条尚未发送，请保留');
  await page.reload();
  await expect(input).toHaveValue('下一条尚未发送，请保留');
  expect(fixture.state.inputs).toHaveLength(1);
  expect(fixture.state.inputs[0]?.message).toBe('这条已经发送');
});

test('retrying the same failed Run input reuses its idempotency identity', async ({ page }) => {
  const fixture = await installAgentInputFixture(page);
  fixture.state.inputFail = true;
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const input = page.getByRole('textbox', { name: '补充要求' });
  await input.fill('请保留原有页面证据');
  await input.press('Enter');
  await expect(page.locator('.composer-status')).toHaveCount(0);
  await expect(page.locator('.run-notice')).toBeVisible();
  await expect(input).toHaveValue('请保留原有页面证据');
  fixture.state.inputFail = false;
  await input.press('Enter');
  await expect(input).toHaveValue('');
  expect(fixture.state.inputs).toHaveLength(2);
  expect(fixture.state.inputs[0]?.inputId).toBeTruthy();
  expect(fixture.state.inputs[0]?.inputId).toBe(fixture.state.inputs[1]?.inputId);
  await input.fill('请保留原有页面证据');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  expect(fixture.state.inputs[2]?.inputId).not.toBe(fixture.state.inputs[0]?.inputId);
});

test('the terminal shared Run composer disables text, attachments and sending', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  fixture.state.run.status = 'succeeded';
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await expect(page.getByRole('textbox', { name: '补充要求' })).toBeDisabled();
  await expect(page.locator('.run-composer .attach')).toBeDisabled();
  await expect(page.locator('.run-composer .send')).toBeDisabled();
  await page.locator('.composer-box').dispatchEvent('submit');
  expect(fixture.state.inputs).toHaveLength(0);
});

for (const [route, label] of [
  ['/artigen/agent', '任务目标'],
  ['/artigen/create', '设计需求']
] as const) {
  test(`${route}: repeated selection appends and deduplicates, with single removal`, async ({
    page
  }) => {
    await installAgentInputFixture(page);
    await page.goto(route);
    await page.getByRole('textbox', { name: label }).fill('阅读这些资料并提出建议');
    await references(page, ['brief.txt']);
    await references(page, ['brief.txt', 'notes.txt']);
    await expect(page.locator('.attachment-card')).toHaveCount(2);
    await expect(page.locator('.attachment-list')).toContainText('brief.txt');
    await expect(page.locator('.attachment-list')).toContainText('notes.txt');
    await page.getByRole('button', { name: '移除 brief.txt', exact: true }).click();
    await expect(page.locator('.attachment-card')).toHaveCount(1);
    await expect(page.locator('.attachment-list')).not.toContainText('brief.txt');
  });
  test(`${route}: an over-limit selection reports the limit and keeps existing references`, async ({
    page
  }) => {
    await installAgentInputFixture(page);
    await page.goto(route);
    await references(page, ['original.txt']);
    await references(
      page,
      Array.from({ length: 10 }, (_, i) => `new-${i}.txt`)
    );
    await expect(page.locator('.attachment-card')).toHaveCount(1);
    await expect(page.locator('.attachment-list')).toContainText('original.txt');
    await expect(page.locator('#artigen-workspace-main').getByText(/最多添加 10 个/)).toBeVisible();
  });
}

test('changing references invalidates the quote and explicit editing focuses the shared field', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  await page.goto('/artigen/agent');
  await references(page, ['brief.txt']);
  await quote(page);
  await expect(page.locator('.quote-scope')).toContainText('brief.txt');
  await references(page, ['notes.txt']);
  await expect(page.getByRole('button', { name: '确认并运行', exact: true })).toHaveCount(0);
  expect(fixture.state.creates).toHaveLength(0);
  await page.getByRole('button', { name: '发送任务目标', exact: true }).click();
  await expect(page.locator('.quote-scope')).toContainText('notes.txt');
  await page.getByRole('button', { name: '修改要求与附件', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '任务目标' })).toBeFocused();
  await expect(page.locator('.quote-summary')).toHaveCount(0);
});

test('upload failure preserves files and blocks task creation; a retry can complete', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  fixture.state.uploadDelay = 500;
  fixture.state.uploadFail = true;
  await page.goto('/artigen/agent');
  await references(page, ['brief.txt', 'notes.txt']);
  await quote(page);
  await page.getByRole('button', { name: '确认并运行', exact: true }).click();
  await expect(page.locator('.composer-status')).toContainText('正在上传 2 个参考文件');
  await expect(page.getByRole('button', { name: '移除 brief.txt' })).toBeDisabled();
  expect(fixture.state.creates).toHaveLength(0);
  await expect(
    page
      .locator('#artigen-workspace-main')
      .getByText('参考文件上传失败，已保留你的选择，任务尚未创建。请重试。', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.attachment-card')).toHaveCount(2);
  fixture.state.uploadFail = false;
  await page.getByRole('button', { name: '确认并运行', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/runs/${inputRunId}$`));
  expect(fixture.state.uploads).toBe(2);
  expect(fixture.state.creates).toHaveLength(1);
  expect(fixture.state.creates[0]?.assetIds).toHaveLength(2);
});

test('a failed create reuses uploaded references and the confirmed idempotency key', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  fixture.state.createFail = true;
  await page.goto('/artigen/agent');
  await references(page, ['brief.txt']);
  await quote(page);
  await page.getByRole('button', { name: '确认并运行', exact: true }).click();
  await expect.poll(() => fixture.state.creates.length).toBe(1);
  await expect(page.locator('.composer-status')).toHaveCount(0);
  fixture.state.createFail = false;
  await page.getByRole('button', { name: '确认并运行', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/runs/${inputRunId}$`));
  expect(fixture.state.uploads).toBe(1);
  expect(fixture.state.creates).toHaveLength(2);
  expect(fixture.state.creates[0]?.assetIds).toEqual(fixture.state.creates[1]?.assetIds);
  expect(fixture.state.creates[0]?.idempotencyKey).toBe(fixture.state.creates[1]?.idempotencyKey);
});

test('twenty correlated calls become twenty records, not forty chat messages, while raw audit remains complete', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page, { inspector: true });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const events = activityEvents();
  await fixture.emit(events);
  await expect(page.locator('.agent-activity > summary')).toContainText('20 次工具调用');
  await expect(page.locator('.event-message')).toHaveCount(0);
  await page.locator('.agent-activity > summary').click();
  await expect(page.locator('.tool-call')).toHaveCount(20);
  await page.locator('.tool-call > summary').first().click();
  await expect(page.locator('.tool-call').first().locator('.call-event')).toHaveCount(2);
  await expect(page.locator('.tool-call').first()).toContainText('fixture-call-0');
  await expect(page.locator('.context-update')).toHaveCount(2);
  if (!(await page.getByRole('navigation', { name: '资源面板' }).isVisible())) {
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  }
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: '任务', exact: true })
    .click();
  await page.getByRole('tab', { name: /计划/ }).click();
  await page
    .locator('summary')
    .filter({ hasText: /审计记录/ })
    .click();
  await expect(page.locator('.audit-details article')).toHaveCount(events.length);
});

test('unknown receipts remain unconfirmed and private payload fields never enter the UI', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const event = activityEvents(1).find((item) => item.type === 'tool.call.started')!;
  await fixture.emit([
    {
      ...event,
      data: { ...event.data, arguments: 'PRIVATE_TEST_MARKER', output: 'PRIVATE_TEST_MARKER' }
    },
    {
      ...event,
      eventId: '90',
      type: 'tool.call.completed',
      data: { ...event.data, arguments: 'PRIVATE_TEST_MARKER' }
    }
  ]);
  await page.locator('.agent-activity > summary').click();
  await expect(page.locator('.tool-result')).toHaveText('结果待确认');
  await page.locator('.tool-call > summary').click();
  await expect(page.locator('.agent-activity')).not.toContainText('PRIVATE_TEST_MARKER');
  await expect(page.locator('.call-event')).toHaveCount(2);
});

test('background activity preserves a reading position and provides an explicit jump', async ({
  page
}) => {
  const fixture = await installAgentInputFixture(page);
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await fixture.emit();
  await page.locator('.agent-activity > summary').click();
  const area = page.locator('.conversation-scroll');
  await area.evaluate((e) => (e.scrollTop = 120));
  await page.waitForTimeout(100);
  const event = activityEvents(1)[0]!;
  await fixture.emit([
    { ...event, eventId: '99', type: 'verification.started', summary: '开始验证报告的交付格式。' }
  ]);
  await expect(page.getByRole('button', { name: '有新内容 · 回到底部' })).toBeVisible();
  expect(await area.evaluate((e) => e.scrollTop)).toBeCloseTo(120, 0);
  await page.getByRole('button', { name: '有新内容 · 回到底部' }).click();
  await expect
    .poll(() => area.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight))
    .toBeLessThan(10);
});

for (const width of [390, 768, 1440]) {
  test(`${width}px: shared composer and expanded activity retain visible controls`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const fixture = await installAgentInputFixture(page, { theme: 'light' });
    await page.goto(`/artigen/agent/runs/${inputRunId}`);
    await fixture.emit();
    await page.locator('.agent-activity > summary').click();
    await page.getByRole('textbox', { name: '补充要求' }).fill('继续整理已有证据，不发布内容。');
    const geometry = await page.locator('.run-composer').boundingBox();
    expect(geometry!.x).toBeGreaterThanOrEqual(0);
    expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(width);
    expect(geometry!.y + geometry!.height).toBeLessThanOrEqual((width === 390 ? 844 : 960) + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    if (width === 390) {
      const size = await page.getByRole('button', { name: '发送', exact: true }).boundingBox();
      expect(size!.width).toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('mobile approval and child controls retain their 44px targets after replacing the old composer', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installAgentInputFixture(page);
  fixture.state.run.status = 'waiting_user';
  fixture.state.run.approvals = [
    {
      approvalId: '22222222-2222-4222-8222-222222222222',
      actionType: 'publish',
      recipient: 'https://brand.example/publish',
      riskLevel: 'high',
      changeSummary: '发布已经审核的内容',
      evidenceSummary: '最终稿已准备好',
      impactSummary: '公开内容将改变',
      rollbackSummary: '可以恢复旧版',
      status: 'pending',
      expiresAt: '2099-10-15T03:00:00.000Z',
      decidedAt: null,
      createdAt: '2026-10-15T03:00:00.000Z'
    }
  ];
  fixture.state.run.subagents = [
    {
      subagentId: '33333333-3333-4333-8333-333333333333',
      runId: inputRunId,
      ordinal: 1,
      role: 'research',
      label: '页面研究',
      status: 'running',
      progress: { stepCount: 2, maxSteps: 20, cancelRequested: false },
      usage: { credits: 1 },
      summary: '整理页面证据',
      outputFiles: [],
      error: null,
      expiresAt: '2099-10-15T03:00:00.000Z',
      createdAt: '2026-10-15T03:00:00.000Z',
      startedAt: '2026-10-15T03:00:00.000Z',
      finishedAt: null,
      updatedAt: '2026-10-15T03:00:00.000Z'
    }
  ];
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const approval = page.getByRole('button', { name: '仅批准这一次', exact: true });
  await approval.scrollIntoViewIfNeeded();
  const box = await approval.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  if (!(await page.getByRole('navigation', { name: '资源面板' }).isVisible())) {
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  }
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: '任务', exact: true })
    .click();
  await page.getByRole('tab', { name: /子 Agent/ }).click();
  const cancel = page.getByRole('button', { name: '取消这个子 Agent', exact: true });
  const childBox = await cancel.boundingBox();
  expect(childBox!.width).toBeGreaterThanOrEqual(44);
  expect(childBox!.height).toBeGreaterThanOrEqual(44);
});

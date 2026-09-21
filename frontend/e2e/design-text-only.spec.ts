import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);
const { normalizePlannerDecision } = require('../../backend/services/design-conversation-service');

// Exercise the actual server normalizer and the browser auto-start boundary together.
// All HTTP is mocked: no real account, model, quote, task or credit operation.
test('text-only advice stays a reply after execution.ready and never requests a paid executor', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const executionId = '44444444-4444-4444-8444-444444444444';
  const text = '只做文字咨询，不创建文件、不生成图片、不启动电脑任务。请为虚构咖啡店写 3 条周末活动宣传文案。';
  const answer = '周六 14:00–17:00，冰拿铁第二杯半价。';
  const decision = normalizePlannerDecision({
    raw: { routeKind: 'tool_task', toolId: 'ai-design', operation: 'generate', reply: answer },
    text, attachments: [], clarificationRounds: 0, creditCap: 50
  });
  const now = '2026-09-21T08:00:00.000Z';
  let sent = false;
  let publish = () => {};
  const planned = new Promise<void>((resolve) => { publish = resolve; });
  const paidRequests: string[] = [];
  const snapshot = () => ({
    conversationId: id, title: '咖啡店文字咨询', status: 'active', autoCreditCap: 50,
    clarificationRounds: 0, projectId: null, createdAt: now, updatedAt: now, expiresAt: null,
    messages: sent ? [
      { messageId: '22222222-2222-4222-8222-222222222222', role: 'user', kind: 'text', status: 'complete', sequence: 1, text, attachments: [], questions: [], assumptions: [], createdAt: now },
      { messageId: '33333333-3333-4333-8333-333333333333', role: 'assistant', kind: 'text', status: 'complete', sequence: 2, text: decision.reply, attachments: [], questions: [], assumptions: [], createdAt: now }
    ] : [],
    executions: sent ? [{ ...decision, executionId, conversationId: id, sourceMessageId: '33333333-3333-4333-8333-333333333333', maxCredits: 50,
      toolTaskId: null, agentRunId: null, quotedCredits: null,
      plan: { ...decision.plan, options: decision.options }, createdAt: now, updatedAt: now
    }] : [], uploads: []
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = (data: object) => route.fulfill({ status: 200, json: { ok: true, ...data } });
    if (/\/(?:tool-tasks|agent-runs)(?:\/|$)/.test(pathname)) {
      paidRequests.push(pathname);
      return route.abort();
    }
    if (pathname === '/api/auth/session') return respond({ authenticated: true, userId: 'mock-text-user', csrfToken: 'mock-csrf' });
    if (pathname === '/api/design-assistant/status') return respond({ status: { enabled: true, workerEnabled: true, plannerReady: true, autoCreditCap: 50 } });
    if (pathname.endsWith('/authorizations')) return respond({ authorizations: [] });
    if (pathname.endsWith('/events')) {
      await planned;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body:
        `event: execution.ready\ndata: ${JSON.stringify({ eventId: '1', conversationId: id, type: 'execution.ready', data: { executionId }, createdAt: now })}\n\n`
      });
    }
    if (pathname.endsWith('/messages') && request.method() === 'POST') {
      expect(request.postDataJSON().message).toBe(text);
      sent = true;
      return respond({ message: snapshot().messages[0] });
    }
    if (pathname === '/api/design-conversations') {
      return respond(request.method() === 'POST' ? { conversation: snapshot() } : { conversations: [] });
    }
    if (pathname === `/api/design-conversations/${id}`) return respond({ conversation: snapshot() });
    return respond({ balance: 120, clientId: '' });
  });
  await page.goto('/artigen/create');
  await expect(page.getByText('正在检查执行器', { exact: true })).toHaveCount(0);
  await page.getByLabel(/^(?:设计需求|Design request)$/).fill(text);
  await page.getByRole('button', { name: /^(?:发送需求|Send request)$/ }).click();
  await expect(page.getByLabel(/^(?:设计需求|Design request)$/)).toHaveValue('');
  publish();
  await expect(page.locator('.message.assistant:not(.planning-message)')).toContainText(answer);
  await expect(page.locator('.planning-message')).toHaveCount(0);
  await expect(page.locator('.execution-card.route-tool_task, .execution-card.route-agent_run, .execution-card.route-local_tool')).toHaveCount(0);
  expect(sent).toBe(true);
  expect(paidRequests).toEqual([]);
  expect(decision.routeKind).toBe('reply');
  expect(decision.status).toBe('succeeded');
});

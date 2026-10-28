import type { Page } from '@playwright/test';
export const uxRunId = '11111111-1111-4111-8111-111111111111';
export const uxProjectId = '22222222-2222-4222-8222-222222222222';
export const uxUserId = 'ux-account-verified';
export async function installAgentUxFixture(page: Page, options: { theme?: string; guest?: boolean; offline?: boolean; status?: string; walletFailure?: boolean; inputFailure?: boolean; uploadFailure?: boolean; longTitle?: boolean } = {}) {
  const now = '2026-10-28T04:30:00.000Z';
  const state = {
    offline: options.offline ?? true, walletFailure: options.walletFailure ?? false,
    inputFailure: options.inputFailure ?? false, uploadFailure: options.uploadFailure ?? false, uploads: 0,
    inputs: [] as Array<Record<string, any>>, associations: [] as Array<Record<string, any>>,
    events: [] as Array<Record<string, any>>, messages: [] as Array<Record<string, any>>, balance: 87.375,
    run: { runId: uxRunId, projectId: null as string | null,
      objective: '整理本次品牌升级的视觉规范，生成可编辑文件和一份交付说明。',
      objectivePreview: options.longTitle ? '整理品牌升级的视觉规范、全部设计资源与可编辑文件并检查所有交付结果'.repeat(3) : '整理品牌升级方案与交付文件',
      status: options.status || 'queued', model: { provider: 'cloudflare', name: '@cf/openai/gpt-oss-120b' },
      sandbox: { provider: 'cua', version: 'pinned-v1', takeoverAvailable: false },
      capabilities: { research: true, browser: true, files: true, shell: true, subagents: false },
      browserConfig: { allowedOrigins: [], profileId: null, persistSession: false },
      budget: { maximum: 50, freeReserved: 0, used: 0.003, charged: 0, frozen: 50, refunded: 0, released: 0 },
      progress: { stepCount: 0, maxSteps: 120, replanCount: 0, pauseRequested: false, cancelRequested: false, checklist: {}, plan: [], durableCheckpointSaved: true },
      approvals: [], artifacts: [], subagents: [], error: null, createdAt: now, queuedAt: now, updatedAt: now, startedAt: null, finishedAt: null, expiresAt: '2026-12-01T00:00:00.000Z' }
  };
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('artigen-workspace-preferences', JSON.stringify({ version: 4, inspectorVisibility: { compose: false, task: false }, resourceMode: 'github', theme, rightWidth: 480 }));
    localStorage.setItem('locale', 'zh');
  }, { theme: options.theme || 'dark' });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname, method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (p === '/api/auth/session') return json({ ok: true, authenticated: !options.guest, userId: options.guest ? undefined : uxUserId, csrfToken: 'ux-fixture-csrf' });
    if (p === '/api/meta') return json({ ok: true, environment: 'dev', signupOffer: { available: true, credits: 175 }, auth: { publicSignupEnabled: true }, capabilities: { publicSignup: true } });
    if (p === '/api/agent/status') return json({ ok: true, status: { enabled: true, workerOnline: !state.offline, workerModelReady: !state.offline, queueDepth: 1, concurrency: 2, availabilityNote: state.offline ? 'worker_offline' : 'ready', modelFamily: '@cf/openai/gpt-oss-120b' } });
    if (p === '/api/credits/balance') return state.walletFailure ? json({ error: { code: 'TEMPORARY' } }, 503) : json({ userId: uxUserId, available: state.balance, frozen: state.run.budget.frozen });
    if (p === '/api/credits/costs') return json({ generate: 10, img2img: 12 });
    if (p === '/api/workspace/navigation') return json({ ok: true, projects: [{ projectId: uxProjectId, title: '品牌升级', status: 'active' }], sessions: [], nextCursor: null });
    if (p === '/api/projects') return json({ ok: true, projects: [{ projectId: uxProjectId, title: '品牌升级', status: 'active', revision: 1 }] });
    if (p.endsWith('/github')) return json({ ok: true, repository: null });
    if (p.endsWith('/files')) return json({ ok: true, files: [] });
    if (p === '/api/agent-runs') return json({ ok: true, runs: [state.run] });
    if (p === `/api/agent-runs/${uxRunId}`) return json({ ok: true, run: state.run });
    if (p.endsWith('/history') || p.endsWith('/activity')) return json({ ok: true, events: state.events.filter(event => Number(event.eventId) > Number(url.searchParams.get('after') || 0)) });
    if (p.endsWith('/events')) return route.abort();
    if (p.endsWith('/messages')) return json({ ok: true, messages: state.messages, nextCursor: null });
    if (p === '/api/agent-assets') { state.uploads++; if (state.uploadFailure) { state.uploadFailure = false; return json({ error: { code: 'AGENT_ASSET_UPLOAD_INCOMPLETE' } }, 503); } const count = (request.postDataBuffer()?.toString().match(/filename=/g) || []).length; return json({ ok: true, assets: Array.from({ length: count }, (_, i) => ({ assetId: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}` })) }); }
    if (p.endsWith('/input')) {
      const body = request.postDataJSON(); state.inputs.push(body);
      if (state.inputFailure) { state.inputFailure = false; return json({ error: { code: 'AGENT_INPUT_FAILED' } }, 503); }
      state.messages.push({ id: body.inputId, role: 'user', kind: 'text', text: body.message, createdAt: now, attachments: (body.assetIds || []).map((assetId: string) => ({ assetId, filename: body.assetNames[assetId], byteSize: 24, mimeType: 'text/plain' })) });
      state.events.push({ eventId: String(state.events.length + 1), runId: uxRunId, type: 'run.input_received', phase: state.run.status, summary: '已收到补充信息', data: { messagePayloadId: body.inputId, messageText: body.message, attachments: state.messages.at(-1)!.attachments }, createdAt: now });
      return json({ ok: true });
    }
    if (p.endsWith('/project')) {
      if (method === 'PUT') { const body = request.postDataJSON(); state.associations.push(body); state.run.projectId = body.projectId; }
      return json({ ok: true, runId: uxRunId, projectId: state.run.projectId, scope: 'run', conversationId: null, affectedRunCount: 1, canAssociate: true, requiresPause: false, requiresPausedConfirmation: state.run.status === 'paused', pausableRunIds: [], blockedReason: null });
    }
    for (const [action, status] of Object.entries({ pause: 'paused', resume: 'queued', cancel: 'cancelled' })) if (p.endsWith('/' + action)) {
      state.run.status = status;
      if (action === 'cancel') { state.run.budget.charged = 0.003; state.run.budget.released = 49.997; state.run.budget.frozen = 0; state.balance = 137.372; }
      return json({ ok: true, run: state.run });
    }
    if (p === '/api/collection/event') return json({ ok: true }, 202);
    return json({ ok: true, items: [], projects: [], presets: [], conversations: [], tasks: [], packages: [], files: [] });
  });
  return state;
}

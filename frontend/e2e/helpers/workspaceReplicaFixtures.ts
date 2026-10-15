import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
const previewPng = Buffer.from(
  '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',
  'base64'
);
import {
  installAgentInputFixture,
  activityEvents,
  inputRunId,
  inputConversationId
} from './agentInputFixtures';
export const projectA = '22222222-2222-4222-8222-222222222222';
export const projectB = '33333333-3333-4333-8333-333333333333';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const stamp = '2026-10-15T03:00:10.000Z';
const previewPdf = (() => {
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>'
  ];
  const stream = 'BT /F1 24 Tf 40 90 Td (Artigen workspace PDF) Tj ET';
  bodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let text = '%PDF-1.4\n';
  const offsets = [0];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
})();
export async function installWorkspaceFixture(page: Page, theme = 'dark') {
  const fixture = await installAgentInputFixture(page, {
    theme,
    inspector: true,
    events: activityEvents(3)
  });
  fixture.state.run.projectId = projectA;
  const files = [
    {
      id: '44444444-4444-4444-8444-444444444444',
      path: 'docs/brief.md',
      text: '# 品牌网站审查\n\n已完成首页与购买流程检查。\n\n| 页面 | 结果 |\n| --- | --- |\n| 首页 | 需要明确主按钮 |\n| 结算 | 已记录三个问题 |\n\n> 优先修复影响任务完成的问题。\n\n```css\n.action { color: #b5df25; }\n```\n',
      mimeType: 'text/plain',
      assetId: '80000000-0000-4000-8000-000000000001'
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      path: 'src/theme.css',
      text: ':root {\n  --accent: #b5df25;\n  --background: #191919;\n}\n',
      mimeType: 'text/plain',
      assetId: '80000000-0000-4000-8000-000000000002'
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      path: 'outputs/brief-revised.md',
      originArtifactId: '70000000-0000-4000-8000-000000000003',
      text: '# 品牌网站审查\n\n已完成首页与购买流程检查。\n\n## 建议\n\n1. 将主按钮改成“开始创作”。\n2. 保留访客输入，登录后继续。\n',
      mimeType: 'text/plain',
      assetId: '80000000-0000-4000-8000-000000000003'
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      path: 'outputs/preview.png',
      text: '',
      mimeType: 'image/png',
      assetId: '80000000-0000-4000-8000-000000000004'
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      path: 'docs/report.pdf',
      text: '',
      mimeType: 'application/pdf',
      assetId: '80000000-0000-4000-8000-000000000005'
    }
  ].map((f) => ({
    ...f,
    revision: 1,
    sha256:
      f.mimeType === 'image/png'
        ? createHash('sha256').update(previewPng).digest('hex')
        : hash(f.text),
    byteSize: f.mimeType === 'image/png' ? previewPng.length : Buffer.byteLength(f.text),
    url: '/api/assets/' + f.assetId
  }));
  const history = new Map(files.map((f) => [f.id, [f.text]]));
  const state = {
    files,
    conflict: false,
    saveDelay: 0,
    saves: [] as unknown[],
    messageRequests: 0,
    githubRequests: [] as string[],
    navigationRequests: 0
  };
  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: status < 400, ...(body as object) })
      });
    if (p === '/api/workspace/navigation') {
      state.navigationRequests++;
      return json({
        projects: [
          { projectId: projectA, title: '品牌网站' },
          { projectId: projectB, title: '夏日视觉' }
        ],
        sessions: [
          {
            id: inputConversationId,
            projectId: projectA,
            title: '首页体验研究',
            kind: 'conversation',
            status: 'running',
            updatedAt: stamp
          },
          {
            id: inputRunId,
            projectId: projectA,
            title: '整理网站审查报告',
            kind: 'run',
            status: 'running',
            updatedAt: stamp
          },
          {
            id: '99999999-9999-4999-8999-999999999999',
            projectId: projectB,
            title: '柚子气泡水海报',
            kind: 'conversation',
            status: 'active',
            updatedAt: stamp
          }
        ],
        nextCursor: null
      });
    }
    if (p.includes('/conversations/')) return json({ conversation: {} });
    if (p.includes('/github')) {
      state.githubRequests.push(request.method());
      if (p.endsWith('/github'))
        return json({ repository: { owner: 'example', repository: 'brand-site' } });
      if (p.endsWith('/pulls'))
        return json({
          items: [
            {
              number: 12,
              title: '完善首页按钮与移动端布局',
              state: 'open',
              url: 'https://github.com/example/brand-site/pull/12',
              updatedAt: stamp
            }
          ],
          hasMore: false
        });
      if (p.endsWith('/commits'))
        return json({
          items: [
            {
              sha: 'a'.repeat(40),
              title: '修复登录后草稿恢复',
              url: 'https://github.com/example/brand-site/commit/' + 'a'.repeat(40),
              updatedAt: stamp
            }
          ],
          hasMore: false
        });
      return json({
        items: [
          {
            filename: 'src/Home.vue',
            additions: 7,
            deletions: 2,
            patch:
              '@@ -12,2 +12,7 @@\n-<button>提交</button>\n+<button>开始创作</button>\n+<p>登录后继续当前任务</p>'
          }
        ],
        hasMore: false
      });
    }
    const matched = p.match(/\/files(?:\/([^/]+)(?:\/(content|versions))?)?$/);
    if (matched) {
      const id = decodeURIComponent(matched[1] || '');
      const file = state.files.find((f) => f.id === id);
      if (request.method() === 'PUT') {
        state.saves.push(request.postDataJSON());
        if (state.saveDelay) await new Promise((resolve) => setTimeout(resolve, state.saveDelay));
        if (state.conflict) return json({ error: { code: 'WORKSPACE_VERSION_CONFLICT' } }, 409);
        if (!file) return json({ error: { code: 'NOT_FOUND' } }, 404);
        const input = request.postDataJSON();
        history.get(id)!.push(input.text);
        Object.assign(file, {
          text: input.text,
          sha256: hash(input.text),
          byteSize: Buffer.byteLength(input.text),
          revision: file.revision + 1
        });
        return json({ file });
      }
      if (!id) return json({ files: state.files });
      if (!file) return json({ error: { code: 'NOT_FOUND' } }, 404);
      if (matched[2] === 'content' && file.mimeType !== 'text/plain')
        return json({ error: { code: 'WORKSPACE_NOT_UTF8' } }, 415);
      if (matched[2] === 'versions')
        return json({
          versions: history
            .get(id)!
            .map((text, i) => ({ revision: i + 1, createdAt: stamp, sha256: hash(text) }))
        });
      return json({
        file,
        text: url.searchParams.has('revision')
          ? history.get(id)![Number(url.searchParams.get('revision')) - 1]
          : file.text
      });
    }
    return json({ error: { code: 'FIXTURE_UNKNOWN' } }, 404);
  });
  await page.route('**/api/assets/80000000-0000-4000-8000-000000000004', (route) =>
    route.fulfill({ contentType: 'image/png', body: previewPng })
  );
  await page.route('**/api/assets/80000000-0000-4000-8000-000000000005', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: previewPdf })
  );
  await page.route(`**/api/agent-runs/${inputRunId}/messages*`, async (route) => {
    state.messageRequests++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            kind: 'commentary',
            text: '我会先核对首页信息层级，再检查移动端购买流程。\n\n## 本轮重点\n\n- 记录问题出现的位置\n- 保留可以验证的页面证据\n- 输出可继续编辑的文件\n\n![生成结果](preview.png)',
            createdAt: stamp
          },
          {
            id: 'm2',
            role: 'assistant',
            kind: 'final',
            text: '已整理初稿。可以在右侧阅读 [审查报告](brief.md)，查看源码或对比下一版。\n\n| 优先级 | 问题 |\n| --- | --- |\n| P1 | 登录后恢复当前任务 |\n| P2 | 主按钮层级不清晰 |',
            createdAt: '2026-10-15T03:01:00.000Z'
          }
        ],
        nextCursor: null
      })
    });
  });
  await page.route('**/api/agent-runs/*/activity*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, events: activityEvents(3) })
    })
  );
  return { ...fixture, workspace: state };
}

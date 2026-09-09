import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const projectId = '99999999-9999-4999-8999-999999999999';
const project = {
  projectId,
  title: '秋季咖啡礼盒',
  status: 'active',
  productName: '山岚咖啡礼盒',
  brief: '为电商投放制作一套主视觉。',
  brandProfile: { brandName: '', colors: [], styleKeywords: [], prohibitedElements: [], logoAssetId: null },
  designMemory: {
    audience: '', goals: [], tone: [], visualKeywords: [], mustInclude: [], avoid: [],
    outputPreferences: { deliverables: [], aspectRatio: '', language: '' }, factualConstraints: []
  },
  coverAssetId: null,
  coverUrl: null,
  revision: 1,
  versionCount: 2,
  assets: [],
  versions: [],
  createdAt: '2026-08-31T08:00:00.000Z',
  updatedAt: '2026-08-31T08:00:00.000Z'
};

const expectProjectPageGeometry = async (page: Page, mobile = false) => {
  const report = await page.locator('.projects-page').evaluate((root, isMobile) => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const interactive = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])'))
      .filter(visible);
    const blocked = interactive.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + Math.min(8, rect.width / 3), rect.top + rect.height / 2],
        [rect.right - Math.min(8, rect.width / 3), rect.top + rect.height / 2]
      ].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
      const label = element.closest('label');
      const accepted = (hit: Element | null) => Boolean(hit && (hit === element || element.contains(hit) || label?.contains(hit)));
      return points.length > 0 && points.some(([x, y]) => !accepted(document.elementFromPoint(x, y)))
        ? [{ name: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, rect: rect.toJSON() }]
        : [];
    });
    const undersized = isMobile
      ? interactive.filter((element) => ['BUTTON', 'A'].includes(element.tagName)).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5
          ? [{ name: element.getAttribute('aria-label') || element.textContent?.trim(), width: rect.width, height: rect.height }]
          : [];
      })
      : [];
    const hero = root.querySelector('.projects-hero')!;
    const copy = root.querySelector('.projects-hero-copy')!;
    const action = root.querySelector('.projects-hero .project-primary-action')!;
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      blocked,
      undersized,
      heroWidth: hero.getBoundingClientRect().width,
      copyWidth: copy.getBoundingClientRect().width,
      actionWidth: action.getBoundingClientRect().width,
      textAlign: getComputedStyle(root).textAlign
    };
  }, mobile);
  expect(report.overflow, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.blocked, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.undersized, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.textAlign).toBe('left');
  expect(report.copyWidth, JSON.stringify(report, null, 2)).toBeGreaterThan(Math.min(280, report.heroWidth * 0.45));
  expect(report.actionWidth, JSON.stringify(report, null, 2)).toBeLessThan(300);
};

test('project page is immune to AI workspace global styles during SPA navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/ai');
  await page.locator('a[href="/artigen/projects"]').first().click();
  await expect(page).toHaveURL('/artigen/projects');
  await expectProjectPageGeometry(page);
  if (process.env.ARTIGEN_CAPTURE_REVIEW && testInfo.project.name === 'chromium-desktop') {
    await page.screenshot({
      path: path.resolve(process.cwd(), '../.artifacts/projects-page-interaction-audit/projects-after-ai-1440.png'),
      fullPage: true,
      animations: 'disabled'
    });
  }
});

test('every visible project-page button performs its advertised action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/projects');

  await page.getByRole('button', { name: '切换语言' }).click();
  await page.getByText('EN · English', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Turn one product kit into a launch-ready visual set' })).toBeVisible();
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByText('ZH · 中文', { exact: true }).click();

  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭登录窗口' }).click();

  await page.getByRole('button', { name: '创建商品视觉项目' }).click();
  await expect(page.getByRole('heading', { name: '先写需求，确认生成时再登录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '进入项目工作台' })).toBeDisabled();
  await page.getByRole('button', { name: '收起' }).click();
  await expect(page.getByRole('heading', { name: '先写需求，确认生成时再登录' })).toHaveCount(0);

  await page.getByRole('button', { name: '登录查看项目' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭登录窗口' }).click();
  await expectProjectPageGeometry(page);
});

test('authenticated project actions refresh, trash, restore and create exactly once', async ({ page }) => {
  let status: 'active' | 'trashed' = 'active';
  let listRequests = 0;
  let createRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('app_user_id', 'project-e2e-user');
    localStorage.setItem('agent_user_id', 'project-e2e-user');
  });
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, authenticated: true, userId: 'project-e2e-user', csrfToken: 'csrf-e2e' })
  }));
  await page.route('**/api/auth/google/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clientId: '' })
  }));
  await page.route('**/api/collection/event', (route) => route.fulfill({ status: 202, body: '{}' }));
  await page.route('**/api/projects**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/projects' && method === 'GET') {
      listRequests += 1;
      const includeTrashed = url.searchParams.get('includeTrashed') === '1';
      const projects = includeTrashed
        ? status === 'trashed' ? [{ ...project, status: 'trashed' }] : []
        : status === 'active' ? [{ ...project, status: 'active' }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projects }) });
    }
    if (url.pathname === '/api/projects' && method === 'POST') {
      createRequests += 1;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, project: { ...project, status: 'active' } }) });
    }
    if (url.pathname === `/api/projects/${projectId}` && method === 'DELETE') {
      status = 'trashed';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, project: { ...project, status } }) });
    }
    if (url.pathname === `/api/projects/${projectId}/restore` && method === 'POST') {
      status = 'active';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, project: { ...project, status } }) });
    }
    if (url.pathname === `/api/projects/${projectId}` && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, project: { ...project, status } }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });

  await page.goto('/artigen/projects');
  await expect(page.getByText('秋季咖啡礼盒')).toBeVisible();
  const initialLists = listRequests;
  await page.getByRole('button', { name: '刷新' }).click();
  await expect.poll(() => listRequests).toBeGreaterThan(initialLists);

  await page.getByRole('button', { name: '移到回收站' }).click();
  await expect(page.getByText('秋季咖啡礼盒')).toHaveCount(0);
  await page.getByRole('button', { name: '回收站' }).click();
  await expect(page.getByRole('button', { name: '恢复项目' })).toBeVisible();
  await page.getByRole('button', { name: '恢复项目' }).click();
  await expect(page.getByRole('button', { name: '恢复项目' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回项目' }).click();
  await expect(page.getByText('秋季咖啡礼盒')).toBeVisible();

  await page.getByRole('button', { name: '创建商品视觉项目' }).click();
  await page.getByLabel('项目名称').fill('新的商品视觉项目');
  await page.getByRole('button', { name: '进入项目工作台' }).dblclick({ delay: 10 });
  await expect.poll(() => createRequests).toBe(1);
  await expect(page).toHaveURL(`/artigen/projects/${projectId}`);
});

test('project page controls stay reachable at responsive boundary widths', async ({ page }) => {
  for (const viewport of [
    { width: 1200, height: 800 },
    { width: 1199, height: 800 },
    { width: 900, height: 800 },
    { width: 799, height: 700 },
    { width: 430, height: 844 },
    { width: 400, height: 844 },
    { width: 399, height: 844 },
    { width: 390, height: 844 },
    { width: 360, height: 667 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/artigen/projects');
    await expectProjectPageGeometry(page, viewport.width < 800);
    await page.getByRole('button', { name: viewport.width < 800 ? '打开导航菜单' : '创建商品视觉项目' }).click();
    if (viewport.width < 800) {
      await expect(page.locator('#artigen-mobile-nav')).toBeVisible();
      await page.getByRole('button', { name: '关闭导航菜单' }).click();
    } else {
      await expect(page.getByRole('heading', { name: '先写需求，确认生成时再登录' })).toBeVisible();
    }
  }
});

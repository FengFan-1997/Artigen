import path from 'node:path';
import { expect, test } from '@playwright/test';

const project = {
  projectId: '99999999-9999-4999-8999-999999999999',
  title: '秋季咖啡礼盒',
  status: 'active',
  productName: '山岚咖啡礼盒',
  brief: '为电商投放制作一套主视觉。',
  brandProfile: {
    brandName: '',
    colors: [],
    styleKeywords: [],
    prohibitedElements: [],
    logoAssetId: null
  },
  designMemory: {
    audience: '',
    goals: [],
    tone: [],
    visualKeywords: [],
    mustInclude: [],
    avoid: [],
    outputPreferences: { deliverables: [], aspectRatio: '', language: '' },
    factualConstraints: []
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

const phase = process.env.ARTIGEN_PROJECT_HERO_PHASE === 'before' ? 'before' : 'after';

test('project overview hero remains compact and usable at the configured viewport', async ({
  page
}, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile-390';
  const viewport = mobile
    ? { name: 'mobile-390', width: 390, height: 844 }
    : { name: 'desktop-1440', width: 1440, height: 960 };
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.addInitScript(() => {
    localStorage.setItem('app_lang', 'zh');
    localStorage.setItem('app_user_id', 'project-e2e-user');
    localStorage.setItem('agent_user_id', 'project-e2e-user');
  });
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        authenticated: true,
        userId: 'project-e2e-user',
        csrfToken: 'csrf-e2e'
      })
    })
  );
  await page.route('**/api/auth/google/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clientId: '' })
    })
  );
  await page.route('**/api/collection/event', (route) =>
    route.fulfill({ status: 202, body: '{}' })
  );
  await page.route('**/api/credits/balance*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, balance: 0 })
    })
  );
  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, projects: [project] })
    })
  );

  await page.goto('/artigen/projects');
  const hero = page.locator('.projects-hero');
  const action = hero.getByRole('button', { name: '创建商品视觉项目' });
  await expect(action).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '把一套商品素材，做成一组可投放视觉' })
  ).toBeVisible();

  const measurements = await hero.evaluate((root) => {
    const style = getComputedStyle(root);
    const title = root.querySelector('h1')!;
    const button = root.querySelector('button')!;
    return {
      backgroundImage: style.backgroundImage,
      borderWidth: style.borderWidth,
      borderRadius: style.borderRadius,
      headingFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      buttonHeight: button.getBoundingClientRect().height,
      pageOverflow: document.documentElement.scrollWidth > innerWidth
    };
  });

  if (phase === 'after') {
    expect(measurements.backgroundImage).toBe('none');
    expect(measurements.borderWidth).toBe('0px');
    expect(measurements.borderRadius).toBe(mobile ? '16px' : '18px');
    expect(measurements.headingFontSize).toBeLessThanOrEqual(mobile ? 32 : 42);
    expect(measurements.buttonHeight).toBe(44);
    expect(measurements.pageOverflow).toBe(false);
  }

  const screenshotPath = (state: string) =>
    path.resolve(
      process.cwd(),
      `../ui-review/project-hub-hero-surface-20261028/${phase}/${viewport.name}/${state}.png`
    );
  await page.screenshot({ path: screenshotPath('default'), animations: 'disabled' });
  await action.hover();
  await page.screenshot({ path: screenshotPath('hover'), animations: 'disabled' });
  await page.keyboard.press('Tab');
  for (
    let index = 0;
    index < 30 && !(await action.evaluate((element) => element === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(action).toBeFocused();
  await page.screenshot({ path: screenshotPath('keyboard-focus'), animations: 'disabled' });
});

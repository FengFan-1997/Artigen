import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installWorkspaceFixture, projectA } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

// The matrix owns its viewport/touch contexts and uses the installed Chrome audit channel.
test.beforeEach(({ browserName }) =>
  test.skip(
    browserName !== 'chromium',
    'This audit matrix targets Chromium; other engines need separate acceptance.'
  )
);

const route = `/artigen/agent/runs/${inputRunId}`;
const title = '这是一个用于检查长标题与真实工作量的项目名称_ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.repeat(5);
const sizes = [
  [320, 640],
  [360, 800],
  [390, 844],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 720],
  [1439, 900],
  [1440, 900],
  [1920, 1080],
  [2560, 960],
  [844, 390]
];
async function fixture(page: Page, theme = 'dark') {
  const data = await installWorkspaceFixture(page, theme);
  data.state.run.objectivePreview = title;
  for (let i = 0; i < 24; i++)
    data.workspace.files.push({
      ...data.workspace.files[0],
      id: `90000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      assetId: `91000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      url: `/api/assets/91000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      path: `docs/${String(i).padStart(2, '0')}-${title.slice(0, 85)}.md`
    });
  await page.route('**/api/workspace/projects/*/files/90000000-**', (r) => {
    const id = new URL(r.request().url()).pathname.split('/files/')[1].split('/')[0];
    const file = data.workspace.files.find((f) => f.id === id);
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        r.request().url().endsWith('/versions') ? { versions: [] } : { file, text: file?.text }
      )
    });
  });
  await page.route('**/api/workspace/navigation*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        projects: [{ projectId: projectA, title }],
        sessions: Array.from({ length: 120 }, (_, i) => ({
          id: `chat-${i}`,
          projectId: projectA,
          title: `${i} - ${title}`,
          kind: 'conversation',
          status: 'active',
          updatedAt: '2026-10-15T03:00:00Z'
        })),
        nextCursor: null
      })
    })
  );
  const text =
    '## 大工作量的审查记录\n\n' +
    ('长文案以及长链接 https://example.invalid/' + 'a'.repeat(100) + '\n\n') +
    '|' +
    Array.from({ length: 16 }, (_, i) => `长列表${i}`).join('|') +
    '|\n|' +
    Array(16).fill('---').join('|') +
    '|\n|' +
    Array(16).fill('需要保持表格局部滚动').join('|') +
    '|\n\n```js\nconst ' +
    'longVariable'.repeat(30) +
    ' = "' +
    'body'.repeat(100) +
    '";\n```\n';
  await page.route('**/api/agent-runs/*/messages*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        messages: Array.from({ length: 60 }, (_, i) => ({
          id: `stress-${i}`,
          role: i % 5 ? 'assistant' : 'user',
          kind: 'commentary',
          createdAt: `2026-10-15T03:${String(i).padStart(2, '0')}:00Z`,
          text
        })),
        nextCursor: null
      })
    })
  );
  return data;
}
async function resources(page: Page, mode = '文件') {
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '资源面板' });
  if ((page.viewportSize()?.width || 1440) < 1440 && !(await navigation.isVisible()))
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole('button', { name: mode, exact: true }).click();
}
async function openFiles(page: Page, files: Array<{ id: string }>) {
  for (const file of files) {
    await page.evaluate(
      (file) => window.dispatchEvent(new CustomEvent('workspace:open-file', { detail: file })),
      file
    );
    await expect(page.locator('.file-tab')).toHaveCount(files.indexOf(file) + 1);
  }
}
async function measure(page: Page) {
  return page.evaluate(() => {
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        !e.closest('[inert]')
      );
    };
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button,a,input,select,textarea,summary')
    ).filter(visible);
    const clipped = controls
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) return false;
        const x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)),
          y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2));
        return !e.contains(document.elementFromPoint(x, y));
      })
      .map((e) => ({
        name: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 50),
        class: e.className,
        rect: JSON.parse(JSON.stringify(e.getBoundingClientRect()))
      }));
    const small = controls
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      })
      .map((e) => ({
        name: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 45),
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height
      }));
    const unnamed = controls
      .filter(
        (e) =>
          e.tagName === 'BUTTON' &&
          !e.getAttribute('aria-label') &&
          !e.textContent?.trim() &&
          !e.getAttribute('title')
      )
      .map((e) => e.outerHTML.slice(0, 180));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      clipped,
      small,
      unnamed,
      viewport: [innerWidth, innerHeight],
      bodyHeight: document.documentElement.scrollHeight
    };
  });
}

test('stress matrix records multi-size routes, overlays, tabs and large payloads', async ({
  browser,
  baseURL
}) => {
  test.setTimeout(240000);
  const output = process.env.ARTIGEN_AUDIT_OUTPUT;
  const phase = process.env.ARTIGEN_AUDIT_PHASE || 'after';
  if (output) await mkdir(output, { recursive: true });
  const rows: unknown[] = [];
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1200,
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const data = await fixture(page, width === 820 ? 'light' : 'dark');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseURL + route);
    await expect(page.locator('.timeline-message').last()).toBeVisible();
    rows.push({
      route: 'run',
      state: 'long messages',
      width,
      height,
      ...(await measure(page)),
      errors
    });
    await resources(page);
    await expect(page.getByRole('complementary', { name: '文件目录' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
    await openFiles(page, data.workspace.files.slice(5, 17));
    rows.push({ route: 'run', state: '12 long tabs', width, height, ...(await measure(page)) });
    if (output && [320, 390, 768, 1024, 1440, 2560, 844].includes(width))
      await page.screenshot({
        path: `${output}/${width}x${height}-tabs-${phase}.jpg`,
        type: 'jpeg',
        quality: 65
      });
    await page.keyboard.press('Escape');
    if (width < 1440) await page.getByRole('button', { name: '打开历史', exact: true }).click();
    const first = page.getByRole('button', { name: `编辑会话 0 - ${title}`, exact: true });
    await first.click();
    const editor = page.locator('.session-editor');
    const box = await editor.boundingBox();
    rows.push({
      route: 'run',
      state: 'edit first of 120 chats',
      width,
      height,
      editorBox: box,
      ...(await measure(page))
    });
    if (output && [390, 1440].includes(width))
      await page.screenshot({
        path: `${output}/${width}x${height}-rename-${phase}.jpg`,
        type: 'jpeg',
        quality: 65
      });
    await context.close();
  }
  for (const pathname of ['/artigen/create', '/artigen/agent'])
    for (const [width, height] of [
      [320, 640],
      [844, 390],
      [1440, 900]
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      await fixture(page);
      await page.goto(baseURL + pathname);
      await expect(page.locator('.composer-box')).toBeVisible();
      await page.locator('.composer-box textarea').fill('比较详细的任务要求。\n'.repeat(100));
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles(
          Array.from({ length: 10 }, (_, i) => ({
            name: `${i}-${title.slice(0, 80)}.pdf`,
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 fixture')
          }))
        );
      if (phase !== 'before') {
        const composer = (await page.locator('.composer-box').boundingBox())!;
        const main = (await page.locator('.workspace-main').boundingBox())!;
        expect(composer.x + composer.width).toBeLessThanOrEqual(main.x + main.width + 1);
        await page.locator('.composer-box .send').scrollIntoViewIfNeeded();
        expect(await hit(page, '.composer-box .send')).toBe(true);
      }
      rows.push({
        route: pathname,
        state: '10 attachments and long input',
        width,
        height,
        ...(await measure(page)),
        composer: await page.locator('.composer-box').boundingBox()
      });
      if (output && [320, 844].includes(width))
        await page.screenshot({
          path: `${output}/${width}x${height}-${pathname.endsWith('create') ? 'create' : 'workbench'}-${phase}.jpg`,
          type: 'jpeg',
          quality: 65
        });
      await context.close();
    }
  if (output) await writeFile(`${output}/matrix-${phase}.json`, JSON.stringify(rows, null, 2));
  expect(rows.length).toBe(42);
  if (phase !== 'before')
    expect(rows.every((row) => !(row as { overflow: boolean }).overflow)).toBe(true);
});

async function hit(page: Page, selector: string) {
  return page.locator(selector).evaluate((e) => {
    const r = e.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return (
      r.left >= 0 &&
      r.top >= 0 &&
      r.right <= innerWidth + 1 &&
      r.bottom <= innerHeight + 1 &&
      !!target &&
      e.contains(target)
    );
  });
}

test('many tabs keep the active file and directory switch reachable with keyboard navigation', async ({
  page
}) => {
  const data = await fixture(page);
  await page.goto(route);
  await resources(page);
  await expect(page.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
  await openFiles(page, data.workspace.files.slice(5, 17));
  expect(await hit(page, '.tree-toggle')).toBe(true);
  expect(await hit(page, '.file-tab [aria-selected="true"]')).toBe(true);
  const selected = page.locator('.file-tab [aria-selected="true"]');
  await selected.focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab').last()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab').nth(10)).toBeFocused();
  await expect(page.getByRole('button', { name: /^下载 / })).toBeVisible();
  await resources(page, 'GitHub');
  await resources(page, '文件');
  expect(await hit(page, '.file-tab [aria-selected="true"]')).toBe(true);
  const close = page.locator('.file-tab.active button').last();
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.file-tab [aria-selected="true"]')).toBeFocused();
});

test('file links prefer the exact file id when several paths reference the same asset', async ({
  page
}) => {
  const data = await fixture(page);
  data.workspace.files[5].assetId = data.workspace.files[0].assetId;
  await page.goto(route);
  await resources(page);
  await expect(page.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
  await page.evaluate(
    (file) => window.dispatchEvent(new CustomEvent('workspace:open-file', { detail: file })),
    data.workspace.files[5]
  );
  await expect(page.locator('.breadcrumb')).toContainText(data.workspace.files[5].path);
});

test('editing a chat in a long project list immediately reveals and focuses its form', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto(route);
  await page.getByRole('button', { name: '打开历史', exact: true }).click();
  await page.getByRole('button', { name: `编辑会话 0 - ${title}`, exact: true }).click();
  await expect(page.locator('.session-editor input')).toBeFocused();
  expect(await hit(page, '.session-editor input')).toBe(true);
  await page.locator('.session-editor button').last().scrollIntoViewIfNeeded();
  expect(await hit(page, '.session-editor button:last-child')).toBe(true);
});

test('drawer focus, resize cancellation and clamped separator values remain accurate', async ({
  page
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(route);
  const opener = page.getByRole('button', { name: 'GitHub', exact: true });
  await opener.focus();
  await opener.click();
  await expect(
    page
      .getByRole('navigation', { name: '资源面板' })
      .getByRole('button', { name: '文件', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await resources(page);
  const separator = page.getByRole('separator', { name: '调整右栏宽度' });
  expect(Number(await separator.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(
    Number(await separator.getAttribute('aria-valuemax'))
  );
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + 4, 300);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveClass(/workspace-resizing/);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
  await expect(page.locator('body')).not.toHaveClass(/workspace-resizing/);
  await page.mouse.up();
});

test('editor syntax contrasts in both themes and wide tables retain readable cells', async ({
  browser,
  baseURL
}) => {
  const phase = process.env.ARTIGEN_AUDIT_PHASE || 'after';
  const output = process.env.ARTIGEN_AUDIT_OUTPUT;
  const findings = [];
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const data = await fixture(page, theme);
    const file = data.workspace.files[1];
    file.text =
      '/* A readable comment */\n.action { color: #b5df25; background: red; opacity: 0.5; }\n';
    file.byteSize = Buffer.byteLength(file.text);
    file.sha256 = createHash('sha256').update(file.text).digest('hex');
    await page.goto(baseURL + route);
    await resources(page);
    await expect(page.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
    await page.evaluate(
      (file) => window.dispatchEvent(new CustomEvent('workspace:open-file', { detail: file })),
      file
    );
    await expect(page.getByRole('textbox', { name: '文件编辑器' })).toBeVisible();
    const colors = await page.locator('.cm-content').evaluate((e) => {
      const lum = (rgb: string) => {
        const [r, g, b] = rgb
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return Array.from(e.querySelectorAll('span'))
        .filter((s) => s.textContent?.trim())
        .map((s) => {
          let p: Element | null = s;
          let bg = '';
          while (p) {
            bg = getComputedStyle(p).backgroundColor;
            if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break;
            p = p.parentElement;
          }
          const fg = getComputedStyle(s).color;
          const a = lum(fg),
            b = lum(bg);
          return {
            text: s.textContent,
            color: fg,
            background: bg,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          };
        });
    });
    findings.push({ theme, colors });
    if (output)
      await page.screenshot({
        path: `${output}/editor-${theme}-${phase}.jpg`,
        type: 'jpeg',
        quality: 65
      });
    if (phase !== 'before') {
      expect(colors.length).toBeGreaterThan(2);
      expect(colors.every((c) => c.ratio >= 4.5)).toBe(true);
    }
    const table = page.locator('.timeline-message table').last();
    if (phase !== 'before')
      expect(
        await table
          .locator('th')
          .first()
          .evaluate((e) => e.getBoundingClientRect().width)
      ).toBeGreaterThan(80);
    await context.close();
  }
  if (output)
    await writeFile(`${output}/contrast-${phase}.json`, JSON.stringify(findings, null, 2));
});

test('GitHub details replace a long record list and return keyboard focus', async ({ page }) => {
  const phase = process.env.ARTIGEN_AUDIT_PHASE || 'after';
  const output = process.env.ARTIGEN_AUDIT_OUTPUT;
  await page.setViewportSize({ width: 1024, height: 768 });
  await fixture(page);
  await page.route('**/github/pulls*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: Array.from({ length: 30 }, (_, i) => ({
          number: i + 1,
          title: `${i + 1} ${title}`,
          state: 'open',
          url: `https://github.com/example/repo/pull/${i + 1}`
        })),
        hasMore: false
      })
    })
  );
  await page.goto(route);
  await resources(page, 'GitHub');
  await page.locator('.git-record').first().click();
  await expect(page.locator('.github-workspace details').first()).toBeVisible();
  if (output) {
    await page.screenshot({
      path: `${output}/github-details-${phase}.jpg`,
      type: 'jpeg',
      quality: 65
    });
    await writeFile(
      `${output}/github-${phase}.json`,
      JSON.stringify(
        {
          recordCount: await page.locator('.git-record').count(),
          detailsBox: await page.locator('.github-workspace section').boundingBox()
        },
        null,
        2
      )
    );
  }
  if (phase !== 'before') {
    await expect(page.locator('.git-record')).toHaveCount(0);
    expect(await hit(page, '.github-workspace section header button')).toBe(true);
    await page.getByRole('button', { name: '返回记录', exact: true }).click();
    await expect(page.locator('.git-record').first()).toBeFocused();
  }
});

test('refreshing during an obsolete GitHub request never locks the unlinked repository form', async ({
  page
}) => {
  await fixture(page);
  let requested = false;
  await page.route('**/github/pulls*', async (r) => {
    requested = true;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], hasMore: false })
    });
  });
  await page.goto(route);
  await resources(page, 'GitHub');
  await expect.poll(() => requested).toBe(true);
  await page.route('**/api/workspace/projects/*/github', (r) =>
    r.fulfill({ contentType: 'application/json', body: '{"repository":null}' })
  );
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('button', { name: '关联仓库', exact: true })).toBeEnabled();
  await expect(page.locator('.github-workspace input')).toBeEnabled();
});

test('a short viewport keeps command actions and keyboard focus inside the dialog', async ({
  page
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 844, height: 320 });
  await page.goto(route);
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
  const last = page.locator('.command-palette button').last();
  await last.focus();
  expect(await hit(page, '.command-palette button:last-child')).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('searchbox', { name: '搜索页面或动作' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('250 files filter correctly and a 5000-line document remains virtualized and searchable', async ({
  page
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const data = await fixture(page);
  const large = data.workspace.files[5];
  large.path = 'docs/large-workspace.txt';
  large.text = Array.from(
    { length: 5000 },
    (_, i) =>
      `Line ${i} - ${i === 4999 ? 'needle-final-target-4999' : 'A real UTF-8 text fixture for editor scrolling.'}`
  ).join('\n');
  large.byteSize = Buffer.byteLength(large.text);
  large.sha256 = createHash('sha256').update(large.text).digest('hex');
  for (let i = 24; i < 250; i++)
    data.workspace.files.push({
      ...data.workspace.files[6],
      id: `90000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      path: `docs/archive-${i}.md`
    });
  await page.goto(route);
  await resources(page);
  await page.getByRole('textbox', { name: '筛选文件', exact: true }).fill('large-workspace');
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'large-workspace.txt', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件编辑器' });
  await expect(editor).toBeVisible();
  expect(await page.locator('.cm-line').count()).toBeLessThan(400);
  await editor.focus();
  await page.keyboard.press(
    (await page.evaluate(() => /Mac/.test(navigator.platform))) ? 'Meta+f' : 'Control+f'
  );
  const search = page.locator('.cm-search input[name="search"]');
  await expect(search).toBeVisible();
  // CodeMirror commits its search query on keyup/change, matching real typing.
  await search.pressSequentially('needle-final-target-4999');
  await search.press('Enter');
  await expect(page.locator('.cm-content')).toContainText('needle-final-target-4999');
  await search.press('Escape');
  await expect(editor).toBeFocused();
  await expect(search).toHaveCount(0);
});

test('coarse-pointer tablets retain 44px run and account controls', async ({
  browser,
  baseURL
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 768 },
    hasTouch: true
  });
  try {
    const page = await context.newPage();
    await fixture(page);
    await page.goto(route);
    await expect(page.locator('.workspace-topbar')).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const actions = page.locator('.run-controls button');
    expect(await actions.count()).toBeGreaterThan(0);
    for (const action of await actions.all())
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: '打开历史', exact: true }).click();
    for (const action of await page
      .locator('.workspace-account :is(button,.account-action)')
      .all()) {
      if (await action.isVisible())
        expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});

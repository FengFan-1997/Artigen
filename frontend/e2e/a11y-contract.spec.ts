import { expect, test, type Locator, type Page } from '@playwright/test';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABGklEQVR4nO3RsRXCMBBEQYcQ0AgN0H8PPMogdmZqMLa0sm6Cn9/tLLf7Y1OuJX1A9QAAqB0AALUDAKB2AADUDgCA2gEA0KfXZ9sdgMDovTGGAHhvz9M6e/jWENMBtBy/BQKAMAKAMASAMAIAANcHOIIAIIzQFWBdv7FGRQAAYC6AvQgAAAAAEEQAAAAAAAAAAAAAAAAAAAAAAAAAAABAh/EBAAAAIDg+AABzAfyzCYDg+ADC4wMAcH2Ao5sACA0PYIDxAYTHBxAcHkBw9JIAPf8EAAAAAAAAAAAAAAAAAAAAAAAYYGwAAwYAAAAAAAAAAAAAAAAAAGYGEIDhAgCgdgAA1A4AgNoBAFA7AABqBwBA7QAAqB0AALX7AcCitLp1NMT4AAAAAElFTkSuQmCC';

const pngBuffer = Buffer.from(PNG_BASE64, 'base64');

async function expectFocusInside(page: Page, container: Locator): Promise<void> {
  await expect.poll(async () => container.evaluate((node) => node.contains(document.activeElement))).toBe(true);
}

async function expectVisibleButtonsAtLeast44(container: Locator): Promise<void> {
  const tooSmall = await container.locator('button:visible').evaluateAll((buttons) =>
    buttons
      .map((button) => {
        const box = button.getBoundingClientRect();
        return { name: button.getAttribute('aria-label') || button.textContent?.trim() || '', width: box.width, height: box.height };
      })
      .filter((button) => button.width < 44 || button.height < 44)
  );
  expect(tooSmall).toEqual([]);
}

async function expandGenerationControlsIfNeeded(page: Page): Promise<void> {
  const toggle = page.locator('.generation-controls-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
    await toggle.click();
  }
}

test('format workflows expose keyboard buttons, a trapped dialog, labelled controls, and 44px actions', async ({ page }) => {
  await page.goto('/artigen/tools');
  const firstTool = page.locator('.tools-grid .tool-card').first();
  await expect(firstTool).toHaveJSProperty('tagName', 'BUTTON');
  await firstTool.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectFocusInside(page, dialog);
  await expectVisibleButtonsAtLeast44(dialog);

  await expect.poll(async () => dialog.locator('input, select, textarea').evaluateAll((controls) =>
    controls.filter((control) => {
      const input = control as HTMLInputElement;
      if (input.type === 'hidden' || input.disabled) return false;
      return !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby') && input.labels?.length === 0;
    }).length
  )).toBe(0);

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInside(page, dialog);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(firstTool).toBeFocused();
});

test('Editor 2.0 keeps closed mobile sheets inert and restores focus after sheets and export dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/image-workshop/image-editor?editor=v2');

  const emptyStageBox = await page.locator('.empty-stage').boundingBox();
  expect(emptyStageBox).not.toBeNull();
  expect(emptyStageBox!.x).toBeGreaterThanOrEqual(0);
  expect(emptyStageBox!.x + emptyStageBox!.width).toBeLessThanOrEqual(390);

  const layersPanel = page.locator('#editor-v2-layers-panel');
  const propertiesPanel = page.locator('#editor-v2-properties-panel');
  await expect(layersPanel).toHaveAttribute('inert', '');
  await expect(propertiesPanel).toHaveAttribute('inert', '');

  const propertiesButton = page.getByRole('button', { name: '打开属性面板' });
  await propertiesButton.focus();
  await page.keyboard.press('Enter');
  await expect(propertiesPanel).not.toHaveAttribute('inert', '');
  await expectFocusInside(page, propertiesPanel);
  await page.keyboard.press('Escape');
  await expect(propertiesPanel).toHaveAttribute('inert', '');
  await expect(propertiesButton).toBeFocused();

  await page.locator('.editor-v2 input[type="file"]').setInputFiles({
    name: 'a11y-fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  const exportButton = page.getByRole('button', { name: '导出', exact: true });
  // setInputFiles resolves after dispatching change, not after the editor's
  // asynchronous decode/IndexedDB import finishes. Wait until the imported
  // layer makes Export actionable so Enter cannot fall through to the
  // previously focused mobile-sheet trigger.
  await expect(exportButton).toBeEnabled();
  if ((await propertiesPanel.getAttribute('inert')) === null) {
    await propertiesPanel.getByRole('button', { name: '关闭面板' }).click();
    await expect(propertiesPanel).toHaveAttribute('inert', '');
    await expect(propertiesButton).toBeFocused();
  }
  await exportButton.focus();
  await page.keyboard.press('Enter');
  const exportDialog = page.getByRole('dialog', { name: '导出设计' });
  await expect(exportDialog).toBeVisible();
  await expectFocusInside(page, exportDialog);
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInside(page, exportDialog);
  }
  await page.keyboard.press('Escape');
  await expect(exportDialog).toHaveCount(0);
  await expect(exportButton).toBeFocused();
});

test('Editor 2.0 renders only the active mobile sheet at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/image-workshop/image-editor?editor=v2');

  const layersPanel = page.locator('#editor-v2-layers-panel');
  const propertiesPanel = page.locator('#editor-v2-properties-panel');

  await page.getByRole('button', { name: '打开图层面板' }).click();
  await expect(layersPanel).toBeVisible();
  await expect(propertiesPanel).toBeHidden();

  await layersPanel.getByRole('button', { name: '关闭面板' }).click();
  await page.getByRole('button', { name: '打开属性面板' }).click();
  await expect(propertiesPanel).toBeVisible();
  await expect(layersPanel).toBeHidden();
});

test('background positioning has a keyboard path and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/artigen/image-workshop/background');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectFocusInside(page, dialog);

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'background-fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  const stage = dialog.locator('.checkerboard');
  await expect(stage).toBeVisible();
  await stage.focus();
  const image = stage.locator('.cutout-img').first();
  const before = await image.getAttribute('style');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => image.getAttribute('style')).not.toBe(before);

  const transitionDurationMs = await dialog.locator('.mode-pill').evaluate((node) =>
    Math.max(...getComputedStyle(node).transitionDuration.split(',').map((value) => {
      const duration = value.trim();
      return Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    }))
  );
  expect(transitionDurationMs).toBeLessThanOrEqual(0.02);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('390px header controls meet the 44px touch target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen');
  await expectVisibleButtonsAtLeast44(page.locator('.titlebar'));
});

test('headers stay separated across compact laptop and mobile widths with language kept in the menu', async ({ page }) => {
  const widths = [320, 375, 414, 768, 1024, 1280, 1366];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 414 ? 844 : 900 });
    await page.goto('/artigen/tools');
    const header = page.locator('.titlebar .header');
    await expect(header).toBeVisible();

    const layout = await header.evaluate((node) => {
      const selectors = ['.logo', '.nav-toggle', '.nav-links', '.header-right'];
      const controls = selectors
        .map((selector) => {
          const element = node.querySelector<HTMLElement>(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) return null;
          return { selector, left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .sort((a, b) => a.left - b.left);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        controls,
        overlaps: controls.slice(1).filter((control, index) => control.left < controls[index].right - 1)
      };
    });

    expect(layout.documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      layout.viewportWidth + 1
    );
    expect(layout.overlaps, `header overlap at ${width}px: ${JSON.stringify(layout.controls)}`).toEqual([]);

    const navToggle = page.locator('.nav-toggle');
    if (width <= 1280) {
      await expect(navToggle).toBeVisible();
      await navToggle.click();
      const mobileMenu = page.locator('.mobile-menu');
      await expect(mobileMenu).toBeVisible();
      await expect(mobileMenu.locator('.mobile-language-option')).toHaveCount(2);
      await expectVisibleButtonsAtLeast44(mobileMenu);
      await navToggle.click();
    } else {
      await expect(navToggle).toBeHidden();
    }

    if (width <= 640) {
      await expect(page.locator('.login-label-compact')).toBeVisible();
      await expect(page.locator('.login-label-full')).toBeHidden();
    }
  }
});

test('AI mobile setup keeps references readable, grows long prompts, and stacks product fields', async ({ page }) => {
  for (const width of [320, 390, 414]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/artigen/ai');
    await expandGenerationControlsIfNeeded(page);

    const referenceList = page.locator('.generation-reference-list');
    await expect(referenceList).toBeVisible();
    const referenceLayout = await referenceList.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      slotWidths: Array.from(node.querySelectorAll<HTMLElement>('.generation-reference-slot')).map(
        (slot) => slot.getBoundingClientRect().width
      )
    }));
    expect(referenceLayout.scrollWidth).toBeGreaterThan(referenceLayout.clientWidth);
    expect(referenceLayout.slotWidths.every((slotWidth) => slotWidth >= 150)).toBe(true);

    const textarea = page.locator('textarea.textarea');
    await textarea.fill(
      'A long mobile product prompt with reflective packaging, bilingual label details, exact colors, clean shadows, and a clear shelf context. '.repeat(3)
    );
    const textareaHeight = await textarea.evaluate((node) => node.getBoundingClientRect().height);
    expect(textareaHeight).toBeGreaterThan(76);
    expect(textareaHeight).toBeLessThanOrEqual(132);
    await expectVisibleButtonsAtLeast44(page.locator('.input-toolbar'));
    const clippedToolbarButtons = await page.locator('.input-toolbar button:visible').evaluateAll(
      (buttons, viewportWidth) => buttons
        .map((button) => {
          const box = button.getBoundingClientRect();
          return { name: button.getAttribute('aria-label') || button.textContent?.trim() || '', left: box.left, right: box.right };
        })
        .filter((button) => button.left < 0 || button.right > Number(viewportWidth) + 0.5),
      width
    );
    expect(clippedToolbarButtons).toEqual([]);

    const productButton = page.locator('.toggle-btn').filter({ hasText: /Product|产品/ }).first();
    await productButton.click();
    const sidebar = page.locator('.side');
    await expect(sidebar).toBeVisible();
    const fields = sidebar.locator('.form-group .field');
    const firstBox = await fields.nth(0).boundingBox();
    const secondBox = await fields.nth(1).boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(secondBox!.y).toBeGreaterThanOrEqual(firstBox!.y + firstBox!.height - 1);
    await sidebar.locator('.side-close').click();
  }
});

test('AI tablet toolbar keeps touch targets at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/artigen/ai');
  await expectVisibleButtonsAtLeast44(page.locator('.input-toolbar'));
});

test('ingredient label remains usable and branded on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/image-workshop/ingredient-label');

  const dialog = page.locator('.ingredient-modal-container');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.tools-main-frame')).toBeVisible();
  const headerBox = await dialog.locator('.ingredient-modal-header').boundingBox();
  const firstControlBox = await dialog.locator('.select-trigger').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(firstControlBox).not.toBeNull();
  expect(firstControlBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  await expect(dialog.locator('.product-textarea')).toBeInViewport();
  await expect(dialog.locator('.preview-inner')).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', 'rgb(11, 13, 14)');
  await expectVisibleButtonsAtLeast44(dialog);
});

test('AI workspace starts with overlay sidebars closed in a narrow fine-pointer viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/ai');
  await expandGenerationControlsIfNeeded(page);

  const starterList = page.locator('.generation-template-row .generation-chip-list');
  await expect(starterList.locator('.generation-chip')).toHaveCount(6);
  await expect.poll(() => starterList.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect(page.locator('.right-side')).toBeHidden();
  await expect(page.locator('.mobile-overlay')).toHaveCount(0);
  await expect(page.locator('main.main')).toBeVisible();
  await expect(page.locator('.chat-footer')).toBeInViewport();
});

test('AI authentication dialog traps focus and restores it to the generation action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/generation/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        models: [
          {
            id: 'standard-v1',
            name: { zh: '标准生成', en: 'Standard generation' },
            available: true,
            capabilities: ['text-to-image', 'image-reference'],
            maxReferences: 3,
            aspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
            supportsSeed: true
          }
        ]
      })
    })
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'AUTH_REQUIRED' })
    })
  );
  await page.goto('/artigen/ai');
  await expandGenerationControlsIfNeeded(page);

  await page.locator('.generation-chip').first().click();
  const sendButton = page.locator('.send-btn');
  await sendButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', {
    name: /请选择登录方式|Choose a sign-in method/
  });
  await expect(dialog).toBeVisible();
  await expectFocusInside(page, dialog);
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index % 3 === 0 ? 'Shift+Tab' : 'Tab');
    await expectFocusInside(page, dialog);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(sendButton).toBeFocused();
});

import { expect, type Page } from '@playwright/test';

type GeometryOptions = {
  mobile?: boolean;
};

export const installDevEnvironmentBadge = async (page: Page) => page.evaluate(() => {
  if (document.querySelector('.dev-environment-badge')) return;
  const badge = document.createElement('div');
  badge.className = 'dev-environment-badge';
  badge.textContent = 'DEV 测试环境';
  badge.setAttribute('role', 'status');
  document.body.prepend(badge);
});

export const expectWorkspaceGeometry = async (page: Page, options: GeometryOptions = {}) => {
  const report = await page.locator('.agent-workspace-shell').evaluate((root, mobile) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const visible = (element: Element | null): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.closest('[inert], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const box = (element: Element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };
    const contentBox = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const value = range.getBoundingClientRect();
      return value.width > 0 && value.height > 0
        ? {
          left: value.left,
          right: value.right,
          top: value.top,
          bottom: value.bottom,
          width: value.width,
          height: value.height
        }
        : box(element);
    };
    const intersects = (first: ReturnType<typeof box>, second: ReturnType<typeof box>) => (
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.5 &&
      Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.5
    );
    const chromeSelectors = [
      '.workspace-topbar',
      '.conversation-dock',
      '.objective-composer',
      '.docked-composer',
      '.docked-composer .composer-box',
      '.message-composer',
      '.workspace-zero',
      '.inspector-head',
      '.inspector-tabs',
      '.workspace-account'
    ];
    const clipped = chromeSelectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .filter(visible)
      .map((element) => ({ selector: element.className, rect: box(element) }))
      .filter(({ rect }) => (
        rect.left < -0.75 || rect.top < -0.75 || rect.right > viewport.width + 0.75 || rect.bottom > viewport.height + 0.75
      ));

    const topbarHeading = root.querySelector('.topbar-heading-slot');
    const topbarActions = root.querySelector('.topbar-actions');
    const topbarCollision = visible(topbarHeading) && visible(topbarActions)
      ? box(topbarHeading).right > box(topbarActions).left + 0.75
      : false;
    const defaultHeadingText = root.querySelector('.task-heading > strong');
    const topbarTextDrift = visible(topbarHeading) && visible(defaultHeadingText)
      ? (mobile
        ? Math.abs((contentBox(defaultHeadingText).left + contentBox(defaultHeadingText).width / 2) - (box(topbarHeading).left + box(topbarHeading).width / 2)) > 1
        : Math.abs(contentBox(defaultHeadingText).left - box(topbarHeading).left) > 1)
        ? [{ mode: mobile ? 'center' : 'left', slot: box(topbarHeading), text: contentBox(defaultHeadingText) }]
        : []
      : [];

    const environmentBadge = document.querySelector('.dev-environment-badge');
    const environmentBadgeOverlaps = visible(environmentBadge)
      ? Array.from(root.querySelectorAll([
        '.task-heading > strong',
        '.task-heading > span',
        '.conversation-heading strong',
        '.conversation-heading small',
        '.topbar-actions > *',
        '.mobile-panel-controls > *',
        '.inspector-head button'
      ].join(',')))
        .filter(visible)
        .filter((element) => intersects(box(environmentBadge), contentBox(element)))
        .map((element) => ({
          target: element.className || element.tagName.toLowerCase(),
          badge: box(environmentBadge),
          element: contentBox(element)
        }))
      : [];

    const main = root.querySelector('.workspace-main');
    const dock = root.querySelector('.conversation-dock,.docked-composer,.message-composer');
    const dockOutsideMain = visible(main) && visible(dock)
      ? box(dock).left < box(main).left - 0.75 || box(dock).right > box(main).right + 0.75
      : false;

    const tabBadgeOverlaps = Array.from(root.querySelectorAll('.inspector-tabs button')).flatMap((tab) => {
      const badge = tab.querySelector('i');
      const icon = tab.querySelector('svg');
      return visible(badge) && visible(icon) && intersects(box(badge), box(icon))
        ? [{ tab: tab.textContent?.trim() || '', badge: box(badge), icon: box(icon) }]
        : [];
    });

    const closedDrawersWithoutInert = Array.from(root.querySelectorAll('.workspace-left[aria-hidden="true"],.workspace-right[aria-hidden="true"]'))
      .filter((element) => !element.hasAttribute('inert'))
      .map((element) => element.className);

    const workspaceIcons = Array.from(root.querySelectorAll<SVGElement>('.workspace-icon')).filter(visible);
    const distortedIcons = workspaceIcons.flatMap((icon) => {
      const rect = box(icon);
      const expected = Number.parseFloat(getComputedStyle(icon).getPropertyValue('--workspace-icon-size'));
      return Math.abs(rect.width - rect.height) > 0.5 || (Number.isFinite(expected) && (Math.abs(rect.width - expected) > 0.5 || Math.abs(rect.height - expected) > 0.5))
        ? [{ name: icon.innerHTML.slice(0, 48), expected, rect }]
        : [];
    });

    const offCenterIconButtons = Array.from(root.querySelectorAll<HTMLElement>('button')).flatMap((button) => {
      const icon = button.querySelector('.workspace-icon');
      if (!visible(button) || !visible(icon) || button.textContent?.trim()) return [];
      const control = box(button);
      const glyph = box(icon);
      const deltaX = (glyph.left + glyph.width / 2) - (control.left + control.width / 2);
      const deltaY = (glyph.top + glyph.height / 2) - (control.top + control.height / 2);
      return Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5
        ? [{ label: button.getAttribute('aria-label') || button.className, deltaX, deltaY, control, glyph }]
        : [];
    });

    const iconLabelMisalignment = Array.from(root.querySelectorAll<HTMLElement>('.new-task,.workspace-nav a,.workspace-account button,.attach-control,.quiet-action')).flatMap((control) => {
      const icon = control.querySelector('.workspace-icon');
      const label = control.querySelector(':scope > span:not(.account-icon),:scope > .account-label');
      if (!visible(control) || !visible(icon) || !visible(label)) return [];
      const glyph = box(icon);
      const text = contentBox(label);
      const deltaY = (glyph.top + glyph.height / 2) - (text.top + text.height / 2);
      return Math.abs(deltaY) > 1
        ? [{ label: label.textContent?.trim() || control.className, deltaY, glyph, text }]
        : [];
    });

    const axisPairs = [
      ['.conversation-empty', '.objective-composer'],
      ['.conversation-thread', '.objective-composer'],
      ['.message', '.docked-composer .composer-box']
    ] as const;
    const contentAxisDrift = axisPairs.flatMap(([contentSelector, composerSelector]) => {
      const content = root.querySelector(contentSelector);
      const composer = root.querySelector(composerSelector);
      if (!visible(content) || !visible(composer)) return [];
      const contentRect = box(content);
      const composerRect = box(composer);
      const leftDelta = contentRect.left - composerRect.left;
      const rightDelta = contentRect.right - composerRect.right;
      return Math.abs(leftDelta) > 1 || Math.abs(rightDelta) > 1
        ? [{ contentSelector, composerSelector, leftDelta, rightDelta, content: contentRect, composer: composerRect }]
        : [];
    });

    const resizableTextareas = Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea'))
      .filter(visible)
      .filter((textarea) => getComputedStyle(textarea).resize !== 'none')
      .map((textarea) => textarea.name || textarea.className || 'textarea');

    const paddedIconActions = Array.from(root.querySelectorAll<HTMLElement>('.send,.send-action,.message-composer button[type="submit"]'))
      .filter(visible)
      .flatMap((button) => {
        const style = getComputedStyle(button);
        const padding = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat);
        return padding.some((value) => value > 0.1)
          ? [{ label: button.getAttribute('aria-label') || button.className, padding }]
          : [];
      });

    const undersizedTouchTargets = mobile
      ? Array.from(root.querySelectorAll([
        '.workspace-topbar button',
        '.conversation-dock button',
        '.docked-composer button',
        '.clarification button',
        '.approval-actions button',
        '.workspace-notice button',
        '.inspector-tabs button',
        '.workspace-left button',
        '.workspace-right button'
      ].join(',')))
        .filter(visible)
        .map((element) => ({ label: element.getAttribute('aria-label') || element.textContent?.trim() || element.className, rect: box(element) }))
        .filter(({ rect }) => rect.width < 43.5 || rect.height < 43.5)
      : [];

    return {
      documentOverflow: document.documentElement.scrollWidth > viewport.width + 1,
      clipped,
      topbarCollision,
      topbarTextDrift,
      environmentBadgeOverlaps,
      dockOutsideMain,
      tabBadgeOverlaps,
      closedDrawersWithoutInert,
      distortedIcons,
      offCenterIconButtons,
      iconLabelMisalignment,
      contentAxisDrift,
      resizableTextareas,
      paddedIconActions,
      undersizedTouchTargets
    };
  }, Boolean(options.mobile));

  expect(report.documentOverflow, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.clipped, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.topbarCollision, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.topbarTextDrift, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.environmentBadgeOverlaps, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.dockOutsideMain, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.tabBadgeOverlaps, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.closedDrawersWithoutInert, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.distortedIcons, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.offCenterIconButtons, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.iconLabelMisalignment, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.contentAxisDrift, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.resizableTextareas, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.paddedIconActions, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.undersizedTouchTargets, JSON.stringify(report, null, 2)).toEqual([]);
};

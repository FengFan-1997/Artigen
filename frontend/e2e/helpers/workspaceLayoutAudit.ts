import { expect, type Page } from '@playwright/test';

type GeometryOptions = {
  mobile?: boolean;
};

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

    const environmentBadge = document.querySelector('.dev-environment-badge');
    const environmentBadgeOverlaps = visible(environmentBadge)
      ? Array.from(root.querySelectorAll([
        '.task-heading > strong',
        '.task-heading > span',
        '.conversation-heading strong',
        '.conversation-heading small',
        '.topbar-actions > *',
        '.mobile-panel-controls > *'
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
      environmentBadgeOverlaps,
      dockOutsideMain,
      tabBadgeOverlaps,
      closedDrawersWithoutInert,
      undersizedTouchTargets
    };
  }, Boolean(options.mobile));

  expect(report.documentOverflow, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.clipped, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.topbarCollision, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.environmentBadgeOverlaps, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.dockOutsideMain, JSON.stringify(report, null, 2)).toBe(false);
  expect(report.tabBadgeOverlaps, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.closedDrawersWithoutInert, JSON.stringify(report, null, 2)).toEqual([]);
  expect(report.undersizedTouchTargets, JSON.stringify(report, null, 2)).toEqual([]);
};

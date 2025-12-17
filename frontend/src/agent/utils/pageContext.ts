// Helper to clean text
const cleanText = (text: string | null): string => {
  return text?.replace(/\s+/g, ' ').trim() || '';
};

// Helper to check if element is truly visible
const isVisible = (el: HTMLElement): boolean => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return (
    el.offsetParent !== null &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0 &&
    el.getBoundingClientRect().height > 0
  );
};

// Helper to generate a unique-ish selector
const getSelector = (el: HTMLElement): string => {
  if (el.id) return `#${el.id}`;

  // Try to find a unique class
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(' ').filter(
      (c) =>
        !c.startsWith('router-link') &&
        !c.startsWith('hover:') &&
        !c.startsWith('focus:') &&
        c.length > 2 // Skip short utility-like classes
    );

    if (classes.length > 0 && classes.length < 5) {
      // Use the first meaningful class
      return `.${classes[0]}`;
    }
  }

  // Fallback to tag + text strategy (Backend knows to use text: prefix)
  const text = cleanText(el.innerText).substring(0, 20);
  if (text) return `text:${text}`;

  return el.tagName.toLowerCase();
};

export interface PageElement {
  tag: string;
  text: string;
  selector: string;
  role?: string;
  type?: string;
  placeholder?: string;
  inViewport: boolean;
}

export const getPageContext = (): PageElement[] => {
  const elements: PageElement[] = [];

  // 1. Interactive Elements + Headings
  const interactive = document.querySelectorAll(
    'button, a, input, textarea, select, [role="button"], h1, h2, h3, h4, .clickable'
  );

  interactive.forEach((node) => {
    const el = node as HTMLElement;

    if (!isVisible(el)) return;

    const text = cleanText(el.innerText);
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    const ariaLabel = el.getAttribute('aria-label');
    const placeholder = (el as HTMLInputElement).placeholder;

    if (!text && !isInput && !ariaLabel && !placeholder) return;

    // Check if in viewport
    const rect = el.getBoundingClientRect();
    const inViewport =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);

    elements.push({
      tag: el.tagName.toLowerCase(),
      text: text || ariaLabel || '',
      selector: getSelector(el),
      role: el.getAttribute('role') || undefined,
      type: (el as HTMLInputElement).type,
      placeholder: placeholder,
      inViewport
    });
  });

  // Prioritize viewport elements, then others
  elements.sort((a, b) => (a.inViewport === b.inViewport ? 0 : a.inViewport ? -1 : 1));

  // Limit to save tokens (Top 50 is usually enough for immediate context)
  return elements.slice(0, 50);
};

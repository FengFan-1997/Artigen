/**
 * Find the first visible element containing the specified text.
 * Uses XPath to search for text nodes.
 */
export const findByText = (text: string): HTMLElement | null => {
  // 1. Exact match on text content
  const xpathExact = `//*[text()='${text}']`;
  const resultExact = document.evaluate(
    xpathExact,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  if (resultExact.singleNodeValue) return resultExact.singleNodeValue as HTMLElement;

  // 2. Contains text
  const xpathContains = `//*[contains(text(), '${text}')]`;
  const resultContains = document.evaluate(
    xpathContains,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return resultContains.singleNodeValue as HTMLElement;
};

/**
 * Resolve a target string to an HTMLElement.
 * Handles 'text:' prefix.
 */
export const resolveTarget = (target: string): HTMLElement | null => {
  if (!target) return null;

  if (target.startsWith('text:')) {
    const text = target.replace('text:', '').trim();
    return findByText(text);
  }

  try {
    return document.querySelector(target) as HTMLElement;
  } catch (e) {
    console.warn('Invalid selector:', target);
    return null;
  }
};

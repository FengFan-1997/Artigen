export const MAX_PDF_EXPORT_PAGES = 50;

type PdfPageRangeOptions = {
  maxPages?: number;
  defaultLimit?: number;
};

export const parsePdfPageRange = (
  raw: string,
  totalPages: number,
  options: PdfPageRangeOptions = {}
) => {
  const total = Math.floor(Number(totalPages));
  if (!Number.isFinite(total) || total < 1) throw new Error('PDF_PAGE_RANGE_INVALID');

  const maxPages = Math.max(
    1,
    Math.min(MAX_PDF_EXPORT_PAGES, Math.floor(options.maxPages || MAX_PDF_EXPORT_PAGES))
  );
  const expression = String(raw || '').trim();
  if (!expression) {
    const defaultLimit = Math.max(
      1,
      Math.min(maxPages, total, Math.floor(options.defaultLimit || maxPages))
    );
    return Array.from({ length: defaultLimit }, (_value, index) => index + 1);
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  const append = (page: number) => {
    if (!Number.isInteger(page) || page < 1 || page > total) {
      throw new Error('PDF_PAGE_RANGE_INVALID');
    }
    if (seen.has(page)) return;
    if (pages.length >= maxPages) throw new Error('PDF_PAGE_RANGE_TOO_LARGE');
    seen.add(page);
    pages.push(page);
  };

  const tokens = expression.split(',').map((token) => token.trim());
  if (!tokens.length || tokens.some((token) => !token)) {
    throw new Error('PDF_PAGE_RANGE_INVALID');
  }

  for (const token of tokens) {
    const single = /^(\d+)$/.exec(token);
    if (single) {
      append(Number(single[1]));
      continue;
    }

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (!range) throw new Error('PDF_PAGE_RANGE_INVALID');
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start > end) throw new Error('PDF_PAGE_RANGE_INVALID');
    for (let page = start; page <= end; page += 1) append(page);
  }

  if (!pages.length) throw new Error('PDF_PAGE_RANGE_INVALID');
  return pages;
};

export const formatPdfPageSelection = (pages: number[]) => {
  if (!pages.length) return 'pages';
  if (pages.length === 1) return `p${pages[0]}`;
  const consecutive = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  return consecutive ? `p${pages[0]}-${pages[pages.length - 1]}` : `p${pages.join('-')}`;
};

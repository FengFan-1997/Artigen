const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const allowedTitles = new Set([
  'SOURCE TEXT',
  'INGREDIENTS',
  'ACTIVE INGREDIENTS',
  'INACTIVE INGREDIENTS',
  'PURPOSE',
  'USES',
  'WARNINGS',
  'DIRECTIONS',
  'OTHER INFORMATION',
  'SERVING INFORMATION',
  'SUPPLEMENT FACTS TABLE',
  'NUTRITION FACTS',
  'CONTAINS',
  'MAY CONTAIN',
  'MANUFACTURER',
  'NET CONTENT',
  'NDC',
  'LOT NUMBER',
  'EXPIRATION DATE'
]);

const collect = (value: unknown, output: string[]) => {
  if (typeof value === 'string' || typeof value === 'number') {
    if (String(value).trim()) output.push(String(value).trim());
  } else if (Array.isArray(value)) {
    value.forEach((item) => collect(item, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collect(item, output));
  }
};

const inSource = (source: string, value: string) => {
  const normalized = normalize(value);
  if (!normalized || source.includes(normalized)) return true;
  const pieces = normalized
    .split(/[,;；，\n•▪‣]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  return pieces.length > 1 && pieces.every((piece) => source.includes(piece));
};

export const validateIngredientSourceTrace = (output: unknown, sourceText: string) => {
  const source = normalize(sourceText);
  if (!source || !output || typeof output !== 'object') return false;
  const sections = (output as { sections?: unknown }).sections;
  if (!Array.isArray(sections) || !sections.length) return false;
  return sections.every((section) => {
    if (!section || typeof section !== 'object') return false;
    const typed = section as { title?: unknown; content?: unknown };
    const title = String(typed.title || '').trim();
    if (!allowedTitles.has(title.toUpperCase()) && !inSource(source, title)) return false;
    const values: string[] = [];
    collect(typed.content, values);
    return values.length > 0 && values.every((value) => inSource(source, value));
  });
};

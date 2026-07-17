const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const ALLOWED_SECTION_TITLES = new Set([
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

const collectContentScalars = (value, output) => {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectContentScalars(item, output));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectContentScalars(item, output));
  }
};

const sourceContains = (source, rawValue) => {
  const value = normalize(rawValue);
  if (!value) return true;
  if (source.includes(value)) return true;
  const pieces = value
    .split(/[,;；，\n•▪‣]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  return pieces.length > 1 && pieces.every((piece) => source.includes(piece));
};

const validateIngredientOutputTrace = (parsed, sourceText) => {
  const source = normalize(sourceText);
  if (!source) return { ok: false, code: 'INGREDIENT_SOURCE_REQUIRED', invented: [] };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
    return { ok: false, code: 'INVALID_INGREDIENT_OUTPUT', invented: [] };
  }

  const invented = [];
  for (const section of parsed.sections) {
    if (!section || typeof section !== 'object') {
      invented.push('[invalid section]');
      continue;
    }
    const title = String(section.title || '').trim().toUpperCase();
    if (!ALLOWED_SECTION_TITLES.has(title) && !sourceContains(source, title)) {
      invented.push(String(section.title || '').slice(0, 120));
    }
    const values = [];
    collectContentScalars(section.content, values);
    for (const value of values) {
      if (!sourceContains(source, value)) invented.push(value.slice(0, 120));
    }
  }

  return invented.length
    ? { ok: false, code: 'INGREDIENT_SOURCE_MISMATCH', invented: invented.slice(0, 12) }
    : { ok: true, invented: [] };
};

const buildIngredientLabelPrompt = (input) => {
  const source = String(input?.userText || '').trim().slice(0, 8000);
  const productType = String(input?.productType || 'Food').trim().slice(0, 80);
  return [
    'You organize user-supplied label text. You are not a compliance, medical, nutrition, or legal authority.',
    'Hard rule: every scalar value inside sections[].content MUST be copied verbatim from one contiguous span of SOURCE TEXT.',
    'Never infer, expand, translate, normalize, paraphrase, calculate, or add ingredients, allergens, quantities, percentages, claims, warnings, directions, manufacturer details, addresses, identifiers, dates, or regulatory content.',
    'Omit a section when its content is absent from SOURCE TEXT. Product type is only a layout hint and is not a factual source.',
    'Allowed layoutType values: standard, drug_facts, supplement_facts, nutrition_facts.',
    'Allowed section titles: SOURCE TEXT, INGREDIENTS, ACTIVE INGREDIENTS, INACTIVE INGREDIENTS, PURPOSE, USES, WARNINGS, DIRECTIONS, OTHER INFORMATION, SERVING INFORMATION, SUPPLEMENT FACTS TABLE, NUTRITION FACTS, CONTAINS, MAY CONTAIN, MANUFACTURER, NET CONTENT, NDC, LOT NUMBER, EXPIRATION DATE.',
    'Return only JSON in this shape: {"layoutType":"standard","sections":[{"title":"INGREDIENTS","content":["exact source span"]}]}',
    `Layout hint: ${productType}`,
    `SOURCE TEXT:\n${source}`
  ].join('\n\n');
};

module.exports = { buildIngredientLabelPrompt, validateIngredientOutputTrace };

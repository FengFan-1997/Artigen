const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const qualitySet = require('../evaluation/ai-design-quality-set.json');

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const loadManifest = (filePath, label) => {
  if (!filePath) throw new Error(`${label.toUpperCase()}_MANIFEST_REQUIRED`);
  const absolute = path.resolve(process.cwd(), filePath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const byCase = new Map();
  for (const item of items) {
    const caseId = String(item?.caseId || '').trim();
    const assetId = String(item?.assetId || '').trim();
    if (!caseId || !assetId || byCase.has(caseId)) continue;
    byCase.set(caseId, { assetId });
  }
  return {
    runId: String(parsed?.runId || label).trim().slice(0, 120),
    profileVersion: String(parsed?.profileVersion || '').trim().slice(0, 120),
    items: byCase
  };
};

const baseline = loadManifest(readFlag('--baseline'), 'baseline');
const candidate = loadManifest(readFlag('--candidate'), 'candidate');
const outputPath = readFlag('--out');
if (!outputPath) throw new Error('OUTPUT_PATH_REQUIRED');

const cases = qualitySet.cases.map((entry) => {
  const baselineItem = baseline.items.get(entry.id);
  const candidateItem = candidate.items.get(entry.id);
  if (!baselineItem || !candidateItem) throw new Error(`MISSING_CASE_OUTPUT:${entry.id}`);
  const candidateFirst = crypto
    .createHash('sha256')
    .update(`${baseline.runId}\0${candidate.runId}\0${entry.id}`)
    .digest()[0] % 2 === 0;
  const left = candidateFirst ? candidateItem : baselineItem;
  const right = candidateFirst ? baselineItem : candidateItem;
  return {
    caseId: entry.id,
    locale: entry.locale,
    category: entry.category,
    aspectRatio: entry.aspectRatio,
    hardConstraints: entry.hardConstraints,
    manualCriteria: entry.manualCriteria,
    leftAssetId: left.assetId,
    rightAssetId: right.assetId,
    review: {
      hardConstraintsPassLeft: null,
      hardConstraintsPassRight: null,
      preferred: null,
      leftScore: null,
      rightScore: null
    }
  };
});

const output = {
  version: 1,
  qualitySet: qualitySet.name,
  createdAt: new Date().toISOString(),
  baseline: { runId: baseline.runId, profileVersion: baseline.profileVersion },
  candidate: { runId: candidate.runId, profileVersion: candidate.profileVersion },
  cases
};

const target = path.resolve(process.cwd(), outputPath);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
console.log(`Created blind review sheet for ${cases.length} cases: ${target}`);

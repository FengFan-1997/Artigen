const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { writeEncryptedEvidence } = require('./live-eval-evidence');

const IMAGE_SCENARIOS = new Set(['text-to-image', 'reference-image']);
const REVIEW_CRITERIA = Object.freeze([
  'composition',
  'visualHierarchy',
  'styleConsistency',
  'requirementFit',
  'visibleDefects'
]);

const anonymousCode = (seed, value) => crypto
  .createHash('sha256')
  .update(`${seed}\0${value}`)
  .digest('hex')
  .slice(0, 12);

const emptyScores = () => Object.fromEntries(REVIEW_CRITERIA.map((criterion) => [criterion, null]));

const reviewDefinition = (review) => ({
  version: Number(review?.version || 0),
  cases: (Array.isArray(review?.cases) ? review.cases : []).map((entry) => ({
    scenarioId: String(entry?.scenarioId || ''),
    criteria: Array.isArray(entry?.criteria) ? entry.criteria.map(String) : [],
    left: (Array.isArray(entry?.left) ? entry.left : []).map((asset) => ({
      assetCode: String(asset?.assetCode || ''),
      mimeType: String(asset?.mimeType || ''),
      byteSize: Number(asset?.byteSize || 0)
    })),
    right: (Array.isArray(entry?.right) ? entry.right : []).map((asset) => ({
      assetCode: String(asset?.assetCode || ''),
      mimeType: String(asset?.mimeType || ''),
      byteSize: Number(asset?.byteSize || 0)
    }))
  }))
});

const reviewDefinitionSha256 = (review) => crypto.createHash('sha256')
  .update(JSON.stringify(reviewDefinition(review)), 'utf8')
  .digest('hex');

const buildBlindReviewBundle = async ({
  results,
  reportDir,
  keyMaterial,
  seed = crypto.randomBytes(32).toString('hex')
} = {}) => {
  const safeResults = Array.isArray(results) ? results : [];
  const requestedDir = String(reportDir || '').trim();
  if (!requestedDir) throw new TypeError('AGENT_LIVE_EVAL_BLIND_REVIEW_DIR_REQUIRED');
  const targetDir = path.resolve(requestedDir);
  const cases = [];
  const mapping = { version: 1, assets: {} };
  const seenArtifactIds = new Set();
  const seenDigests = new Set();

  for (const scenarioId of IMAGE_SCENARIOS) {
    const baselines = safeResults.filter((entry) => (
      entry.ok && entry.scenarioId === scenarioId && entry.cohort === 'v1'
    ));
    const candidates = safeResults.filter((entry) => (
      entry.ok && entry.scenarioId === scenarioId && entry.cohort === 'v2'
    ));
    if (baselines.length !== 1 || candidates.length !== 1) {
      throw new Error(`AGENT_LIVE_EVAL_BLIND_PAIR_INVALID:${scenarioId}`);
    }
    const [baseline] = baselines;
    const [candidate] = candidates;
    const candidateFirst = Number.parseInt(anonymousCode(seed, scenarioId).slice(0, 2), 16) % 2 === 0;
    const ordered = candidateFirst
      ? [['left', candidate], ['right', baseline]]
      : [['left', baseline], ['right', candidate]];
    const sides = {};
    for (const [side, result] of ordered) {
      const images = (result.artifacts || [])
        .filter((artifact) => /^image\/(?:png|jpeg|webp)$/.test(String(artifact.mimeType || '')))
        .sort((left, right) => String(left.sha256).localeCompare(String(right.sha256)));
      if (images.length !== 3) {
        throw new Error(`AGENT_LIVE_EVAL_BLIND_ASSETS_INVALID:${scenarioId}:${side}`);
      }
      sides[side] = images.map((artifact, index) => {
        if (
          !artifact.artifactId ||
          !/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || '')) ||
          !artifact.evidenceFile ||
          seenArtifactIds.has(String(artifact.artifactId)) ||
          seenDigests.has(String(artifact.sha256).toLowerCase())
        ) {
          throw new Error(`AGENT_LIVE_EVAL_BLIND_ASSET_DUPLICATE:${scenarioId}:${side}`);
        }
        seenArtifactIds.add(String(artifact.artifactId));
        seenDigests.add(String(artifact.sha256).toLowerCase());
        const assetCode = anonymousCode(seed, `${scenarioId}\0${side}\0${index}\0${artifact.sha256}`);
        mapping.assets[assetCode] = {
          scenarioId,
          cohort: result.cohort,
          artifactId: artifact.artifactId,
          evidenceFile: artifact.evidenceFile,
          mimeType: artifact.mimeType,
          sha256: artifact.sha256
        };
        return {
          assetCode,
          mimeType: artifact.mimeType,
          byteSize: Number(artifact.byteSize || 0)
        };
      });
    }
    cases.push({
      scenarioId,
      left: sides.left,
      right: sides.right,
      criteria: REVIEW_CRITERIA,
      review: {
        hardConstraintsPassLeft: null,
        hardConstraintsPassRight: null,
        leftScores: emptyScores(),
        rightScores: emptyScores(),
        preferred: null,
        notes: ''
      }
    });
  }

  if (cases.length !== IMAGE_SCENARIOS.size || Object.keys(mapping.assets).length !== 12) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_MATRIX_INCOMPLETE');
  }
  await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 });
  const publicPath = path.join(targetDir, 'blind-review.json');
  const publicReview = {
    version: 1,
    createdAt: new Date().toISOString(),
    instructions: 'Review left and right without attempting to identify their runtime version. Score every criterion from 1 to 5.',
    scale: [1, 2, 3, 4, 5],
    cases
  };
  mapping.definitionSha256 = reviewDefinitionSha256(publicReview);
  await fs.promises.writeFile(publicPath, `${JSON.stringify(publicReview, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx'
  });
  const encryptedMapping = await writeEncryptedEvidence({
    privateDir: path.join(targetDir, 'private'),
    filename: 'blind-review-mapping.json',
    buffer: Buffer.from(JSON.stringify(mapping), 'utf8'),
    keyMaterial,
    associatedData: { kind: 'agent-live-eval-blind-review-mapping', version: 1 }
  });
  return {
    publicPath,
    encryptedMappingPath: encryptedMapping.path,
    caseCount: cases.length,
    definitionSha256: mapping.definitionSha256
  };
};

module.exports = {
  IMAGE_SCENARIOS,
  REVIEW_CRITERIA,
  buildBlindReviewBundle,
  reviewDefinition,
  reviewDefinitionSha256
};

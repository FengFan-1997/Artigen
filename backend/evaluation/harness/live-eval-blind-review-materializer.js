const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const { decryptEvidence } = require('./live-eval-evidence');
const {
  IMAGE_SCENARIOS,
  reviewDefinitionSha256
} = require('./live-eval-blind-review');

const IMAGE_FORMATS = Object.freeze({
  'image/jpeg': { extension: '.jpg', sharpFormats: new Set(['jpeg']) },
  'image/png': { extension: '.png', sharpFormats: new Set(['png']) },
  'image/webp': { extension: '.webp', sharpFormats: new Set(['webp']) }
});

const assertContainedFile = ({ directory, filename }) => {
  const base = path.resolve(String(directory || ''));
  const name = String(filename || '');
  if (!name || path.basename(name) !== name) {
    throw new TypeError('AGENT_LIVE_EVAL_BLIND_ASSET_PATH_INVALID');
  }
  const target = path.resolve(base, name);
  if (path.dirname(target) !== base) {
    throw new TypeError('AGENT_LIVE_EVAL_BLIND_ASSET_PATH_INVALID');
  }
  return target;
};

const collectReviewAssets = (review) => {
  const assets = new Map();
  for (const reviewCase of Array.isArray(review?.cases) ? review.cases : []) {
    for (const side of ['left', 'right']) {
      for (const asset of Array.isArray(reviewCase?.[side]) ? reviewCase[side] : []) {
        const assetCode = String(asset?.assetCode || '');
        if (!/^[a-f0-9]{12}$/.test(assetCode) || assets.has(assetCode)) {
          throw new TypeError('AGENT_LIVE_EVAL_BLIND_ASSET_CODE_INVALID');
        }
        assets.set(assetCode, asset);
      }
    }
  }
  if (!assets.size) throw new TypeError('AGENT_LIVE_EVAL_BLIND_ASSETS_REQUIRED');
  return assets;
};

const materializeBlindReviewAssets = async ({
  review,
  mapping,
  privateDir,
  keyMaterial
} = {}) => {
  const assets = collectReviewAssets(review);
  const mappingAssets = mapping?.assets && typeof mapping.assets === 'object'
    ? mapping.assets
    : {};
  const scenarioIds = (Array.isArray(review?.cases) ? review.cases : [])
    .map((entry) => String(entry?.scenarioId || ''));
  if (
    assets.size !== 12 ||
    Object.keys(mappingAssets).length !== 12 ||
    new Set(scenarioIds).size !== IMAGE_SCENARIOS.size ||
    scenarioIds.some((scenarioId) => !IMAGE_SCENARIOS.has(scenarioId)) ||
    mapping?.definitionSha256 !== reviewDefinitionSha256(review)
  ) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_MAPPING_MISMATCH');
  }
  const evidenceDir = path.resolve(String(privateDir || ''));
  if (
    !String(privateDir || '').trim() ||
    path.basename(evidenceDir) !== 'private' ||
    !path.basename(path.dirname(evidenceDir)).startsWith('agent-live-eval-')
  ) {
    throw new TypeError('AGENT_LIVE_EVAL_BLIND_PRIVATE_DIR_INVALID');
  }
  const targetDir = path.join(evidenceDir, 'blind-review-assets');
  await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 });

  const previewByCode = new Map();
  for (const [assetCode, publicAsset] of assets) {
    const privateAsset = mappingAssets[assetCode];
    const format = IMAGE_FORMATS[String(privateAsset?.mimeType || '')];
    const reviewCase = review.cases.find((entry) => (
      [...(entry.left || []), ...(entry.right || [])].some((asset) => asset.assetCode === assetCode)
    ));
    if (
      !privateAsset ||
      !format ||
      privateAsset.mimeType !== publicAsset.mimeType ||
      privateAsset.scenarioId !== reviewCase?.scenarioId
    ) {
      throw new Error('AGENT_LIVE_EVAL_BLIND_MAPPING_MISMATCH');
    }
    const evidencePath = assertContainedFile({
      directory: privateDir,
      filename: privateAsset.evidenceFile
    });
    const envelope = JSON.parse(await fs.promises.readFile(evidencePath, 'utf8'));
    const plaintext = decryptEvidence({ envelope, keyMaterial });
    const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
    if (digest !== privateAsset.sha256 || plaintext.length !== Number(publicAsset.byteSize)) {
      throw new Error('AGENT_LIVE_EVAL_BLIND_ASSET_DIGEST_MISMATCH');
    }
    const metadata = await sharp(plaintext, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata();
    if (
      !format.sharpFormats.has(String(metadata.format || '')) ||
      !Number.isInteger(metadata.width) ||
      !Number.isInteger(metadata.height) ||
      metadata.width < 1 ||
      metadata.height < 1
    ) {
      throw new Error('AGENT_LIVE_EVAL_BLIND_ASSET_IMAGE_INVALID');
    }
    const filename = `${assetCode}${format.extension}`;
    const outputPath = assertContainedFile({ directory: targetDir, filename });
    await fs.promises.writeFile(outputPath, plaintext, { mode: 0o600, flag: 'wx' });
    previewByCode.set(assetCode, {
      localFile: filename,
      width: metadata.width,
      height: metadata.height
    });
  }

  const localReview = JSON.parse(JSON.stringify(review));
  localReview.instructions = `${String(localReview.instructions || '').trim()} Open only the anonymous localFile assets; do not inspect encrypted mapping data.`.trim();
  for (const reviewCase of localReview.cases) {
    for (const side of ['left', 'right']) {
      reviewCase[side] = reviewCase[side].map((asset) => ({
        ...asset,
        ...previewByCode.get(asset.assetCode)
      }));
    }
  }
  const reviewPath = path.join(targetDir, 'blind-review-local.json');
  await fs.promises.writeFile(reviewPath, `${JSON.stringify(localReview, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx'
  });
  return {
    outputDir: targetDir,
    reviewPath,
    assetCount: assets.size
  };
};

module.exports = {
  IMAGE_FORMATS,
  materializeBlindReviewAssets
};

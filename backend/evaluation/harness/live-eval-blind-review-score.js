const {
  IMAGE_SCENARIOS,
  REVIEW_CRITERIA,
  reviewDefinitionSha256
} = require('./live-eval-blind-review');

const sideCohort = (assets, mapping, caseId, side, seenCodes) => {
  if (!Array.isArray(assets) || assets.length !== 3) {
    throw new Error(`AGENT_LIVE_EVAL_BLIND_ASSETS_INVALID:${caseId}:${side}`);
  }
  const cohorts = new Set(assets.map((asset) => {
    const code = String(asset?.assetCode || '');
    const mapped = mapping.assets?.[code];
    if (
      !/^[a-f0-9]{12}$/.test(code) ||
      seenCodes.has(code) ||
      mapped?.scenarioId !== caseId ||
      mapped?.mimeType !== asset.mimeType ||
      !/^[a-f0-9]{64}$/i.test(String(mapped?.sha256 || ''))
    ) {
      throw new Error(`AGENT_LIVE_EVAL_BLIND_MAPPING_INVALID:${caseId}:${side}`);
    }
    seenCodes.add(code);
    return mapped.cohort;
  }));
  if (cohorts.size !== 1 || !['v1', 'v2'].includes([...cohorts][0])) {
    throw new Error(`AGENT_LIVE_EVAL_BLIND_MAPPING_INVALID:${caseId}:${side}`);
  }
  return [...cohorts][0];
};

const validatedScores = (value, caseId, side) => REVIEW_CRITERIA.map((criterion) => {
  const score = Number(value?.[criterion]);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(`AGENT_LIVE_EVAL_BLIND_SCORE_INCOMPLETE:${caseId}:${side}:${criterion}`);
  }
  return score;
});

const scoreLiveBlindReview = ({ review, mapping } = {}) => {
  if (!review || !Array.isArray(review.cases) || review.cases.length !== 2) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_CASES_INVALID');
  }
  if (!mapping || typeof mapping.assets !== 'object') {
    throw new Error('AGENT_LIVE_EVAL_BLIND_MAPPING_INVALID');
  }
  const scenarioIds = review.cases.map((entry) => String(entry?.scenarioId || ''));
  if (
    new Set(scenarioIds).size !== IMAGE_SCENARIOS.size ||
    scenarioIds.some((scenarioId) => !IMAGE_SCENARIOS.has(scenarioId)) ||
    Object.keys(mapping.assets).length !== 12 ||
    mapping.definitionSha256 !== reviewDefinitionSha256(review)
  ) {
    throw new Error('AGENT_LIVE_EVAL_BLIND_DEFINITION_MISMATCH');
  }
  const seenCodes = new Set();
  let candidateScore = 0;
  let baselineScore = 0;
  let candidateHardPasses = 0;
  let baselineHardPasses = 0;
  let candidateWins = 0;
  let baselineWins = 0;
  let ties = 0;
  for (const entry of review.cases) {
    const caseId = String(entry?.scenarioId || 'missing');
    const leftCohort = sideCohort(entry.left, mapping, caseId, 'left', seenCodes);
    const rightCohort = sideCohort(entry.right, mapping, caseId, 'right', seenCodes);
    if (leftCohort === rightCohort) {
      throw new Error(`AGENT_LIVE_EVAL_BLIND_PAIR_INVALID:${caseId}`);
    }
    const result = entry.review || {};
    if (
      typeof result.hardConstraintsPassLeft !== 'boolean' ||
      typeof result.hardConstraintsPassRight !== 'boolean' ||
      !['left', 'right', 'tie'].includes(result.preferred)
    ) {
      throw new Error(`AGENT_LIVE_EVAL_BLIND_REVIEW_INCOMPLETE:${caseId}`);
    }
    const leftScores = validatedScores(result.leftScores, caseId, 'left');
    const rightScores = validatedScores(result.rightScores, caseId, 'right');
    const candidateLeft = leftCohort === 'v2';
    candidateScore += (candidateLeft ? leftScores : rightScores).reduce((sum, score) => sum + score, 0);
    baselineScore += (candidateLeft ? rightScores : leftScores).reduce((sum, score) => sum + score, 0);
    candidateHardPasses += Number(
      candidateLeft ? result.hardConstraintsPassLeft : result.hardConstraintsPassRight
    );
    baselineHardPasses += Number(
      candidateLeft ? result.hardConstraintsPassRight : result.hardConstraintsPassLeft
    );
    if (result.preferred === 'tie') ties += 1;
    else if ((result.preferred === 'left') === candidateLeft) candidateWins += 1;
    else baselineWins += 1;
  }
  const caseCount = review.cases.length;
  if (seenCodes.size !== 12) throw new Error('AGENT_LIVE_EVAL_BLIND_MAPPING_INCOMPLETE');
  const scoreCount = caseCount * REVIEW_CRITERIA.length;
  const candidateAverageScore = candidateScore / scoreCount;
  const baselineAverageScore = baselineScore / scoreCount;
  const candidateHardConstraintPassRate = candidateHardPasses / caseCount;
  const baselineHardConstraintPassRate = baselineHardPasses / caseCount;
  const passed = candidateHardConstraintPassRate === 1 &&
    candidateAverageScore >= 4 &&
    candidateAverageScore >= baselineAverageScore &&
    candidateWins >= baselineWins;
  return {
    version: 'agent-live-eval-blind-score-v1',
    definitionSha256: mapping.definitionSha256,
    cases: caseCount,
    criteriaPerCase: REVIEW_CRITERIA.length,
    candidateAverageScore,
    baselineAverageScore,
    candidateHardConstraintPassRate,
    baselineHardConstraintPassRate,
    candidateWins,
    baselineWins,
    ties,
    passed
  };
};

module.exports = { scoreLiveBlindReview };

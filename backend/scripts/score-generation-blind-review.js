const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const qualitySet = require('../evaluation/ai-design-quality-set.json');

const candidateIsLeft = ({ baselineRunId, candidateRunId, caseId }) => crypto
  .createHash('sha256')
  .update(`${baselineRunId}\0${candidateRunId}\0${caseId}`)
  .digest()[0] % 2 === 0;

const scoreReview = (review) => {
  if (!review || !Array.isArray(review.cases) || review.cases.length !== qualitySet.cases.length) {
    throw new Error('INVALID_REVIEW_CASES');
  }
  const expectedIds = new Set(qualitySet.cases.map((entry) => entry.id));
  const baselineRunId = String(review.baseline?.runId || '').trim();
  const candidateRunId = String(review.candidate?.runId || '').trim();
  if (!baselineRunId || !candidateRunId) throw new Error('INVALID_REVIEW_RUNS');

  let candidateHardPasses = 0;
  let baselineHardPasses = 0;
  let candidateScore = 0;
  let baselineScore = 0;
  let candidateWins = 0;
  let baselineWins = 0;
  let ties = 0;

  for (const entry of review.cases) {
    const caseId = String(entry?.caseId || '').trim();
    if (!expectedIds.delete(caseId)) throw new Error(`INVALID_REVIEW_CASE:${caseId || 'missing'}`);
    const result = entry?.review || {};
    if (
      typeof result.hardConstraintsPassLeft !== 'boolean' ||
      typeof result.hardConstraintsPassRight !== 'boolean'
    ) {
      throw new Error(`INCOMPLETE_HARD_CONSTRAINT_REVIEW:${caseId}`);
    }
    if (!['left', 'right', 'tie'].includes(result.preferred)) {
      throw new Error(`INCOMPLETE_PREFERENCE_REVIEW:${caseId}`);
    }
    const leftScore = Number(result.leftScore);
    const rightScore = Number(result.rightScore);
    if (
      !Number.isInteger(leftScore) || leftScore < 1 || leftScore > 5 ||
      !Number.isInteger(rightScore) || rightScore < 1 || rightScore > 5
    ) {
      throw new Error(`INCOMPLETE_SCORE_REVIEW:${caseId}`);
    }

    const isCandidateLeft = candidateIsLeft({ baselineRunId, candidateRunId, caseId });
    candidateHardPasses += Number(
      isCandidateLeft ? result.hardConstraintsPassLeft : result.hardConstraintsPassRight
    );
    baselineHardPasses += Number(
      isCandidateLeft ? result.hardConstraintsPassRight : result.hardConstraintsPassLeft
    );
    candidateScore += isCandidateLeft ? leftScore : rightScore;
    baselineScore += isCandidateLeft ? rightScore : leftScore;
    if (result.preferred === 'tie') ties += 1;
    else if ((result.preferred === 'left') === isCandidateLeft) candidateWins += 1;
    else baselineWins += 1;
  }
  if (expectedIds.size) throw new Error('MISSING_REVIEW_CASES');

  const count = review.cases.length;
  const minimumPassRate = Number(qualitySet.policy?.minimumHardConstraintPassRate || 0.9);
  const candidateHardConstraintPassRate = candidateHardPasses / count;
  const baselineHardConstraintPassRate = baselineHardPasses / count;
  const candidateAverageScore = candidateScore / count;
  const baselineAverageScore = baselineScore / count;
  const hardConstraintsPassed = candidateHardConstraintPassRate >= minimumPassRate;
  const notWorseThanBaseline =
    candidateAverageScore >= baselineAverageScore && candidateWins >= baselineWins;

  return {
    cases: count,
    minimumHardConstraintPassRate: minimumPassRate,
    candidateHardConstraintPassRate,
    baselineHardConstraintPassRate,
    candidateAverageScore,
    baselineAverageScore,
    candidateWins,
    baselineWins,
    ties,
    hardConstraintsPassed,
    notWorseThanBaseline,
    passed: hardConstraintsPassed && notWorseThanBaseline
  };
};

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

if (require.main === module) {
  const reviewPath = readFlag('--review');
  if (!reviewPath) throw new Error('REVIEW_PATH_REQUIRED');
  const review = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), reviewPath), 'utf8'));
  const result = scoreReview(review);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  const outputPath = readFlag('--out');
  if (outputPath) fs.writeFileSync(path.resolve(process.cwd(), outputPath), output, { flag: 'wx' });
  process.stdout.write(output);
  if (!result.passed) process.exitCode = 1;
}

module.exports = { candidateIsLeft, scoreReview };

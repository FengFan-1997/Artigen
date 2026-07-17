const assert = require('node:assert/strict');
const test = require('node:test');

const qualitySet = require('../evaluation/ai-design-quality-set.json');
const { candidateIsLeft, scoreReview } = require('../scripts/score-generation-blind-review');

const completeReview = ({ candidateScore = 5, baselineScore = 4, candidatePass = true } = {}) => ({
  baseline: { runId: 'legacy-baseline' },
  candidate: { runId: 'task-v2-candidate' },
  cases: qualitySet.cases.map((entry) => {
    const candidateLeft = candidateIsLeft({
      baselineRunId: 'legacy-baseline',
      candidateRunId: 'task-v2-candidate',
      caseId: entry.id
    });
    return {
      caseId: entry.id,
      review: {
        hardConstraintsPassLeft: candidateLeft ? candidatePass : true,
        hardConstraintsPassRight: candidateLeft ? true : candidatePass,
        preferred: candidateScore === baselineScore ? 'tie' : candidateLeft ? 'left' : 'right',
        leftScore: candidateLeft ? candidateScore : baselineScore,
        rightScore: candidateLeft ? baselineScore : candidateScore
      }
    };
  })
});

test('blind review gate requires 90% hard constraints and a candidate not worse than baseline', () => {
  const result = scoreReview(completeReview());
  assert.equal(result.cases, 30);
  assert.equal(result.candidateHardConstraintPassRate, 1);
  assert.equal(result.candidateWins, 30);
  assert.equal(result.passed, true);

  const failed = scoreReview(completeReview({ candidateScore: 2, baselineScore: 4, candidatePass: false }));
  assert.equal(failed.hardConstraintsPassed, false);
  assert.equal(failed.notWorseThanBaseline, false);
  assert.equal(failed.passed, false);
});

test('blind review gate fails closed on incomplete human review fields', () => {
  const review = completeReview();
  review.cases[0].review.preferred = null;
  assert.throws(() => scoreReview(review), /INCOMPLETE_PREFERENCE_REVIEW/);
});

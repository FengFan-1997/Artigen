const fs = require('fs');
const path = require('path');
const {
  evaluateAgentTrajectory
} = require('../services/agent-trajectory-evaluator');

const tracePath = process.argv[2];
if (!tracePath) {
  console.error('Usage: node scripts/score-agent-trajectory.js <trace.json>');
  process.exitCode = 2;
} else {
  const absolute = path.resolve(process.cwd(), tracePath);
  const trace = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const result = evaluateAgentTrajectory(trace);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

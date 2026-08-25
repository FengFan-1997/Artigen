const fs = require('fs');
const path = require('path');
const {
  compileQualityCase,
  validateCompiledQualityCase
} = require('../services/agent-quality-evaluation');

const datasetPath = path.resolve(__dirname, '../evaluation/agent-quality-set.json');
const manifest = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const tasks = Array.isArray(manifest?.cases) ? manifest.cases : [];
const deliverables = ['report', 'spreadsheet', 'presentation', 'website', 'image'];
const ids = new Set();
const errors = [];

if (manifest?.version !== 3 || manifest?.runtime !== 'agent-harness-v3') {
  errors.push('expected executable agent-harness-v3 quality manifest version 3');
}
if (tasks.length !== 50) {
  errors.push(`expected 50 tasks, received ${tasks.length}`);
}
for (const task of tasks) {
  if (!task?.id || ids.has(task.id)) errors.push(`duplicate or missing id: ${task?.id || '<empty>'}`);
  ids.add(task?.id);
  if (!['zh', 'en'].includes(task?.locale)) errors.push(`${task?.id}: invalid locale`);
  if (!deliverables.includes(task?.deliverable)) errors.push(`${task?.id}: invalid deliverable`);
  if (String(task?.objective || '').trim().length < 20) errors.push(`${task?.id}: objective too short`);
  if (!Array.isArray(task?.capabilities) || !task.capabilities.length) {
    errors.push(`${task?.id}: capabilities missing`);
  }
  if (!Array.isArray(task?.acceptance) || task.acceptance.length < 4) {
    errors.push(`${task?.id}: acceptance criteria incomplete`);
  }
  try {
    const compiled = compileQualityCase({
      manifest,
      task,
      evaluationDir: path.dirname(datasetPath)
    });
    for (const error of validateCompiledQualityCase(compiled)) {
      errors.push(`${task?.id}: ${error}`);
    }
  } catch (error) {
    errors.push(`${task?.id}: ${String(error?.message || error)}`);
  }
}
for (const deliverable of deliverables) {
  const count = tasks.filter((task) => task.deliverable === deliverable).length;
  if (count !== 10) errors.push(`${deliverable}: expected 10 tasks, received ${count}`);
}
if (!tasks.some((task) => task.acceptance.includes('prompt_injection_ignored'))) {
  errors.push('prompt-injection cases missing');
}
if (!tasks.some((task) => task.acceptance.includes('no_external_write'))) {
  errors.push('external-side-effect cases missing');
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    tasks: tasks.length,
    byDeliverable: Object.fromEntries(
      deliverables.map((deliverable) => [
        deliverable,
        tasks.filter((task) => task.deliverable === deliverable).length
      ])
    )
  }, null, 2));
}

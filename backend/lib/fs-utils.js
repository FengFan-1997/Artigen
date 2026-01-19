const path = require('path');
const fs = require('fs');

const resolveRepoRoot = () => {
  try {
    return path.resolve(__dirname, '../../');
  } catch {
    return path.resolve(__dirname, '../');
  }
};

const REPO_ROOT = resolveRepoRoot();

const isPathInside = (candidatePath, baseDir) => {
  try {
    const base = path.resolve(baseDir);
    const full = path.resolve(candidatePath);
    const rel = path.relative(base, full);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch {
    return false;
  }
};

const listFilesRecursively = (rootDir, predicate, options) => {
  const out = [];
  const maxFiles = typeof options?.maxFiles === 'number' ? Math.max(0, options.maxFiles) : 4000;
  const stack = [rootDir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
        stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (predicate && !predicate(full, ent)) continue;
      out.push(full);
      if (out.length >= maxFiles) return out;
    }
  }
  return out;
};

const readTextFileSafe = (filePath, maxBytes) => {
  try {
    const stat = fs.statSync(filePath);
    const limit = typeof maxBytes === 'number' ? Math.max(1024, maxBytes) : 512 * 1024;
    if (!stat || typeof stat.size !== 'number' || stat.size <= 0) return '';
    if (stat.size > limit) return '';
    const raw = fs.readFileSync(filePath, 'utf-8');
    return (raw || '').toString();
  } catch {
    return '';
  }
};

module.exports = {
  REPO_ROOT,
  resolveRepoRoot,
  isPathInside,
  listFilesRecursively,
  readTextFileSafe
};

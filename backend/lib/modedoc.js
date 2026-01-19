const fs = require('fs');
const path = require('path');

const MODEDOC_ROOT = path.resolve(__dirname, '../../doc/modeDoc');
let modeDocIndex = null;

const normalizeModeDocKey = (input) => {
  const s = (input ?? '').toString().trim().toLowerCase();
  if (!s) return '';
  return s.replace(/\.md$/i, '').replace(/[\s_-]+/g, '').replace(/[^\w\u4e00-\u9fa5]+/g, '');
};

const buildModeDocIndex = () => {
  if (modeDocIndex) return modeDocIndex;
  const zhMap = new Map();
  const enMap = new Map();

  const addKey = (map, rawKey, fullPath) => {
    const key = normalizeModeDocKey(rawKey);
    if (!key) return;
    const existing = map.get(key);
    if (existing) existing.push(fullPath);
    else map.set(key, [fullPath]);
  };

  const walk = (dir, map, rootDir) => {
    if (!dir || !fs.existsSync(dir)) return;
    const root = rootDir || dir;
    const stack = [dir];
    while (stack.length > 0) {
      const cur = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!ent.isFile()) continue;
        if (!/\.md$/i.test(ent.name)) continue;
        addKey(map, ent.name, full);
        const rel = path.relative(root, full);
        addKey(map, rel, full);
        const relNoExt = rel.replace(/\.md$/i, '');
        addKey(map, relNoExt, full);
      }
    }
  };

  const zhRoot = path.join(MODEDOC_ROOT, 'modeldoc');
  const enRoot = path.join(MODEDOC_ROOT, 'modeldoc_en');
  walk(zhRoot, zhMap, zhRoot);
  walk(enRoot, enMap, enRoot);
  modeDocIndex = { zh: zhMap, en: enMap };
  return modeDocIndex;
};

const readModeDoc = ({ lang, keys }) => {
  const idx = buildModeDocIndex();
  const map = lang === 'en' ? idx.en : idx.zh;
  const visited = new Set();
  const results = [];

  const tryKey = (k) => {
    const norm = normalizeModeDocKey(k);
    if (!norm) return;
    const paths = map.get(norm);
    if (!paths) return;
    for (const p of paths) {
      if (visited.has(p)) continue;
      visited.add(p);
      try {
        const content = fs.readFileSync(p, 'utf-8');
        results.push(content);
      } catch {}
    }
  };

  if (Array.isArray(keys)) {
    for (const k of keys) tryKey(k);
  } else if (typeof keys === 'string') {
    tryKey(keys);
  }

  return results;
};

module.exports = {
  MODEDOC_ROOT,
  buildModeDocIndex,
  readModeDoc
};

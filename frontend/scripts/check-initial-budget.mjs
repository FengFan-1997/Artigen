import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const initialAssets = new Set();

for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"[^>]*>/gi)) {
  initialAssets.add(match[1].replace(/^\//, ''));
}

if (!initialAssets.size) throw new Error('INITIAL_JS_NOT_FOUND');

let gzipBytes = 0;
for (const asset of initialAssets) {
  const source = await readFile(path.join(dist, asset));
  gzipBytes += gzipSync(source).byteLength;
}

const budgetBytes = 250 * 1024;
if (gzipBytes > budgetBytes) {
  throw new Error(`INITIAL_JS_BUDGET_EXCEEDED ${gzipBytes} > ${budgetBytes}`);
}

const forbiddenPreloads = ['fabric-', 'pdf-', 'echarts-', 'gifenc'];
const preloads = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/gi)]
  .map((match) => match[1]);
for (const marker of forbiddenPreloads) {
  if (preloads.some((href) => href.includes(marker))) {
    throw new Error(`HEAVY_ROUTE_CHUNK_PRELOADED ${marker}`);
  }
}

console.log(`Initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KiB gzip / 250.0 KiB budget`);

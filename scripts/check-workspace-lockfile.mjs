import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedLockfile = 'pnpm-lock.yaml';
const lockfileNames = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
]);
const ignoredDirectories = new Set([
  '.git',
  '.pnpm-store',
  'node_modules',
  'coverage',
  'dist',
  'dist-ssr',
  'playwright-report',
  'test-results'
]);

const discovered = [];

const visit = async (directory, relativeDirectory = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await visit(path.join(directory, entry.name), relativePath);
      }
      continue;
    }
    if (entry.isFile() && lockfileNames.has(entry.name)) discovered.push(relativePath);
  }
};

await visit(workspaceRoot);
discovered.sort();

const unexpected = discovered.filter((candidate) => candidate !== allowedLockfile);
const hasRootLockfile = discovered.includes(allowedLockfile);

if (!hasRootLockfile || unexpected.length > 0) {
  console.error(`Workspace must contain exactly one lockfile: ${allowedLockfile}`);
  if (!hasRootLockfile) console.error(`Missing: ${allowedLockfile}`);
  for (const candidate of unexpected) console.error(`Unexpected: ${candidate}`);
  process.exitCode = 1;
} else {
  console.log(`Workspace lockfile policy passed: ${allowedLockfile}`);
}

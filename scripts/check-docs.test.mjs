import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { githubSlug, validateDocuments } from './check-docs.mjs'

function withFixture(files, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-docs-check-'))
  try {
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(root, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    return callback(root, Object.keys(files).filter((file) => /\.mdx?$/.test(file)))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('GitHub-style slugs preserve Chinese text and normalize punctuation', () => {
  assert.equal(githubSlug('当前状态：DEV / Production'), '当前状态dev-production')
})

test('accepts valid relative links, Chinese anchors and duplicate heading suffixes', () => {
  withFixture(
    {
      'README.md': '[第一节](./guide.md#当前状态)\n[第二节](./guide.md#当前状态-1)',
      'guide.md': '# 当前状态\n\n## 当前状态\n'
    },
    (root, files) => {
      assert.deepEqual(validateDocuments({ root, files, checkRepositoryPolicy: false }), [])
    }
  )
})

test('reports missing files and anchors', () => {
  withFixture(
    {
      'README.md': '[missing](./missing.md)\n[anchor](./guide.md#不存在)',
      'guide.md': '# 已存在'
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.some((issue) => issue.includes('missing relative target')))
      assert.ok(issues.some((issue) => issue.includes('missing GitHub-style anchor')))
    }
  )
})

test('reports duplicate documents', () => {
  withFixture(
    { 'one.md': '# Same\n', 'two.md': '# Same\n' },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.some((issue) => issue.includes('duplicates')))
    }
  )
})

test('reports file URLs, personal data and local machine paths', () => {
  withFixture(
    {
      'unsafe.md': [
        'file:///tmp/example',
        '/Users/example/project',
        '/home/example/project',
        '/root/private/project',
        'person@example.com',
        '123e4567-e89b-12d3-a456-426614174000',
        'dep-abcdefghijk'
      ].join('\n')
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.length >= 5)
    }
  )
})

test('reports Linux user home paths', () => {
  withFixture(
    {
      'home.md': '/home/example/project',
      'home-exact.md': '`/home/example`',
      'mac-exact.md': '`/Users/example`',
      'root.md': '/root/private/project',
      'root-exact.md': '/root'
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.some((issue) => issue.startsWith('home.md:')))
      assert.ok(issues.some((issue) => issue.startsWith('home-exact.md:')))
      assert.ok(issues.some((issue) => issue.startsWith('mac-exact.md:')))
      assert.ok(issues.some((issue) => issue.startsWith('root.md:')))
      assert.ok(issues.some((issue) => issue.startsWith('root-exact.md:')))
    }
  )
})

test('does not mistake a public URL path for a local home directory', () => {
  withFixture({ 'safe.md': 'https://example.com/home/example' }, (root, files) => {
    assert.deepEqual(validateDocuments({ root, files, checkRepositoryPolicy: false }), [])
  })
})

test('allows synthetic .invalid identities', () => {
  withFixture({ 'safe.md': 'smoke-user@dev.artigen.invalid' }, (root, files) => {
    assert.deepEqual(validateDocuments({ root, files, checkRepositoryPolicy: false }), [])
  })
})

test('requires archive warnings and prevents living docs from linking archives', () => {
  withFixture(
    {
      'README.md': '[old](./docs/archive/old.md)',
      'docs/archive/old.md': '# Old'
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.some((issue) => issue.includes('must not depend on archive')))
      assert.ok(issues.some((issue) => issue.includes('historical warning')))
    }
  )
})

test('requires the archive warning near the top of every archive file', () => {
  withFixture(
    {
      'docs/archive/README.md': '# Archive\n\nOld index\n\nMore text\n\n历史快照，不得用于当前部署或运维'
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: false })
      assert.ok(issues.some((issue) => issue.includes('historical warning')))
    }
  )
})

test('allows the documentation index to link a warned archive', () => {
  withFixture(
    {
      'docs/README.md': '[old](./archive/old.md)',
      'docs/archive/old.md': `> ${'历史快照，不得用于当前部署或运维'}\n`
    },
    (root, files) => {
      assert.deepEqual(validateDocuments({ root, files, checkRepositoryPolicy: false }), [])
    }
  )
})

test('repository policy reports direct dependencies missing from notices', () => {
  withFixture(
    {
      'package.json': JSON.stringify({ engines: { node: '24.x' }, packageManager: 'pnpm@10.33.0' }),
      'frontend/package.json': JSON.stringify({ dependencies: { vue: '^3.5.24', alpha: '1.0.0' } }),
      'backend/package.json': JSON.stringify({ dependencies: { beta: '1.0.0' } }),
      'mail-relay/package.json': JSON.stringify({ dependencies: {} }),
      'README.md': 'Node.js-24 pnpm-10 Vue-3',
      'README.en.md': 'Node.js-24 pnpm-10 Vue-3',
      'THIRD_PARTY_NOTICES.md': '| `alpha` | MIT | source |',
      'docs/README.md': '# Docs',
      'AGENT_BROWSER_SECURITY_MODEL.zh-CN.md': '# Security',
      'PROJECT_HANDOFF.zh-CN.md': '# Handoff',
      'PROJECT_OPERATIONS_GUIDE.zh-CN.md': '# Operations',
      'PRODUCTION_RUNBOOK.zh-CN.md': '# Production',
      'DEV_ENVIRONMENT_RUNBOOK.zh-CN.md': '# DEV',
      'AGENT_OPERATIONS_RUNBOOK.zh-CN.md': '# Agent',
      'PRD.md': '# PRD'
    },
    (root, files) => {
      const issues = validateDocuments({ root, files, checkRepositoryPolicy: true })
      assert.ok(issues.some((issue) => issue.includes('missing direct runtime dependency beta')))
    }
  )
})

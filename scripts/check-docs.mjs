import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ARCHIVE_WARNING = '历史快照，不得用于当前部署或运维'
const WORKSPACE_MANIFESTS = [
  'frontend/package.json',
  'backend/package.json',
  'mail-relay/package.json'
]
const RETIRED_DOC_PATHS = [
  'AGENT_BROWSER_SECURITY_AND_BETA_RELEASE.zh-CN.md',
  'ARTIGEN_AGENT_BETA_DELIVERY.zh-CN.md',
  'ARTIGEN_AGENT_BETA_RELEASE_RECEIPT.zh-CN.md',
  'ARTIGEN_AGENT_FULL_HANDOFF.zh-CN.md',
  'ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md',
  'OSS_FOUNDATION_UPGRADE.md',
  'frontend/docs/live2d-cubism-plan.md',
  'frontend/docs/my copy/agentImg_架构_功能_性能_全面优化方案_2026-01-21.md',
  'frontend/docs/my/agentImg_架构_功能_性能_全面优化方案_2026-01-21.md',
  'frontend/docs/my/svg_icon_清单_frontend-link_2026-01-22.md'
]

function normalizeRepoPath(value) {
  return value.split(path.sep).join('/')
}

function normalizeText(value) {
  return value.replace(/\r\n/g, '\n').trim()
}

function stripLinkTitle(value) {
  const trimmed = value.trim().replace(/^<|>$/g, '')
  const titleMatch = trimmed.match(/^(.*?)(?:\s+["'][^"']*["'])$/)
  return (titleMatch ? titleMatch[1] : trimmed).trim()
}

export function githubSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function collectAnchors(text) {
  const anchors = new Set()
  const counts = new Map()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match) continue
    const base = githubSlug(match[1])
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    anchors.add(seen === 0 ? base : `${base}-${seen}`)
  }
  return anchors
}

function extractLinkTargets(text) {
  const targets = []
  const markdownPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g
  const htmlPattern = /\b(?:href|src)=["']([^"']+)["']/gi
  for (const match of text.matchAll(markdownPattern)) targets.push(stripLinkTitle(match[1]))
  for (const match of text.matchAll(htmlPattern)) targets.push(match[1].trim())
  return targets
}

function isExternalTarget(target) {
  return /^(?:https?:|mailto:|data:|tel:)/i.test(target)
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function collectTrackedMarkdown(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md', '*.mdx'],
    {
    cwd: root
    }
  ).toString('utf8')
  return output.split('\0').filter(Boolean).map(normalizeRepoPath)
}

function validateLinks({ root, files, contents, anchors, issues }) {
  for (const file of files) {
    for (const rawTarget of extractLinkTargets(contents.get(file))) {
      const target = rawTarget.trim()
      if (!target || isExternalTarget(target)) continue
      if (/^file:/i.test(target)) continue

      const [rawPath, rawFragment = ''] = target.split('#', 2)
      const withoutQuery = rawPath.split('?', 1)[0]
      const decodedPath = safeDecode(withoutQuery)
      const targetFile = normalizeRepoPath(
        decodedPath
          ? path.relative(root, path.resolve(root, path.dirname(file), decodedPath))
          : file
      )

      if (decodedPath && !fs.existsSync(path.resolve(root, targetFile))) {
        issues.push(`${file}: missing relative target ${target}`)
        continue
      }

      if (
        targetFile.startsWith('docs/archive/') &&
        !file.startsWith('docs/archive/') &&
        file !== 'docs/README.md'
      ) {
        issues.push(`${file}: living documentation must not depend on archive ${target}`)
      }

      if (rawFragment && files.includes(targetFile)) {
        const fragment = safeDecode(rawFragment).toLowerCase()
        if (!anchors.get(targetFile)?.has(fragment)) {
          issues.push(`${file}: missing GitHub-style anchor ${target}`)
        }
      }
    }
  }
}

function validatePrivacy({ files, contents, issues }) {
  const checks = [
    ['file URL', /file:\/\//i],
    [
      'user home path',
      /(?<![A-Za-z0-9:])(?:\/Users\/[^/\s`]+|\/home\/[^/\s`]+|\/root)(?=\/|[\s`"'.,;:)\]}]|$)/
    ],
    ['Windows absolute path', /\b[A-Za-z]:[\\/]/],
    ['UUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i],
    ['Render resource ID', /\b(?:srv|dep)-[a-z0-9]{8,}\b/i],
    ['Vercel deployment ID', /\bdpl_[A-Za-z0-9]+\b/]
  ]
  const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi

  for (const file of files) {
    const text = contents.get(file)
    for (const [label, pattern] of checks) {
      if (pattern.test(text)) issues.push(`${file}: contains forbidden ${label}`)
    }
    for (const match of text.matchAll(emailPattern)) {
      if (!match[1].toLowerCase().endsWith('.invalid')) {
        issues.push(`${file}: contains a real-looking email address`)
        break
      }
    }
  }
}

function validateDuplicates({ files, contents, issues }) {
  const hashes = new Map()
  for (const file of files) {
    const hash = createHash('sha256').update(normalizeText(contents.get(file))).digest('hex')
    const existing = hashes.get(hash)
    if (existing) issues.push(`${file}: duplicates ${existing}`)
    else hashes.set(hash, file)
  }
}

function validateArchives({ files, contents, issues }) {
  for (const file of files) {
    if (file.startsWith('docs/archive/')) {
      const header = contents.get(file).split(/\r?\n/).slice(0, 5).join('\n')
      if (!header.includes(ARCHIVE_WARNING)) {
        issues.push(`${file}: archive is missing the required historical warning`)
      }
    }
  }
}

function validateRepositoryPolicy({ root, files, contents, issues }) {
  for (const retiredPath of RETIRED_DOC_PATHS) {
    if (fs.existsSync(path.join(root, retiredPath))) {
      issues.push(`${retiredPath}: retired document must be moved or consolidated`)
    }
  }

  const noticePath = 'THIRD_PARTY_NOTICES.md'
  const notice = contents.get(noticePath) ?? ''
  for (const manifestPath of WORKSPACE_MANIFESTS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'))
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!notice.includes(`| \`${dependency}\` |`)) {
        issues.push(`${noticePath}: missing direct runtime dependency ${dependency}`)
      }
    }
  }

  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const frontendManifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'))
  const nodeMajor = String(rootManifest.engines?.node ?? '').match(/\d+/)?.[0]
  const pnpmMajor = String(rootManifest.packageManager ?? '').match(/pnpm@(\d+)/)?.[1]
  const vueMajor = String(frontendManifest.dependencies?.vue ?? '').match(/\d+/)?.[0]
  for (const readmePath of ['README.md', 'README.en.md']) {
    const readme = contents.get(readmePath) ?? ''
    if (nodeMajor && !readme.includes(`Node.js-${nodeMajor}`)) {
      issues.push(`${readmePath}: Node.js badge does not match package.json`)
    }
    if (pnpmMajor && !readme.includes(`pnpm-${pnpmMajor}`)) {
      issues.push(`${readmePath}: pnpm badge does not match packageManager`)
    }
    if (vueMajor && !readme.includes(`Vue-${vueMajor}`)) {
      issues.push(`${readmePath}: Vue badge does not match frontend manifest`)
    }
  }

  const requiredLivingDocs = [
    'docs/README.md',
    'AGENT_BROWSER_SECURITY_MODEL.zh-CN.md',
    'PROJECT_HANDOFF.zh-CN.md',
    'PROJECT_OPERATIONS_GUIDE.zh-CN.md',
    'PRODUCTION_RUNBOOK.zh-CN.md',
    'DEV_ENVIRONMENT_RUNBOOK.zh-CN.md',
    'AGENT_OPERATIONS_RUNBOOK.zh-CN.md',
    'PRD.md'
  ]
  for (const requiredPath of requiredLivingDocs) {
    if (!files.includes(requiredPath)) issues.push(`${requiredPath}: required living document is missing`)
  }
}

export function validateDocuments({
  root = process.cwd(),
  files = null,
  checkRepositoryPolicy = true
} = {}) {
  const normalizedRoot = path.resolve(root)
  const markdownFiles = (files ?? collectTrackedMarkdown(normalizedRoot))
    .map(normalizeRepoPath)
    .filter((file) => fs.existsSync(path.join(normalizedRoot, file)))
    .sort()
  const issues = []
  const contents = new Map()
  const anchors = new Map()

  for (const file of markdownFiles) {
    const text = fs.readFileSync(path.join(normalizedRoot, file), 'utf8')
    contents.set(file, text)
    anchors.set(file, collectAnchors(text))
  }

  validateLinks({ root: normalizedRoot, files: markdownFiles, contents, anchors, issues })
  validatePrivacy({ files: markdownFiles, contents, issues })
  validateDuplicates({ files: markdownFiles, contents, issues })
  validateArchives({ files: markdownFiles, contents, issues })
  if (checkRepositoryPolicy) {
    validateRepositoryPolicy({ root: normalizedRoot, files: markdownFiles, contents, issues })
  }
  return issues
}

function runCli() {
  const issues = validateDocuments()
  if (issues.length > 0) {
    console.error(`Documentation checks failed with ${issues.length} issue(s):`)
    for (const issue of issues) console.error(`- ${issue}`)
    process.exitCode = 1
    return
  }
  console.log('Documentation checks passed.')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) runCli()

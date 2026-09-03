import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const UPDATED_PATTERN =
  /^- \[[xX]\] 本 PR 有持久影响，已更新 `PROJECT_HANDOFF\.zh-CN\.md`\s*$/m
const EXEMPT_PATTERN =
  /^- \[[xX]\] 本 PR 无需更新正式 Handoff，并已填写“不适用原因”\s*$/m

export function validateHandoffPolicy({ body = '', changedFiles = [] } = {}) {
  const issues = []
  const updated = UPDATED_PATTERN.test(body)
  const exempt = EXEMPT_PATTERN.test(body)

  if (updated === exempt) {
    issues.push('PR 必须且只能勾选一种正式 Handoff 处理方式。')
    return issues
  }

  const handoffChanged = changedFiles.includes('PROJECT_HANDOFF.zh-CN.md')
  if (updated && !handoffChanged) {
    issues.push('PR 声明已更新正式 Handoff，但 diff 中没有 PROJECT_HANDOFF.zh-CN.md。')
  }
  if (exempt && handoffChanged) {
    issues.push('PR 声明无需更新正式 Handoff，但 diff 中包含 PROJECT_HANDOFF.zh-CN.md。')
  }

  if (exempt) {
    const reasonMatch = body.match(/不适用原因：\s*\n([\s\S]*?)(?=\n##\s|$)/)
    const reason = reasonMatch?.[1]?.trim() ?? ''
    if (!reason || /^(?:-|无|不适用|n\/?a)$/i.test(reason)) {
      issues.push('勾选无需更新正式 Handoff 时，必须填写具体不适用原因。')
    }
  }

  return issues
}

function runCli() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.log('Handoff PR policy skipped outside GitHub pull_request events.')
    return
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  if (!event.pull_request) {
    console.log('Handoff PR policy skipped for non-pull-request event.')
    return
  }

  const baseSha = event.pull_request.base?.sha
  const headSha = event.pull_request.head?.sha
  if (!baseSha || !headSha) {
    console.error('PR event 缺少 base/head SHA，无法验证 Handoff 变更。')
    process.exitCode = 1
    return
  }

  const changedFiles = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseSha}...${headSha}`],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  const issues = validateHandoffPolicy({
    body: event.pull_request.body ?? '',
    changedFiles
  })
  if (issues.length > 0) {
    for (const issue of issues) console.error(issue)
    process.exitCode = 1
    return
  }

  console.log('Handoff PR policy passed.')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) runCli()

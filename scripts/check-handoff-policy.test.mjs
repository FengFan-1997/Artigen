import assert from 'node:assert/strict'
import test from 'node:test'
import { validateHandoffPolicy } from './check-handoff-policy.mjs'

const updatedBody =
  '- [x] 本 PR 有持久影响，已更新 `PROJECT_HANDOFF.zh-CN.md`\n\n不适用原因：\n'
const exemptBody =
  '- [x] 本 PR 无需更新正式 Handoff，并已填写“不适用原因”\n\n不适用原因：\n' +
  '只修正拼写，不改变持久行为。\n\n## 发布确认\n'

test('accepts an updated Handoff declaration when the file changed', () => {
  assert.deepEqual(
    validateHandoffPolicy({ body: updatedBody, changedFiles: ['PROJECT_HANDOFF.zh-CN.md'] }),
    []
  )
})

test('accepts a concrete exemption when the Handoff did not change', () => {
  assert.deepEqual(validateHandoffPolicy({ body: exemptBody, changedFiles: ['README.md'] }), [])
})

test('rejects missing or conflicting declarations', () => {
  assert.ok(validateHandoffPolicy({ body: '', changedFiles: [] }).length > 0)
  assert.ok(
    validateHandoffPolicy({
      body: `${updatedBody}${exemptBody}`,
      changedFiles: ['PROJECT_HANDOFF.zh-CN.md']
    }).length > 0
  )
})

test('rejects mismatched diffs and empty exemption reasons', () => {
  assert.ok(validateHandoffPolicy({ body: updatedBody, changedFiles: ['README.md'] }).length > 0)
  assert.ok(validateHandoffPolicy({ body: exemptBody, changedFiles: ['PROJECT_HANDOFF.zh-CN.md'] }).length > 0)
  assert.ok(
    validateHandoffPolicy({
      body:
        '- [x] 本 PR 无需更新正式 Handoff，并已填写“不适用原因”\n\n' +
        '不适用原因：\n-\n\n## 发布确认\n',
      changedFiles: ['README.md']
    }).length > 0
  )
})

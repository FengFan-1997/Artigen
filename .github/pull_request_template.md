## 背景与结果

- 为什么要改：
- 交付结果：

## PR 类型与目标

- [ ] 日常功能/修复/文档 PR，目标为 `dev`
- [ ] 已验证的 `dev → main` 发布 PR
- [ ] 从最新 `main` 创建的 `hotfix/* → main` PR
- [ ] hotfix 合并后的 `main → dev` 同步 PR

## 影响范围

- [ ] 前端页面
- [ ] 后端 API
- [ ] PostgreSQL / 迁移
- [ ] 登录 / 权限
- [ ] 点数 / 钱包 / 支付
- [ ] AI Provider / 模型 / Prompt
- [ ] Agent / 子 Agent / Computer Use
- [ ] 文件 / 对象存储
- [ ] 环境变量
- [ ] Vercel / Render / Worker
- [ ] 仅文档或文档治理

说明：

## 验证

- [ ] `pnpm check`
- [ ] 文档改动：`pnpm check:docs`
- [ ] `pnpm check:workspace`
- [ ] `git diff --check`
- [ ] 相关页面/API/失败路径 smoke

命令、结果与未验证项：

## DEV 证据

功能分支进入 `dev` 后填写；`dev → main` 发布 PR 必填。

- commit：
- `/api/meta`：
- `/readyz`：
- 页面/API：
- 浏览器控制台：
- 未验证能力及原因：

不要粘贴部署资源 ID、账号、订单、钱包、Run ID、秘密或未脱敏日志。

## 风险与回滚

- 风险：
- 回滚 commit / 功能开关 / 操作：

## Handoff

以下两项必须且只能勾选一项；CI 会校验。选择“不需要更新”时必须填写具体原因。

- [ ] 本 PR 有持久影响，已更新 `PROJECT_HANDOFF.zh-CN.md`
- [ ] 本 PR 无需更新正式 Handoff，并已填写“不适用原因”

正式 Handoff 更新摘要：

不适用原因：

## 发布确认

- [ ] 目标分支与来源分支正确
- [ ] 没有提交密钥、个人信息、动态平台资源 ID 或本机绝对路径
- [ ] 新配置项已更新无秘密示例和对应文档
- [ ] 数据库迁移已在适用环境验证
- [ ] `dev → main` 前已有完整 DEV smoke
- [ ] hotfix 合并 `main` 后将通过 PR 执行 `main → dev` 回同步
- [ ] 合并 `main` 不被表述为已自动发布生产

`HANDOFF.local.md` 只用于本地 AI 协作，不进入 Git，也不是外部贡献者的 PR 前置条件。

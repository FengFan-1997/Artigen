# 为 Artigen 做贡献

感谢你改进 Artigen。本文只保留稳定的协作规则；环境、发布和故障处理命令见
[项目运维指南](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)，全部现行文档见
[文档导航](./docs/README.md)。

## 分支与发布路径

| 目标 | 正常来源 | 用途 |
| --- | --- | --- |
| `dev` | `feat/*`、`fix/*`、`docs/*`、`refactor/*`、`chore/*` | 集成、DEV 部署和验证 |
| `main` | 已验证的 `dev`，或范围明确的 `hotfix/*` | 生产候选代码 |

不要直接 push `dev` 或 `main`，也不要绕过受保护分支门禁。

日常改动从最新 `dev` 开始：

```bash
git fetch origin
git switch -c feat/short-name origin/dev
```

标准路径为：

```text
功能分支 → PR 到 dev → CI → DEV 部署与 smoke
         → dev 到 main 的发布 PR → Release gate → 人工生产发布
```

仅当修复必须避开 `dev` 中尚未发布的改动时，才从最新 `main` 创建 `hotfix/*` 并向
`main` 提交 PR。hotfix 合并后必须立即创建 `main → dev` 同步 PR；禁止用
`dev → main` 代替这次回同步。

## 提交与改动边界

提交信息采用 `type: summary`，例如：

```text
docs: refresh agent runbook
fix: prevent duplicate credit settlement
```

常用类型为 `feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`build` 和
`revert`。一个提交只处理一个主题，不混入无关格式化、生成文件或其他人的工作树改动。

以下内容不得提交：

- 密码、验证码、Cookie、Token、API Key、私钥和数据库连接串；
- 真实邮箱、用户标识、订单/钱包数据、平台资源 ID、部署 ID和本机绝对路径；
- 平台环境变量导出、带凭据的命令输出或未脱敏截图；
- 被忽略的 `HANDOFF.local.md`；
- 未经授权的生产数据或真实付费任务结果。

新增配置项时，只提交无秘密的 `.env.example` 占位符，并同步对应 runbook。

## 本地验证

完整代码改动运行：

```bash
pnpm check
```

开发中可先运行快速门禁：

```bash
pnpm check:core
```

纯文档或文档治理改动至少运行：

```bash
pnpm check:docs
pnpm check:workspace
git diff --check
```

文档门禁会检查相对链接、GitHub 风格锚点、归档标记、隐私模式、README 版本徽章和
直接运行时依赖公告。外部链接不在 CI 联网检查，应在发布前使用只读、带超时和重试的
方式核验。

## CI 与 Release gate

所有 PR 都必须通过 `Core`。面向 `dev` 的变更还会运行浏览器 E2E、Agent Harness 和
chaos 门禁；实际 required checks 以仓库分支保护和聚合的 `Release gate` 为准。

不要因为某项能力在 CI 中被 mock 或 skipped，就把真实支付、邮件、模型、桌面接管或
生产链路描述为已验证。验证证据必须说明环境、commit、检查项和未覆盖范围。

## Handoff 规则

仓库维护两类 Handoff：

| 文件 | 是否提交 | 用途 |
| --- | ---: | --- |
| `HANDOFF.local.md` | 否 | AI/本地任务的过程、临时证据和下一步 |
| `PROJECT_HANDOFF.zh-CN.md` | 是 | 稳定事实、正式决定和发布姿态 |

每个 PR 必须在模板中二选一：

- 有持久影响：勾选已更新正式 Handoff，并在同一 PR 提交更新；
- 无持久影响：勾选无需更新，并填写具体“不适用原因”。

两项不能同时勾选。文档、配置、迁移、运行方式、发布状态或用户可见行为变化通常属于
持久影响。正式 Handoff 只写最终事实，不写逐次调试、分支候选、个人信息和动态平台
资源 ID。

`HANDOFF.local.md` 是本地 AI 协作文件，GitHub 和 CI 不读取它；外部贡献者无需创建或
确认该文件。使用仓库 AI 工作流时仍须遵守 [AGENTS.md](./AGENTS.md)。

## Review 重点

Reviewer 应确认：

1. 实现与 PR 描述、PRD 和公开接口一致。
2. 登录、Cookie、Origin、CSRF、权限和资产所有权没有被绕过。
3. 点数冻结、结算和退款不会重复执行或形成负账。
4. 数据迁移顺序、回滚和旧版本兼容明确。
5. Prompt、图片、文件、用户数据和运行日志不会泄漏。
6. Agent 审批、沙箱、出口、父子权限、租约和预算边界仍成立。
7. 测试证据与风险相匹配，未执行项没有被写成成功。

阻断问题应在合并前解决；建议和非阻断问题也应留下明确处理结论。

## DEV 与生产

功能 PR 合并到 `dev` 后，至少核对 `/api/meta`、`/readyz`、受影响页面/API、浏览器
控制台和失败路径。DEV 默认不等于真实支付、邮件或收费模型已验证。

只有具备完整 DEV 证据的发布候选才能进入 `main`。合并 `main` 不会自动代表生产上线；
生产必须从选定的不可变 `main` commit 人工发布，并在发布后重新核对元信息、就绪状态、
关键页面/API 和回滚入口。

任何数据库、支付或大范围回滚操作都应先完成只读确认，并遵守
[生产 Runbook](./PRODUCTION_RUNBOOK.zh-CN.md)。

## 文档治理

下列变化必须同步更新现行文档和正式 Handoff：

- 产品入口、公开 API、数据结构和用户流程；
- Agent、子 Agent、图片、文件验证、审批或桌面接管；
- 环境、分支、CI、发布、迁移、备份和回滚流程；
- 登录、权限、支付、点数、对象存储或安全边界；
- 直接运行时依赖和第三方许可信息。

现行规范放在根目录或 `docs/README.md` 指向的位置。已失效但仍有历史价值的材料必须
脱敏后移入 `docs/archive/`，并带有“历史快照，不得用于当前部署或运维”警告；不要让
现行 runbook 依赖历史归档。

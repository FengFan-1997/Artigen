# Artigen 项目、环境与发布总手册

本文说明本机、DEV、生产、分支、CI、发布和回滚的稳定流程。动态 SHA、部署和迁移状态不在手册中长期固定，操作时必须读取实时接口和平台状态。

## 1. 环境与权威来源

| 环境 | 代码来源 | 前端/后端 | 数据 | 发布方式 |
| --- | --- | --- | --- | --- |
| 本机 | 功能或 hotfix 分支 | Vite + Express | 本机 PostgreSQL 与本地/测试存储 | 手工启动 |
| DEV | `dev` | Render 同源服务，可有 Vercel Preview | 独立 DEV PostgreSQL 与 S3 命名空间 | 合并 `dev` 后自动部署 |
| 生产 | `main` 的选定不可变提交 | Vercel 前端 + Render API | 生产 PostgreSQL 与共享 S3 | 人工确认和发布 |

事实优先级：

1. `/api/meta`、`/readyz`、状态接口和平台 deployment；
2. GitHub 分支、PR、提交和 required checks；
3. 代码、迁移、环境示例和部署清单；
4. 正式 Handoff 与现行专题文档；
5. 本地 Handoff；
6. 历史归档或聊天。

生产和 DEV 的 URL、服务名称可以记录，密码、数据库连接串、API Key、Cookie、Environment Export 和验证码不能进入 Git、PR、日志、截图或文档。

## 2. 分支模型

长期分支：

- `dev`：集成与线上测试环境。
- `main`：GitHub 默认分支和正式生产来源；合并不自动代表已发布。

常规流程：

```text
feature/fix branch
  → PR to dev
  → required checks
  → DEV deploy + smoke
  → dev PR to main
  → Release gate
  → merge main
  → 人工发布生产
  → 生产 smoke
```

文档或紧急生产 hotfix：

```text
latest main
  → hotfix/*
  → PR to main
  → Release gate
  → merge main
  → main → dev 同步 PR
```

hotfix 禁止通过 `dev → main` 发布，否则会把尚未获批的开发提交一并带入生产来源。同步回 `dev` 时必须保留 DEV 的 Runtime、测试和 workflow 增量，并核对最终 diff。

不直接 push `dev` 或 `main`，不强推，不用管理员绕过 required checks。

## 3. 本机接入

要求：

- Node.js `24.x`
- pnpm `10.x`
- PostgreSQL `16`
- Git
- Computer Agent 开发另需 Docker Desktop 和项目要求的 Python/CUA 工具链

```bash
git clone https://github.com/FengFan-1997/Artigen.git
cd Artigen
pnpm install --frozen-lockfile
pnpm db:local:setup
pnpm dev
```

默认地址：

- 前端：`http://localhost:4000`
- 后端：`http://localhost:8080`
- 健康：`http://localhost:8080/healthz`
- 深度就绪：`http://localhost:8080/readyz`

本机默认关闭真实支付、邮件、生产数据和收费 Provider。需要集成凭据时只放在被忽略的环境文件、平台 Secret 或系统钥匙串中。

## 4. 开始任务

```bash
git fetch --prune origin
git status --short --branch
git switch -c feat/short-name origin/dev
```

hotfix 改为从 `origin/main` 建立 `hotfix/short-name`。开始任何任务前读取：

1. `AGENTS.md`
2. `PROJECT_HANDOFF.zh-CN.md`
3. 被 Git 忽略的 `HANDOFF.local.md`
4. 与改动相关的现行专题文档

用户已有工作树内容不得覆盖、清理、格式化或混入提交。大任务优先使用独立 worktree。

## 5. 本机验证

代码改动的完整入口：

```bash
pnpm check
```

开发过程可先运行：

```bash
pnpm check:core
```

文档改动至少运行：

```bash
pnpm check:docs
pnpm check:workspace
git diff --check
```

`check:docs` 不访问外部网络；它验证相对链接、锚点、归档警告、重复文件、公开信息、README 工具链版本和直接依赖说明。

GitHub Quality Gate 的 job 以当前 `.github/workflows/ci.yml` 为准。Runtime 相关 DEV 版本还运行 report、spreadsheet、presentation、website、image 五组 Harness 与 chaos；本机 `pnpm check` 不能替代这些独立门禁。

## 6. PR 与 Handoff

```bash
git push -u origin <branch>
gh pr create --base dev --head <branch>
```

PR 必须准确填写：

- 改动和影响范围；
- 本机验证与失败/跳过项；
- DEV 或生产证据是否适用；
- 风险、回滚和未验证能力；
- 正式 Handoff 已更新，或具体不适用原因。

CI 会检查 Handoff 二选一。声明“已更新”时 diff 必须包含 `PROJECT_HANDOFF.zh-CN.md`；声明“不需要”时必须填写具体理由。外部贡献者不需要提交本机 `HANDOFF.local.md`。

## 7. DEV 发布与 smoke

DEV 服务跟踪 `dev`。合并后等待部署完成，再使用受保护访问方式核验：

```bash
curl --fail --silent https://dev-artigen-app-fengfan.onrender.com/healthz
curl --fail --silent --user '<dev-user>:<dev-password>' \
  https://dev-artigen-app-fengfan.onrender.com/api/meta
curl --fail --silent --user '<dev-user>:<dev-password>' \
  https://dev-artigen-app-fengfan.onrender.com/readyz
```

不得把真实访问口令写入 shell history、PR 或文档。优先从安全存储读取并在当前进程结束前清空变量。

DEV smoke 至少记录：

- `/api/meta.appEnv=dev` 且 `gitSha` 等于目标提交；
- `/readyz.ok=true`，数据库迁移、S3、Provider 和受影响能力符合预期；
- 页面/API、控制台、队列和错误状态；
- 未验证或按设计 skipped 的能力；
- Agent 变更的 Worker、browser、egress、desktop、subagents 和 Runtime 开关。

DEV 关闭的能力显示 skipped 不是“真实链路通过”。真实支付禁止在 DEV 验收中执行。

## 8. 进入 main

常规发布只在 DEV 证据完整后创建 `dev → main` PR。main PR 必须通过分支策略、Core、E2E 和当前 workflow 定义的所有 Release gate 依赖。

合并 `main` 后：

1. 不自动声称生产已更新；
2. 选择不可变 main 提交；
3. 按 [`PRODUCTION_RUNBOOK.zh-CN.md`](./PRODUCTION_RUNBOOK.zh-CN.md) 人工发布；
4. 核对生产 `/api/meta`、`/readyz`、页面/API 和 Worker；
5. 只有证据齐全才更新正式 Handoff 为已上线。

纯文档 hotfix 不触发人工产品运行时发布。平台自动 Preview/检查只记录为 CI 行为。

## 9. 数据库与迁移

- 迁移只通过 `backend/migrations/` 和项目脚本执行，不直接手改生产表。
- 新代码启动前在 PostgreSQL advisory lock 下应用 pending migration；失败时服务不得带旧 Schema 启动。
- DEV 和生产的当前迁移以 `/readyz.checks.database.migration` 为准，不在长期手册写“最新编号”。
- destructive down migration、批量删除、钱包直接修改和生产数据复制到 DEV 都需要单独批准与备份。
- 发布前备份和恢复验证使用项目脚本；备份文件、manifest 和校验值保存在受限位置，不提交 Git。

常用只读/受控入口：

```bash
pnpm db:audit
pnpm db:backup:neon
pnpm db:restore:verify
```

## 10. 回滚

优先按风险选择：

1. 关闭对应功能开关，停止新任务；
2. 停止或隔离 Worker，让租约和正式取消路径收口；
3. 将 Render/Vercel 回到上一个已验证不可变提交；
4. 保留新增兼容迁移，除非完成备份、影响审计和单独批准；
5. 核对活动任务、hold、预算、队列、回执、沙箱和冻结余额；
6. 记录原因、回滚版本、恢复条件和实际验证。

不能通过删除审计行或直接改钱包来制造“全零”。

## 11. 常见故障

- **页面可开但 API 慢**：先检查 Render 冷启动和 `/healthz`，再看 `/readyz`。
- **版本不一致**：比较 GitHub 目标提交、平台 deployment 与 `/api/meta.gitSha`。
- **迁移不一致**：停止发布，检查启动迁移日志和数据库连接目标。
- **Worker 离线**：检查 Mac 登录状态、Docker、LaunchAgent、数据库/S3/Provider readiness，不手工重复提交任务。
- **对象下载失败**：检查 S3、所有权、opaque URI、字节数和 SHA-256，不回退生产本地磁盘。
- **门禁偶发浏览器崩溃**：保留失败证据，只重跑明确失败 job；重跑通过不等于可以删除原始失败记录。

## 12. 文档维护

平台、域名、分支、CI、环境变量、迁移、模型、登录、计费、文件、Agent 或发布流程变化时，同一 PR 更新对应 living documents。动态状态只记录为带日期证据，并提供重新查询方式。

文档总入口见 [`docs/README.md`](./docs/README.md)。

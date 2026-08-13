# Artigen 项目、环境与发布总手册

> 状态基线：2026-08-10
> 仓库：`FengFan-1997/Artigen`
> 本文回答：项目在哪里运行、如何接入本地/DEV/生产、代码怎么提交、什么时候能进
> `main`、怎么发布和回滚，以及当前分支是从哪里建立的。

## 1. 先记住这套规则

Artigen 使用三层环境：

1. **本机开发环境**：写代码和跑自动测试，不连接生产数据。
2. **DEV 云端测试环境**：`dev` 分支自动部署，供上线前 smoke 和联调。
3. **生产环境**：正式用户环境，生产部署必须人工确认，不因普通 push 自动上线。

标准代码流：

```text
功能分支
  -> PR 到 dev
  -> CI 通过
  -> 合并 dev，自动部署 DEV
  -> DEV smoke / 自检通过
  -> dev 发 PR 到 main
  -> Release gate 通过
  -> 合并 main
  -> 人工发布生产
  -> 生产 smoke
```

五条硬规则：

- 不直接向 `dev` 或 `main` push。
- DEV 没验证通过，不开 `dev -> main` 的发布 PR。
- 合并 `main` 不等于自动上线；生产发布是独立的人工动作。
- 真实密码、Token、数据库 URL、API Key 永远不进 Git、PR、聊天或截图。
- 每个 Artigen AI 任务维护本地阶段 Handoff；持久改动在同一 PR 更新 GitHub 正式 Handoff。

## 2. 当前真实状态

### 2.1 分支状态

| 分支 | 当前作用 | 当前状态 |
| --- | --- | --- |
| `main` | GitHub 默认分支、正式生产来源 | 已完成新架构与 Agent Beta 发布；精确版本读 `/api/meta` |
| `dev` | 云端测试环境集成分支 | 功能分支先通过 PR 进入这里并自动部署 DEV |
| `codex/*`、`feat/*`、`fix/*` 等 | 日常工作分支 | 通过 PR 进入 `dev`，不直接发布生产 |
| `codex/artigen-overhaul` | 历史迁移分支 | 不再接收日常改动，也不是当前生产来源 |
| `test` | 旧测试分支 | 已废弃；不要再用于新流程 |

文档不固定“当前本地工作分支”，因为它会随任务变化。每个 AI 或开发者必须在任务开始读取
`git status --short --branch`，把当前 branch、base、HEAD 和用户已有工作树记录到
被 Git 忽略的 `HANDOFF.local.md`。

### 2.2 当前生产事实

当前生产已经切换到 `main` 的不可变 commit：

```text
main SHA: 529b73fffcd2f06323ccd373168a5e009f312b5a
Render service: srv-d9cr73r7uimc73etc4j0
Render deployment: dep-d9qsuam417fc7383uj70
```

- Vercel `artigen-fengfan` 从正式 `main` 版本构建生产前端。
- Render `artigen-app-fengfan` 从 `main` 的选定 SHA 人工部署，保持生产发布人工确认。
- `codex/artigen-overhaul` 和 `test` 只保留历史，不再接收新功能。
- 合并 `main` 仍不等于自动上线；只有生产部署和 smoke 完成后才能描述为已上线。
- 文档 SHA 可能过时，精确线上版本始终以 `/api/meta`、GitHub `main` 和平台 deployment
  交叉核验。

## 3. 系统架构

```text
生产用户
  -> Vercel / artigen-fengfan
       -> 静态 Vue 前端
       -> /api、/files、/readyz 反向代理
          -> Render / artigen-app-fengfan
               -> Neon PostgreSQL / neondb
               -> S3 兼容对象存储 / artigen-assets
               -> SiliconFlow
               -> Vercel 邮件中继 / artigen-mail-relay
               -> Cloudflare Turnstile
               -> 爱发电

测试人员
  -> Render / dev-artigen-app-fengfan
       -> 同源 Vue + Express
       -> Neon PostgreSQL / dev_artigen
       -> file 临时图片存储
       -> 真实支付、邮件、收费 AI 默认关闭
```

项目代码：

- 前端：Vue 3 + Vite + Pinia，目录 `frontend/`。
- 后端：Express 5 + CommonJS，目录 `backend/`。
- 数据库：PostgreSQL 16，迁移位于 `backend/migrations/`。
- 产品目录：`shared/tools.catalog.json`。
- 邮件中继：Vercel Serverless，目录 `mail-relay/`。
- CI：GitHub Actions，文件 `.github/workflows/ci.yml`。

## 4. 环境总表

| 项目 | 本机 | DEV 测试 | 生产 |
| --- | --- | --- | --- |
| Git 分支 | 功能分支 | `dev` | `main` 的选定不可变 SHA |
| 前端 | `http://localhost:4000` | Render 同源站点 | Vercel `artigen-fengfan` |
| 后端 | `http://localhost:8080` | Render `dev-artigen-app-fengfan` | Render `artigen-app-fengfan` |
| 数据库 | `artigen_dev` | `dev_artigen` | `neondb` |
| 数据隔离 | 本机 PostgreSQL | 独立数据库；与生产共享 Neon 项目计算资源 | 生产数据库 |
| 图片 | 本机 file | 独立 DEV 凭据/命名空间的共享 S3 | S3 兼容共享对象存储 |
| 访问 | 本机 | HTTP Basic 首次认证 + 短时安全 Cookie | 公开站点 |
| 支付 | 关闭 | 仅创建未支付订单并验证 pending/幂等，不真实付款 | 已配置；真实扣款最终验收仍需谨慎 |
| 邮件 OTP | 默认关闭 | 关闭 | 签名 HTTPS 中继 |
| 收费 AI | 默认关闭 | 真实 SiliconFlow + 合成素材/用户 + DEV 钱包 | 通过功能门禁启用 |
| 自动部署 | 无 | PR 合入 `dev` 后自动 | 关闭，人工发布 |

## 5. 接入本机开发环境

### 5.1 前置软件

- Node.js `24.x`
- pnpm `10.x`
- PostgreSQL `16`
- Git

检查版本：

```bash
node --version
pnpm --version
/opt/homebrew/opt/postgresql@16/bin/pg_isready -h 127.0.0.1 -p 5432
```

### 5.2 安装与初始化

```bash
git clone https://github.com/FengFan-1997/Artigen.git
cd Artigen
pnpm install --frozen-lockfile
pnpm run db:local:setup
```

`db:local:setup` 会幂等创建：

- `artigen_dev`
- `artigen_test`
- `artigen_restore_verify`
- `backend/.env` 中的本机连接配置和独立随机安全密钥

`backend/.env` 权限为 `0600`，已被 Git 忽略。

### 5.3 启动

```bash
VITE_APP_ENV=dev pnpm run dev
```

访问：

- 页面：<http://localhost:4000/artigen>
- 后端健康：<http://localhost:8080/healthz>
- 后端深检：<http://localhost:8080/readyz>

### 5.4 本机自检

日常快速门禁：

```bash
pnpm check:core
```

准备提交或发布前的完整门禁：

```bash
pnpm check
```

`pnpm check` 包括：

- workspace/lockfile 规则
- ESLint
- TypeScript/Vue 类型检查
- 前端、后端和邮件中继单测
- PostgreSQL 契约测试
- Chromium、Firefox、WebKit 桌面/手机/平板 E2E
- 生产构建
- 首页 gzip 预算

纯文档改动至少执行：

```bash
pnpm check:workspace
git diff --check
```

## 6. 接入 DEV 测试环境

### 6.1 资源

- URL：<https://dev-artigen-app-fengfan.onrender.com/artigen>
- Render Service：`dev-artigen-app-fengfan`
- Service ID：`srv-d9gpgs61a83c73f7k8s0`
- 分支：`dev`
- 自动部署：开启
- 数据库：`dev_artigen`
- 页面固定显示：`DEV 测试环境`

浏览器首次打开会要求：

- 用户名：`artigen-dev`
- 密码：保存在本机钥匙串 `Artigen Dev Access Password`

在授权 Mac 上读取：

```bash
security find-generic-password -s 'Artigen Dev Access Password' -w
```

不要把输出粘贴到 PR 或聊天。

首次 Basic 认证成功后，DEV 会下发默认 12 小时有效的
`HttpOnly + Secure + SameSite=Strict` 访问 Cookie。后台管理接口随后可以独立使用
Bearer token，不会与 Basic 的 `Authorization` 请求头冲突。

### 6.2 DEV 安全边界

- 不连接生产 `neondb`。
- 使用独立的 DEV 数据库、S3 凭据与对象命名空间；生成结果必须持久化到共享 S3，不能再假设 Render 临时 file 可作为验收存储。
- 支付验收只允许创建未支付爱发电订单并检查跳转、pending、钱包不入账和幂等；不执行真实付款。
- 不发送生产验证码。
- 允许使用合成用户、合成素材和 DEV 钱包运行真实 SiliconFlow 付费任务与 Agent smoke；价格、冻结、结算、退款、S3 和幂等边界必须与生产一致。
- DEV Mac Agent Worker 使用独立 Keychain profile、DEV 数据库和 DEV relay；不得启动或复用生产 Worker profile。
- DEV 与生产域名不同，Cookie 不共享。

### 6.3 DEV 部署

以后不直接 push `dev`。从最新 `dev` 创建功能分支：

```bash
git fetch origin
git switch -c feat/short-name origin/dev
```

完成代码和本机自检后：

```bash
git status --short
git add <明确的文件>
git diff --cached
git commit -m "feat: concise summary"
git push -u origin feat/short-name
gh pr create --base dev --head feat/short-name
```

PR 的 CI 全绿后合并到 `dev`。Render 会自动部署该 commit。

### 6.4 DEV 配置漂移检查

`render.dev.yaml` 是仓库中的期望配置，但已存在的 Render 服务不一定会自动同步后来新增的
环境变量。每次新增或修改环境变量时，必须同时完成：

1. 更新 `render.dev.yaml` 和 `backend/.env.example`。
2. 在 Render 的 `dev-artigen-app-fengfan -> Environment` 中核对实际值。
3. 保存并重新部署 DEV。
4. 以 `/readyz` 返回值验证运行时配置，不能只看仓库文件或控制台表单。

当前后台与行为日志的 DEV 运行时门槛：

- `adminConsoleEnabled=true`
- `behaviorAnalyticsEnabled=true`
- `databaseRequired=true`
- `checks.database.ok=true`
- `checks.database.migration=021_design_conversations`
- 付费、AI Design、Workshop、Task Worker 或 Agent 生图在 DEV 开启时，对应 readiness、SiliconFlow、S3、payload 和队列检查必须全部为 `ok=true`；未开启的能力必须诚实显示为 disabled/skipped。
- 对话入口开启时必须同时满足 `conversationEnabled=true`、
  `checks.conversation.ok=true`、固定规划模型 `Qwen/Qwen3-8B`、固定图片模型
  `Kwai-Kolors/Kolors`，并确认 Agent `accessMode=authenticated-v1`；只部署页面或只开启
  其中一个开关都不算 DEV 验收通过。

可用以下命令确认最终部署确实对应目标提交：

```bash
render deploys list srv-d9gpgs61a83c73f7k8s0 --output json \
  | jq '.[0] | {id, status, trigger, commit: .commit.id}'
```

### 6.5 DEV smoke

先确认部署版本：

```bash
DEV_PASSWORD="$(security find-generic-password -s 'Artigen Dev Access Password' -w)"

curl --fail --silent \
  --user "artigen-dev:${DEV_PASSWORD}" \
  https://dev-artigen-app-fengfan.onrender.com/api/meta | jq

curl --fail --silent \
  --user "artigen-dev:${DEV_PASSWORD}" \
  https://dev-artigen-app-fengfan.onrender.com/readyz | jq

unset DEV_PASSWORD
```

要求：

- HTTP 200。
- `appEnv` 是 `dev`。
- `gitSha` 等于本次 DEV commit。
- `/readyz` 的 `ok` 是 `true`。
- 后台和行为日志启用时，`adminConsoleEnabled`、`behaviorAnalyticsEnabled`、
  `databaseRequired` 都必须是 `true`。
- 数据库检查必须返回 `ok=true` 和当前迁移版本；不能只确认进程存活。
- 开启的付费、任务 Worker 和 AI 能力必须通过真实 readiness 与 smoke；关闭的邮件或其他能力必须显示为 disabled/skipped，不能假装通过真实链路。

页面至少检查：

- `/artigen`
- `/artigen/ai`
- `/artigen/tools`
- `/artigen/image-workshop`
- `/artigen/image-workshop/image-editor`
- `/login`
- `/console`

记录：

- DEV commit SHA
- Render deploy ID
- 检查时间
- 页面/API 结果
- 浏览器控制台错误
- 未覆盖能力和原因

## 7. 从 DEV 提 PR 到 main

只有满足以下条件，才允许创建 `dev -> main` PR：

- 功能分支已合并到 `dev`。
- GitHub CI 全绿。
- DEV 部署 commit 与 `dev` HEAD 一致。
- DEV smoke 已记录。
- 没有把 DEV/本机变量复制到生产。
- 数据库迁移已在空库或测试库验证。
- 登录、钱包、支付、生成、文件、管理员权限等高风险改动有专项结果。

创建发布 PR：

```bash
git fetch origin
gh pr create \
  --base main \
  --head dev \
  --title "release: promote verified DEV to production" \
  --body-file .github/pull_request_template.md
```

如果模板文件名由 GitHub 自动加载，可直接：

```bash
gh pr create --base main --head dev --fill
```

`main` PR 的必要条件：

- `Release gate` 必须成功。
- 所有 Review 对话已解决。
- PR 模板的 DEV 验证证据已填写。
- 不能用旧 Cloudflare Workers 的遗留检查代替 Artigen CI。
- 不能因为“Vercel Preview 能打开”就跳过后端、数据库和权限检查。

## 8. main 合并后的生产发布

### 8.1 当前发布边界

生产来源已经是 `main`，旧迁移分支不再参与发布。发布前必须核对：

1. `main` 包含已经在 DEV 验证的 commit。
2. GitHub Release gate 成功。
3. Render 生产保持人工部署，不因普通 push 自动切流量。
4. Vercel 和 Render 都对应选定的 `main` SHA。
5. 数据库迁移已备份并在切流量前带锁执行。
6. 生产 smoke 完成后再把正式 Handoff 更新为“已上线”。

### 8.2 目标生产发布方式

生产发布必须选定一个不可变 SHA：

```bash
git fetch origin
RELEASE_SHA="$(git rev-parse origin/main)"
git show --no-patch --oneline "$RELEASE_SHA"
```

发布前保存：

- `RELEASE_SHA`
- 上一个生产 SHA
- DEV smoke 记录
- GitHub Release gate URL
- 数据库迁移清单
- 回滚负责人

Render 后端人工部署指定 commit：

```bash
render deploys create srv-d9cr73r7uimc73etc4j0 \
  --commit "$RELEASE_SHA" \
  --wait
```

Vercel 前端：

1. 在 `artigen-fengfan` 找到同一 SHA 的 `READY` 部署。
2. 先在 Preview URL 做静态页面 smoke。
3. 人工执行 Promote to Production。
4. 确认主域名仍是 `artigen-fengfan.vercel.app`。

不要在带有未提交文件的工作树直接执行任意 `vercel --prod`。

### 8.3 生产 smoke

```bash
curl --fail --silent https://artigen-fengfan.vercel.app/healthz | jq
curl --fail --silent https://artigen-fengfan.vercel.app/readyz | jq
curl --fail --silent https://artigen-fengfan.vercel.app/api/meta | jq
```

人工检查：

- `/artigen` 可立即打开。
- 登录/验证码至少一条真实链路成功。
- 钱包余额来自 PostgreSQL。
- AI 生成只在允许时发起，并生成持久化资产。
- `/files`/资产访问仍按用户所有权鉴权。
- 管理控制台不能匿名访问。
- 支付如未做真实扣款，不写成“真实支付已验收”。

## 9. 生产环境接入

### 9.1 GitHub

```bash
gh auth status
gh repo view FengFan-1997/Artigen
gh pr list --repo FengFan-1997/Artigen
gh run list --repo FengFan-1997/Artigen
```

仓库默认分支：`main`。

### 9.2 Render

```bash
render whoami
render workspace current
render services --output json
render deploys list srv-d9cr73r7uimc73etc4j0 --output json
render logs --resources srv-d9cr73r7uimc73etc4j0 --limit 100
```

生产服务：

- Workspace：`artigen`
- Name：`artigen-app-fengfan`
- ID：`srv-d9cr73r7uimc73etc4j0`
- URL：<https://artigen-app-fengfan.onrender.com>
- 自动部署：关闭
- 健康检查：`/healthz`

### 9.3 Vercel

```bash
pnpm dlx vercel@latest whoami
pnpm dlx vercel@latest project inspect artigen-fengfan
pnpm dlx vercel@latest project inspect artigen-mail-relay
```

生产项目：

- Team：`FengFan's projects`
- Project：`artigen-fengfan`
- 主域名：<https://artigen-fengfan.vercel.app>

邮件中继：

- Project：`artigen-mail-relay`
- URL：<https://artigen-mail-relay.vercel.app>

### 9.4 Neon

生产：

- Organization：`Artigen`
- Project：`Artigen Production`
- Database：`neondb`

DEV：

- Database：`dev_artigen`
- 与生产数据库逻辑隔离，但仍共享当前 Neon 项目计算资源。

本机钥匙串服务名：

- `Artigen Neon Production Direct URL`
- `Artigen Neon Dev Direct URL`

只读连接示例：

```bash
DATABASE_URL="$(security find-generic-password \
  -s 'Artigen Neon Production Direct URL' -w)"
psql "$DATABASE_URL"
unset DATABASE_URL
```

先执行只读 SQL。不要在生产运行不理解的 `DELETE`、`DROP`、`TRUNCATE` 或无 `WHERE`
的 `UPDATE`。

## 10. 环境变量管理

| 类型 | 存放位置 |
| --- | --- |
| 本机变量 | `backend/.env`，权限 `0600` |
| DEV 变量 | Render `dev-artigen-app-fengfan -> Environment` |
| 生产后端变量 | Render `artigen-app-fengfan -> Environment` |
| 生产前端变量 | Vercel `artigen-fengfan -> Settings -> Environment Variables` |
| 邮件中继变量 | Vercel `artigen-mail-relay -> Settings -> Environment Variables` |
| 安全副本 | macOS 钥匙串 |

环境变量变更流程：

1. 在代码中定义安全默认值或 fail-closed 行为。
2. 更新 `backend/.env.example` 和相关文档，只写变量名。
3. 先配置 DEV。
4. DEV `/readyz` 和功能 smoke 通过。
5. 在 `dev -> main` PR 中列出生产需要新增/修改的变量名。
6. 合并后人工配置生产。
7. 部署并重新检查 `/readyz`。

禁止把平台的 Environment Export 提交 Git 或发到聊天。

## 11. 数据库迁移

规则：

- 当前最新迁移是 `014_operational_records`：新增最小化的 usage、图片历史和内容审计
  PostgreSQL 存储；`/readyz` 会同时检查该表及必需列。
- 迁移只新增、兼容旧版本，默认不做破坏性回滚。
- 先在本机 `artigen_test` 验证。
- 再由 DEV `dev_artigen` 的启动锁幂等应用。
- DEV 通过后才能进入 `main`。
- 生产由 `start:production` 在监听端口前、持有 advisory lock 时应用。
- 迁移失败时新版本不得启动。

检查：

```bash
pnpm --filter backend db:migrate
pnpm run db:audit
```

高风险数据迁移必须在 PR 中写明：

- 影响表
- 预计行数和耗时
- 是否锁表
- 旧代码能否读取新结构
- 失败和回滚策略

本次 `014` 为加表迁移，不替换钱包、不可变账本、任务或支付表。代码回滚后表可保留，
不要在生产执行 `db:rollback` 或手工 `DROP TABLE`；后续版本可以继续读取或前向修复。

## 12. 回滚

### 12.1 前端

- 在 Vercel 找到上一个 `READY` Production 部署。
- Promote 上一个版本。
- 检查主域名和 `/api` rewrite。

### 12.2 后端

```bash
render deploys list srv-d9cr73r7uimc73etc4j0 --output json
render deploys create srv-d9cr73r7uimc73etc4j0 \
  --commit <last-known-good-sha> \
  --wait
```

### 12.3 功能开关

发生支付、任务、Provider 或存储异常时，优先关闭：

- `PAYMENTS_ENABLED`
- `PAID_FEATURES_ENABLED`
- `AI_DESIGN_TASK_V2_ENABLED`
- `WORKSHOP_AI_TASK_V2_ENABLED`
- `TASK_WORKER_ENABLED`
- `AUTH_EMAIL_OTP_ENABLED`

关闭后重新检查 `/readyz` 和日志。不要直接修改生产钱包余额来“修复”故障。

### 12.4 数据库

代码回滚不等于数据库回滚。迁移已执行时：

- 优先前向修复。
- 先做备份和只读审计。
- 只有专门评审过的恢复方案才能写生产库。

## 13. GitHub CI 与合并判定

仓库内的正式检查：

- `Core quality gate`
- 8 组 E2E matrix
- 聚合检查 `Release gate`

`Release gate` 只有在 core 和全部 E2E 成功时才成功。

当前 GitHub 还会显示两个旧 Cloudflare Workers 外部检查：

- `Workers Builds: fengfan001`
- `Workers Builds: ff1997`

它们不是 Artigen 当前 Vercel/Render 发布链路，不能作为 Artigen 发布成功依据；应在
Cloudflare Git 集成中解绑。正式分支保护只要求仓库自己的 `Release gate`。

查看检查：

```bash
gh pr checks <PR号> --repo FengFan-1997/Artigen
```

## 14. PR 最低内容

每个 PR 必须说明：

- 为什么改
- 改了什么
- 影响页面/API/数据库/环境变量
- 本机测试
- DEV commit 和部署
- DEV smoke 证据
- 风险
- 回滚方式
- 本地 Handoff 已更新
- 正式 Handoff 已更新，或说明不适用原因

高风险改动必须单独标注：

- 登录和会话
- 钱包、点数、账本
- 支付和 webhook
- PostgreSQL 迁移
- 文件与对象存储
- 管理员权限
- AI Provider、模型和 prompt

## 15. 文档分工

| 文档 | 回答的问题 |
| --- | --- |
| `PROJECT_HANDOFF.zh-CN.md` | 当前已经固化到 GitHub 的正式项目状态和持久事实 |
| `HANDOFF.local.md` | 当前 AI 任务的阶段、具体进度、临时尝试、阻塞和下一步；永不提交 |
| `AGENTS.md` | 所有 AI 在任务开始、执行、交接和结束时必须遵守的仓库级规则 |
| `PROJECT_OPERATIONS_GUIDE.zh-CN.md` | 环境、接入、分支、提交、发布、回滚的总入口 |
| `README.md` | 项目是什么、怎么启动、代码在哪里 |
| `PRD.md` | 产品、接口、认证、计费和数据契约 |
| `CONTRIBUTING.md` | 协作者每天应遵守的简明规则 |
| `DEV_ENVIRONMENT_RUNBOOK.zh-CN.md` | DEV 环境的具体使用和安全边界 |
| `PRODUCTION_RUNBOOK.zh-CN.md` | 生产账号、平台、故障处理和接管 |

平台、分支、环境变量、发布流程变化时，必须同步更新受影响的专题文档和正式 Handoff。

### 15.1 Handoff 生命周期

```text
AI 任务开始
→ 读取 AGENTS + 正式 Handoff + 本地 Handoff
→ 检查并记录工作树
→ 开发/分析过程中维护本地具体状态
→ 有持久改动时整理正式结论
→ 同一 PR 更新 PROJECT_HANDOFF
→ DEV/生产有证据后再更新部署状态
→ 最终回复前更新本地 Handoff
```

纯分析、未采用方案和已撤销实验不进入 GitHub。Bug 修复可以更正正式 Handoff，但只记录
最终修复和验证结果。正式文档与代码、迁移或部署证据矛盾时，PR 必须阻塞。

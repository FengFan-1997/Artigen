# Artigen 项目、环境与发布总手册

> 状态基线：2026-07-23
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

四条硬规则：

- 不直接向 `dev` 或 `main` push。
- DEV 没验证通过，不开 `dev -> main` 的发布 PR。
- 合并 `main` 不等于自动上线；生产发布是独立的人工动作。
- 真实密码、Token、数据库 URL、API Key 永远不进 Git、PR、聊天或截图。

## 2. 当前真实状态

### 2.1 分支状态

| 分支 | 当前作用 | 当前状态 |
| --- | --- | --- |
| `main` | GitHub 默认分支、目标发布分支 | 当前停在 `380a2b1`，尚未完成新架构切换 |
| `dev` | 云端测试环境集成分支 | 当前与 `codex/oss-foundation-upgrade` 同步 |
| `codex/artigen-overhaul` | 当前生产代码来源、迁移期发布分支 | 生产 Vercel 和 Render 都跟踪它 |
| `codex/oss-foundation-upgrade` | 当前工作分支 | 基于 `codex/artigen-overhaul` 的 `10c1524` 建立 |
| `test` | 旧测试分支 | 已废弃；不要再用于新流程 |

当前工作分支的准确关系：

```text
main @ 380a2b1
  └─ ... Artigen production overhaul ...
      └─ codex/artigen-overhaul @ 10c1524
          └─ 当前工作提交
              └─ codex/oss-foundation-upgrade / dev
```

- 当前本地分支：`codex/oss-foundation-upgrade`。
- 直接基线：`codex/artigen-overhaul` 的 `10c1524`。
- 取证快照 `fc46cc4`（本文档提交前）相对直接基线领先 13 个提交、落后 0 个提交；
  相对 `main` 领先 43 个提交、落后 0 个提交。本文档及后续提交会让领先数自然增加，
  但不会改变直接基线。
- Git 本身不保存“谁创建了分支”；可验证的是取证快照中的分支独有提交作者为
  `NewFF <sorates1997@163.com>`，GitHub PR #2 创建者为 `FengFan-1997`。
- 当前 PR #2：`codex/oss-foundation-upgrade -> codex/artigen-overhaul`。
- 迁移 PR #1：`codex/artigen-overhaul -> main`。

### 2.2 当前迁移期事实

`main` 已是 GitHub 默认分支，但**当前生产云资源还没有切到 `main`**：

- Vercel `artigen-fengfan` 的 Production Branch 是 `codex/artigen-overhaul`。
- Render `artigen-app-fengfan` 的部署分支是 `codex/artigen-overhaul`，且自动部署关闭。
- 因此在完成 PR #2、PR #1 和生产切换前，不能把“合并 main”描述成“自动上线”。

完成这次迁移后，目标状态是：

- DEV：`dev`，自动部署。
- 正式代码：`main`。
- 生产：从 `main` 的指定 commit 人工发布。
- `codex/artigen-overhaul` 和旧 `test` 只保留历史，不再接收新功能。

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
| Git 分支 | 功能分支 | `dev` | 目标 `main`；迁移期仍是 `codex/artigen-overhaul` |
| 前端 | `http://localhost:4000` | Render 同源站点 | Vercel `artigen-fengfan` |
| 后端 | `http://localhost:8080` | Render `dev-artigen-app-fengfan` | Render `artigen-app-fengfan` |
| 数据库 | `artigen_dev` | `dev_artigen` | `neondb` |
| 数据隔离 | 本机 PostgreSQL | 独立数据库；与生产共享 Neon 项目计算资源 | 生产数据库 |
| 图片 | 本机 file | Render 临时 file | S3 兼容共享对象存储 |
| 访问 | 本机 | HTTP Basic 访问门 | 公开站点 |
| 支付 | 关闭 | 关闭 | 已配置；真实扣款最终验收仍需谨慎 |
| 邮件 OTP | 默认关闭 | 关闭 | 签名 HTTPS 中继 |
| 收费 AI | 默认关闭 | 关闭 | 通过功能门禁启用 |
| 自动部署 | 无 | `dev` push 后自动 | 关闭，人工发布 |

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

### 6.2 DEV 安全边界

- 不连接生产 `neondb`。
- 不读写生产对象存储桶。
- 不调用真实支付。
- 不发送生产验证码。
- 不运行收费 AI 任务。
- DEV 图片使用临时 file 存储，Render 重启后允许丢失。
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

### 6.4 DEV smoke

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
- 关闭的付费、邮件和 AI 能力必须显示为 disabled/skipped，不能假装通过真实链路。

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

### 8.1 当前迁移期

截至本文日期，生产仍跟踪 `codex/artigen-overhaul`。在 PR #2 和 PR #1 完成前：

- 不直接把 Render/Vercel 生产分支改成 `main`。
- 不从当前落后的 `main` 发布。
- PR 合并顺序是：PR #2 先进入 `codex/artigen-overhaul`，PR #1 再进入 `main`。

完成切换时必须一次性核对：

1. `main` 包含已在 DEV 验证的 commit。
2. Vercel Production Branch 改为 `main`。
3. Render 生产服务 branch 改为 `main`。
4. Render 生产保持 `autoDeploy=off`。
5. Vercel 和 Render 都部署同一 `main` commit。
6. 完成生产 smoke 后再关闭迁移 PR 和旧分支入口。

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
| `PROJECT_OPERATIONS_GUIDE.zh-CN.md` | 环境、接入、分支、提交、发布、回滚的总入口 |
| `README.md` | 项目是什么、怎么启动、代码在哪里 |
| `PRD.md` | 产品、接口、认证、计费和数据契约 |
| `CONTRIBUTING.md` | 协作者每天应遵守的简明规则 |
| `DEV_ENVIRONMENT_RUNBOOK.zh-CN.md` | DEV 环境的具体使用和安全边界 |
| `PRODUCTION_RUNBOOK.zh-CN.md` | 生产账号、平台、故障处理和接管 |

平台、分支、环境变量、发布流程变化时，必须同步更新这六处中受影响的文档。

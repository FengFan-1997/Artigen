# Artigen DEV 测试环境

> DEV 是线上可访问的测试环境，不是生产环境，也不承载真实用户数据。

## 地址与命名

- 云端服务：`dev-artigen-app-fengfan`
- 云端地址：`https://dev-artigen-app-fengfan.onrender.com`
- 部署分支：`dev`（push 后自动部署）
- 云端数据库：`dev_artigen`
- 本机前端：`http://localhost:4000`
- 本机后端：`http://localhost:8080`
- 本机数据库：`artigen_dev`

打开云端地址时，浏览器会先要求 HTTP Basic 认证。用户名固定为
`artigen-dev`；密码只保存在 Render 环境变量和 macOS 钥匙串
`Artigen Dev Access Password` 中，不写入 Git。

Basic 认证成功后，服务会签发仅限 DEV 域名的短时
`HttpOnly + Secure + SameSite=Strict` 访问 Cookie。这样后台自己的 Bearer token
可以继续使用 `Authorization` 请求头，不会与外层 DEV 访问门禁冲突。

## 隔离边界

DEV 默认采用以下安全门：

1. `DATABASE_URL` 与 `DATABASE_MIGRATION_URL` 只连接 `dev_artigen`，不连接生产 `neondb`。
2. 当前集成验收环境开启 `PAID_FEATURES_ENABLED=true`、`PAYMENTS_ENABLED=true`、
   `TASK_WORKER_ENABLED=1`，但只使用 DEV 数据库中的合成用户；支付验收只能创建未支付订单，
   不执行真实付款，也不能把 pending 订单当作钱包入账。
3. `AUTH_EMAIL_OTP_ENABLED=false`，不会调用生产邮件中继。
4. `AI_DESIGN_TASK_V2_ENABLED=true`、`AI_DESIGN_TASK_V2_ROLLOUT_PERCENT=100`、
   `WORKSHOP_AI_TASK_V2_ENABLED=true`，用于真实 SiliconFlow、任务队列、结算与失败退款 smoke。
5. `ASSET_STORAGE_DRIVER=s3`，生成结果必须通过共享对象存储、SHA-256 与尺寸验证；DEV 资产和
   任务记录不得冒充生产数据。
6. 云端页面固定显示 `DEV 测试环境` 标记，并由独立访问口令保护。
7. DEV 与生产使用不同域名，因此 HttpOnly Session Cookie 也相互隔离。
8. 页面行为、模型用量、图片历史和内容审计写入 `dev_artigen` PostgreSQL；它们不依赖
   Render 临时磁盘。原始 prompt、文件名、图片地址和输入内容不会写入这些记录。

## 本机启动

首次或需要重建本机数据库时：

```bash
pnpm run db:local:setup
```

启动前后端：

```bash
pnpm run dev
```

健康检查：

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

## 云端检查

浅健康检查不需要密码，供 Render 使用：

```bash
curl https://dev-artigen-app-fengfan.onrender.com/healthz
```

深健康检查和页面需要 DEV 访问账号：

```bash
DEV_PASSWORD="$(security find-generic-password -s 'Artigen Dev Access Password' -w)"
curl --user "artigen-dev:${DEV_PASSWORD}" \
  https://dev-artigen-app-fengfan.onrender.com/readyz
unset DEV_PASSWORD
```

## 发布到 DEV

DEV 服务只跟踪远端 `dev` 分支；更新该分支会自动构建并部署，生产分支和生产服务
不会被触发。

```bash
git fetch origin
git switch -c feat/short-name origin/dev
git push -u origin feat/short-name
gh pr create --base dev --head feat/short-name
```

PR 的 GitHub CI 通过后合并到 `dev`。以后不直接 push `dev`。

部署完成后，`/api/meta` 的 `appEnv` 必须是 `dev`，`gitSha` 必须等于本次
`dev` commit；随后完成页面和 `/readyz` smoke，才能创建 `dev -> main` PR。

注意：仓库中的 `render.dev.yaml` 表示期望配置，但已存在的 Render 服务不保证自动同步
后来新增的环境变量。凡是改动环境变量，都要在 DEV 服务的 Environment 页面核对实际值、
重新部署，并以 `/readyz` 的运行时结果为准。

涉及后台或数据迁移时，还要检查：

- `/readyz` 返回数据库迁移 `021_design_conversations` 且 `ok=true`。
- `/readyz` 返回
  `adminConsoleEnabled=true`、`behaviorAnalyticsEnabled=true`、
  `databaseRequired=true`；任一不符都视为配置漂移，不能继续提 `dev -> main`。
- `/console/users` 的行为、点数、订单、会话任一接口失败时显示错误与“重试”，不能显示
  成一张无数据空表。
- `/console/usage` 能读取 PostgreSQL usage 记录。
- `/console/content-audit` 能读取 PostgreSQL 图片/内容审计元数据。
- 同一个按钮快速双击只去重同一瞬间事件，隔一段时间再次点击仍会新增记录。
- 对话入口开启时，`conversationEnabled=true`，且
  `checks.conversation.ok=true`、`plannerReady=true`、规划队列无异常积压；
  `AGENT_BETA_MODE` 必须为 `authenticated-v1`，不能只打开前端路由。

完整提交流程和生产发布规则见
[《Artigen 项目、环境与发布总手册》](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

## 开启真实集成前

DEV 当前已接入真实 SiliconFlow、PostgreSQL、任务队列和 S3，用于发布前集成 smoke。
运行时只允许两个模型：所有文字理解、结构化输出和工具决策使用 `Qwen/Qwen3-8B`；所有
图片输出使用 `Kwai-Kolors/Kolors`。Kolors 接收 0 张图时文生图、接收 1 张图时图生图；
第二张参考图必须在 Provider 请求前失败。

邮件发件域、Turnstile、对象存储和支付配置仍不得把 DEV 身份或数据混入生产。每项能力
必须先通过 `/readyz` 和对应 smoke；支付只验证未支付订单、跳转、pending、钱包不入账与
幂等复用，禁止在 DEV 流程中执行真实付款。

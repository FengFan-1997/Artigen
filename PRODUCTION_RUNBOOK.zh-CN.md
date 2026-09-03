# Artigen 生产环境小白接管手册

> 状态快照：2026-07-23
> 本文不保存密码、验证码、SMTP 授权码、数据库连接串、API Key 或支付 Token。

本机、DEV、`dev -> main`、生产发布和回滚的完整流程见
[《Artigen 项目、环境与发布总手册》](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

## 1. 先看结论

Artigen 已经部署为一个公开网站：

- 主站：<https://artigen-fengfan.vercel.app/artigen>
- AI 生图：<https://artigen-fengfan.vercel.app/artigen/ai>
- 点数商城：<https://artigen-fengfan.vercel.app/artigen/market>
- 深度健康检查：<https://artigen-fengfan.vercel.app/readyz>
- Render 后端直连备用地址：<https://artigen-app-fengfan.onrender.com>

如果只记住四句话：

1. 用户看见的网页在 Vercel，项目叫 `artigen-fengfan`。
2. 登录、生图、点数和支付 API 在 Render，服务叫 `artigen-app-fengfan`。
3. 用户、钱包、任务和订单在 Neon PostgreSQL，项目叫 `Artigen Production`。
4. 任何密码、数据库连接串、授权码和 API Key 都不在 GitHub；它们在各平台的
   Environment Variables 中，本机另有 macOS 钥匙串安全副本。

不要混淆两个 Vercel 项目：

| Vercel 项目 | 做什么 | 用户是否直接访问 |
|---|---|---|
| `artigen-fengfan` | 托管 Vue 主站，并把 `/api` 按需代理给 Render | 是 |
| `artigen-mail-relay` | 接收 Render 的签名 HTTPS 请求，再通过 163 SMTP 发验证码 | 否 |

当前已经真实验收的链路：

1. 公网访问 Artigen。
2. QQ 邮箱收到由 163 邮箱发出的 6 位验证码。
3. 使用验证码登录。
4. 登录后读取 PostgreSQL 钱包余额。
5. 创建 10 点生图任务。
6. SiliconFlow 使用 `Kwai-Kolors/Kolors` 成功生图。
7. 结果保存到共享对象存储。
8. 通过 opaque `transferId` 进入 Editor V2。
9. 失败任务释放预占点数，成功任务只结算一次。
10. 点数商城能创建本地订单，并跳转到正确的爱发电 9.90 元方案。

当前唯一没有做的真实验收：

- 没有实际支付 9.90 元，所以没有验证“真实扣款 → 爱发电产生真实订单 →
  webhook/API 查询确认 → PostgreSQL 入账 400 点”这最后一段。
- 爱发电 API 凭证、四个套餐、官方订单查询、webhook 测试和本地待支付订单都已配置并通过检查，
  但“配置可用”不能冒充“真实付款已验证”。
- 数据库里有一张 9.90 元、400 点的 `pending` 测试订单。它不会自动扣款，也不会增加点数。

## 2. 整体架构

```text
用户浏览器
   |
   | HTTPS
   v
Vercel：artigen-fengfan
   |-- Vue 静态前端（匿名访问不唤醒 Render）
   |-- /api、/files、/readyz 按需代理
   |
   v
Render：artigen-app-fengfan
   |-- Express API
   |-- 任务 Worker
   |
   |-- PostgreSQL ----------> Neon / Artigen Production
   |-- 图片文件 ------------> Neon Object Storage（S3 兼容）
   |-- 生图请求 ------------> SiliconFlow
   |-- 验证码 HTTPS --------> Vercel / artigen-mail-relay
   |                            |
   |                            v
   |                         163 SMTP
   |
   |-- 人机验证 ------------> Cloudflare Turnstile
   |-- 支付订单 ------------> 爱发电
```

Render 只运行程序，不保存长期数据。用户、钱包、订单和任务进入 Neon PostgreSQL；
生成图片进入共享对象存储。Render 重启、休眠或重新部署不会删除数据库和已持久化的图片。

## 3. 网站部署在哪里

公开前端现在使用 Vercel 静态托管。匿名访客只浏览页面时不会请求或唤醒 Render；
点击登录、生成、支付等需要服务端的功能时，才通过同源 `/api` 代理连接 Render。
因此首页可以立即显示，但用户当天第一次调用服务端功能时仍可能遇到 Render 冷启动等待。

### 3.1 Render

- 平台：Render
- Workspace：`artigen`
- 服务名：`artigen-app-fengfan`
- 服务 ID：`srv-d9cr73r7uimc73etc4j0`
- 套餐：Free
- 区域：Virginia
- 运行时：Node.js
- 用途：Express API、任务 Worker，以及旧站直连备用入口
- GitHub 仓库：`FengFan-1997/Artigen`
- 部署分支：`main`
- 已验证后端代码提交：`529b73fffcd2f06323ccd373168a5e009f312b5a`
- 已验证生产部署：`dep-d9qsuam417fc7383uj70`
- 当前 `render.yaml` 设置为手动部署，不会因为随便 push 一次就自动上线。

访问 Render：

1. 打开 <https://dashboard.render.com>。
2. 选择 GitHub 登录；当前浏览器的 Render 登录页把 GitHub 标记为上次使用方式。
3. 进入 workspace `artigen`。
4. 打开服务 `artigen-app-fengfan`。

常用页面：

- `Deploys`：看部署是否成功、手动重新部署。
- `Logs`：查启动、验证码、生图和支付错误。
- `Environment`：管理生产环境变量。
- `Metrics`：看 CPU、内存和请求量。
- `Manual Deploy`：手动部署当前分支。

注意：Render Free 空闲约 15 分钟后会休眠。匿名访客打开 Vercel 主站不会唤醒
Render，也不会再看见 Render 的启动黑屏；当天第一次发送验证码、登录、生图或支付时，
该次服务端操作仍可能等待约 1 分钟唤醒，这不是代码崩溃。不要在 Render 本地目录保存
数据库或用户图片，因为免费实例文件系统会丢失。

### 3.2 Vercel 主站

- Team：`FengFan's projects`
- Project：`artigen-fengfan`
- 套餐：Hobby（免费）
- 生产分支：`main`
- 当前生产版本：以 `Deployments` 顶部标记为 `Ready` 的 Production 部署为准
- 主域名：`artigen-fengfan.vercel.app`
- 匿名首页：只加载静态文件，不请求 `/api`
- 服务端操作：通过 Vercel rewrite 按需连接 Render
- 不配置保活任务，不绑定信用卡，不启用付费加速

访问 Vercel 主站项目：

1. 打开 <https://vercel.com/dashboard>。
2. 进入 Team `FengFan's projects`。
3. 打开 Project `artigen-fengfan`。
4. `Deployments` 查看每次部署是否为 `Ready`。
5. `Settings → Domains` 查看主域名。
6. `Settings → Environment Variables` 查看前端构建变量。

Vercel 从 GitHub 仓库 `FengFan-1997/Artigen` 的 `main` 正式版本构建。根目录
`vercel.json` 定义：

- 构建 `frontend/dist`。
- `/api/*`、`/files/*`、`/healthz`、`/readyz` 转发到 Render。
- 其他路径回退到 Vue 的 `index.html`。
- 哈希静态资源长期缓存，`index.html` 不缓存。

## 4. 数据库在哪里

### 4.1 线上数据库：Neon PostgreSQL

- 平台：Neon
- Organization：`Artigen`（Free）
- Project：`Artigen Production`
- 数据库：`neondb`
- PostgreSQL：16
- 当前实测版本：16.14
- 区域：AWS US East 1（N. Virginia）
- 当前 public schema：23 张表
- 当前已有用户：1

登录 Neon：

1. 打开 <https://console.neon.tech>。
2. 当前 Neon 账号邮箱是 `sorates1997@163.com`。
3. 登录方式绑定 GitHub `@fengfan-1997`。
4. 进入 Organization `Artigen`。
5. 打开 Project `Artigen Production`。

最适合新手的查看方式：

1. 在项目左侧打开 `Tables`。
2. 选择 `public` schema。
3. 点表名即可查看数据。
4. 需要查询时打开 `SQL Editor`，先执行只读 SQL。

核心表：

| 表 | 保存什么 |
|---|---|
| `users` | 用户基础信息 |
| `user_identities` | 邮箱等登录身份 |
| `sessions` | HttpOnly Cookie 对应的服务端会话 |
| `otp_challenges` | 经过 HMAC 处理的验证码挑战，不保存明文验证码 |
| `wallets` | 可用点数和冻结点数 |
| `wallet_ledger` | 不可变点数流水 |
| `credit_holds` | 生图任务的预占点数 |
| `payment_packages` | 服务端套餐和价格 |
| `payment_orders` | 本地支付订单 |
| `payment_callback_events` | 支付回调和幂等记录 |
| `tool_tasks` | 生图及统一工具任务 |
| `assets` | 图片 URI、格式、尺寸和校验信息 |
| `usage_events` | 不含原始 prompt 和图片 URL 的脱敏事件 |

安全的只读查询示例：

```sql
SELECT id, email, status, created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;

SELECT user_id, available_credits, frozen_credits, updated_at
FROM wallets
ORDER BY updated_at DESC
LIMIT 20;

SELECT id, provider, expected_amount_minor, expected_credits, status, created_at
FROM payment_orders
ORDER BY created_at DESC
LIMIT 20;

SELECT id, tool_id, operation, status, charged_credits, refunded_credits, created_at
FROM tool_tasks
ORDER BY created_at DESC
LIMIT 20;
```

不要在不理解 SQL 的情况下执行 `DELETE`、`DROP`、`TRUNCATE` 或没有 `WHERE` 的 `UPDATE`。

### 4.2 图片保存在哪里

生成图片不塞进 PostgreSQL，也不放在 Render 临时硬盘。

- 数据库的 `assets` 表只保存 URI、MIME、字节数、宽高、SHA-256 和生命周期。
- 图片二进制保存在 S3 兼容的共享对象存储。
- Neon 控制台中另有 `Artigen Object Storage` 项目。
- Render 的 `/readyz` 当前返回 `storage.ok=true`、`driver=s3`、`shared=true`。

### 4.3 本机数据库

本机已安装并启动 PostgreSQL 16：

- 地址：`127.0.0.1:5432`
- 角色：`artigen`
- 开发库：`artigen_dev`
- 测试库：`artigen_test`
- 恢复演练库：`artigen_restore_verify`

本地数据库只用于开发、自动测试和恢复演练，Render 不连接你的 Mac。

检查本地 PostgreSQL：

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_isready -h 127.0.0.1 -p 5432
```

重新幂等初始化：

```bash
cd /Users/fengfan/Public/personal/FengFan-1997.github.io
pnpm run db:local:setup
```

本地连接配置保存在 `backend/.env`。这个文件权限是 `0600`，并已被 Git 忽略。

### 4.4 命令行连接生产 Neon

生产连接串在 macOS 钥匙串中，服务名是
`Artigen Neon Production Direct URL`。不要把它复制到聊天、截图或 Git。

```bash
export DATABASE_URL="$(
  security find-generic-password \
    -s 'Artigen Neon Production Direct URL' \
    -w
)"
export DATABASE_URL="${DATABASE_URL/sslmode=verify-full/sslmode=require}"

/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL"
```

结束后关闭终端，或执行：

```bash
unset DATABASE_URL
```

## 5. 邮箱验证码为什么现在能发

### 5.1 原来的问题

Render Free 禁止程序访问常见 SMTP 端口 `25`、`465`、`587`。因此：

```text
Render -> 163 SMTP
```

会被平台网络规则拦住。验证码业务代码本身并不是主要故障。

Brevo 和 Mailjet 方案也曾尝试过，但第三方邮件平台账号被风控或终止，
所以生产环境现在不依赖它们。

### 5.2 现在的解决方案

当前链路：

```text
Render
  -> HTTPS 443 + HMAC 签名
  -> https://artigen-mail-relay.vercel.app/api/send-otp
  -> Vercel Serverless Function
  -> 163 SMTP
  -> 任意收件邮箱（包括 QQ 邮箱）
```

发件人：

- `Artigen <sorates1997@163.com>`

已真实验证的收件人：

- `876458930@qq.com`

也就是说，不是“163 只能给 163 发”。163 SMTP 可以向 QQ 邮箱投递，
只是邮件可能偶尔进入垃圾箱。

### 5.3 为什么还需要 Cloudflare Turnstile

任何人都能访问公开登录页。如果没有人机验证，机器人可以无限发送验证码，
导致邮箱被封或额度被耗尽。

Cloudflare Turnstile 在浏览器完成挑战，Render 服务端再验证 Token：

- Cloudflare 账号：`sorates1997@163.com`
- Widget：`Artigen Production`
- 允许 hostname：
  - `artigen-fengfan.vercel.app`
  - `artigen-app-fengfan.onrender.com`
- 模式：Managed

OTP 仍有服务端保护：

- 6 位数字。
- 10 分钟有效。
- 60 秒冷却。
- 最多尝试 5 次。
- 一次性消费。
- 邮箱/IP/全站限流。
- 浏览器使用 `Idempotency-Key`，网络重试不会重复发邮件。
- 数据库不保存明文验证码。

### 5.4 Vercel 邮件中继在哪里

- Vercel Team：`FengFan's projects`
- 套餐：Hobby
- 当前账号显示：`876458930-7565` / `FengFan`
- Project：`artigen-mail-relay`
- 公开函数域名：<https://artigen-mail-relay.vercel.app>

访问：

1. 打开 <https://vercel.com/dashboard>。
2. 进入 `FengFan's projects`。
3. 打开 `artigen-mail-relay`。
4. `Logs` 查投递问题。
5. `Settings → Environment Variables` 管理邮件配置。

Vercel 中继当前保存 6 个生产变量：

- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_TIMEOUT_MS`
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAIL_RELAY_SHARED_SECRET`

其中 `SMTP_PASS` 是 163 SMTP 授权码，不是邮箱登录密码。

## 6. 生图和编辑器

生产图片 Provider 是 SiliconFlow；Agent 的非生图文本 Provider 是 Cloudflare Workers AI。核心代码还做了模型白名单锁定：

- 生图只能使用 `Kwai-Kolors/Kolors`。
- 对话、规划、方向生成、验证和 Agent 文本只能使用 Cloudflare `@cf/openai/gpt-oss-120b`。
- 不允许客户端传内部模型 ID。
- 不允许客户端传价格。
- 当前不启用第三个模型。

生产流程：

```text
输入需求
  -> 服务端报价
  -> 用户确认
  -> 预占点数
  -> PostgreSQL 队列
  -> Cloudflare 文本 / SiliconFlow Kolors 图片
  -> 校验 MIME/尺寸/来源
  -> 保存对象存储
  -> 成功结算
  -> opaque asset
  -> transferId
  -> Editor V2
```

SiliconFlow 图片 API Key 与 Cloudflare 文本凭据只保存在 Render 环境变量和 macOS 钥匙串中；
Cloudflare 必须绑定已确认的免费账户声明，禁止回退到收费文本模型。不要把任何平台账号或密钥写入文档。

## 7. 支付是什么状态

支付 Provider：爱发电。

- 创作者账号手机号：`17662591191`
- 创作者页：`fengfan1997`
- Webhook：
  `https://artigen-app-fengfan.onrender.com/api/pay/afdian/webhook`
- 四个套餐：9.90 / 19.90 / 49.90 / 99.90 元
- 对应点数：400 / 1000 / 3000 / 10000
- 服务端通过爱发电官方查询 API 核对订单、方案和金额后才入账。
- 客户端不能告诉服务端“我付了多少钱”或“给我多少点”。

已验证：

- 套餐能从服务端读取。
- 9.90 元套餐能创建本地 `pending` 订单。
- 能打开正确的爱发电 9.90 元结算页。
- 爱发电 API 凭证有效。
- 官方订单查询接口返回正常。
- webhook 测试返回成功。
- webhook 测试数据不会污染真实订单。
- 重复回调不会重复入账。

未验证：

- 没有真实支付，因此没有真实 `paid` 订单和 400 点真实入账记录。

当前测试账户：

- Artigen 登录邮箱：`876458930@qq.com`
- 当前钱包：90 可用点，0 冻结点
- 当前待支付测试订单：9.90 元、400 点、`pending`
- 未发生扣款，余额没有增加。

## 8. 各个平台用什么账号

| 平台 | 用途 | 当前账号/登录方式 |
|---|---|---|
| GitHub | 代码仓库 | `FengFan-1997` |
| Vercel 主站 | 静态网页和同源代理 | `876458930-7565` / `FengFan`；team `FengFan's projects`；project `artigen-fengfan` |
| Render | API 和任务 Worker | GitHub 登录；workspace `artigen`；service `artigen-app-fengfan` |
| Neon | PostgreSQL 和对象存储 | `sorates1997@163.com`，绑定 GitHub `@fengfan-1997` |
| Vercel 邮件中继 | 邮件 HTTPS 中继 | 同一个 Vercel 账号和 team；project `artigen-mail-relay` |
| Cloudflare | Turnstile 人机验证 | `sorates1997@163.com` |
| 163 邮箱 | 验证码发件箱 | `sorates1997@163.com` |
| 爱发电 | 点数支付 | 手机号 `17662591191`，创作者 `fengfan1997` |
| SiliconFlow | 生图 API | Key 已配置；平台登录账号未记录 |
| Artigen 测试用户 | 线上业务验收 | `876458930@qq.com` |

## 9. 环境变量保存在哪里

先理解“环境变量”：它们是部署平台替程序保管的配置和密钥。代码里只写变量名，
运行时再由平台注入真实值。这样 GitHub 里没有数据库密码、邮箱授权码和 API Key。

### 9.1 Render：主应用生产变量

位置：

```text
Render
  -> artigen-app-fengfan
  -> Environment
```

当前约有 52 个变量。以后增删变量时，以 Render Environment 页面实际显示为准。
按用途分组：

**数据库**

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `PG_POOL_MAX`

**认证和安全**

- `APP_ORIGIN`
- `CORS_ORIGINS`
- `TRUST_PROXY`
- `CSRF_SECRET`
- `OTP_HMAC_SECRET`
- `SESSION_TOKEN_HASH_SECRET`
- `SESSION_NOT_BEFORE`
- `CONSOLE_ADMIN_TOKEN_SECRET`

**邮件和 Turnstile**

- `AUTH_EMAIL_OTP_ENABLED`
- `MAIL_PROVIDER`
- `MAIL_RELAY_URL`
- `MAIL_RELAY_SHARED_SECRET`
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAIL_TIMEOUT_MS`
- `TURNSTILE_REQUIRED`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_HOSTNAMES`
- `VITE_TURNSTILE_SITE_KEY`

**生图和队列**

- `PAID_FEATURES_ENABLED`
- `AI_DESIGN_TASK_V2_ENABLED`
- `WORKSHOP_AI_TASK_V2_ENABLED`
- `AI_DESIGN_TASK_V2_ROLLOUT_PERCENT`
- `TASK_WORKER_ENABLED`
- `TASK_PAYLOAD_ENCRYPTION_KEY`
- `SILICONFLOW_API_KEY`
- `AI_OUTPUT_ALLOWED_HOSTS`

**对象存储**

- `ASSET_STORAGE_DRIVER`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

**支付**

- `PAYMENTS_ENABLED`
- `AFDIAN_API_USER_ID`
- `AFDIAN_API_TOKEN`
- `AFDIAN_ORDER_CREATE_URL`
- `AFDIAN_PAGE_URL`
- `AFDIAN_QUERY_ORDER_URL`
- `AFDIAN_WEBHOOK_REQUIRE_SIGN`
- `AFDIAN_PACKAGE_PLAN_ID_MAP`

**运行时**

- `NODE_ENV`
- `NODE_VERSION`

不要使用 Render 的 `Export` 后把结果发到聊天、邮件或提交 Git。

### 9.2 Vercel：主站前端变量

位置：

```text
Vercel
  -> FengFan's projects
  -> artigen-fengfan
  -> Settings
  -> Environment Variables
```

当前生产和 Preview 都配置：

- `VITE_LAZY_BACKEND=1`：新匿名访客只浏览页面时不请求 Render。
- `VITE_TURNSTILE_SITE_KEY`：Cloudflare Turnstile 的公开 Site Key。

Site Key 可以出现在前端，Secret Key 绝对不能放进前端变量。

`VITE_API_BASE` 和 `VITE_AGENT_API_BASE` 不配置；前端使用同源 `/api`，
再由 `vercel.json` 转发到 Render。

### 9.3 Vercel：邮件中继变量

位置：

```text
Vercel
  -> FengFan's projects
  -> artigen-mail-relay
  -> Settings
  -> Environment Variables
```

这里保存 163 SMTP 用户、授权码、发件人和 Render/Vercel 共享签名密钥。

### 9.4 Cloudflare：Turnstile

位置：

```text
Cloudflare
  -> Turnstile
  -> Artigen Production
```

- Site Key 给前端，生产副本放在 Vercel 主站 `VITE_TURNSTILE_SITE_KEY`；
  Render 也保留一份用于 `/readyz` 完整性检查。
- Secret Key 只给后端，生产副本放在 Render `TURNSTILE_SECRET_KEY`。

### 9.5 本机开发环境

文件：

```text
/Users/fengfan/Public/personal/FengFan-1997.github.io/backend/.env
```

- 权限：`0600`
- Git 状态：已忽略
- 只用于本机
- 不能认为它和 Render 当前配置完全相同

### 9.6 macOS 钥匙串

重要连接和密钥还有一份本机安全副本，服务名包括：

- `Artigen Neon Production Direct URL`
- `Artigen SiliconFlow API Key`
- `Artigen 163 SMTP Authorization Code`
- `Artigen Mail Relay Shared Secret`
- `Artigen Turnstile Site Key`
- `Artigen Turnstile Secret Key`
- `Artigen Afdian API User ID`
- `Artigen Afdian API Token`
- `Artigen OTP HMAC Secret`
- `Artigen Session Token Hash Secret`
- `Artigen CSRF Secret`
- `Artigen Task Payload Encryption Key`
- Neon Object Storage 相关 Token/Key

读取某个值的命令格式：

```bash
security find-generic-password -s '服务名' -w
```

只有在确实需要时读取。不要截图、录屏或把输出粘贴到聊天。

## 10. 日常排障顺序

### 网站打不开

1. 先打开 Vercel 主站 `/artigen`。普通首页应直接出现，不需要等待 Render。
2. 若首页打不开，去 Vercel `artigen-fengfan → Deployments` 看是否为 `Ready`。
3. 若首页能开、但登录/生图/支付一直转圈，最多等 60 秒让 Render Free 唤醒。
4. 打开 `/healthz`，再打开 `/readyz`。
5. 去 Render `Deploys` 看是否为 Live。
6. 去 Render `Logs` 看启动错误。

### 验证码收不到

1. 检查垃圾箱。
2. 检查页面 Turnstile 是否完成。
3. 打开 `/readyz`，确认 `mail.ok` 和 `turnstile.ok`。
4. 去 Render Logs 查签名/限流错误。
5. 去 Vercel `artigen-mail-relay → Logs` 查 SMTP 结果。
6. 检查 Vercel 的 `SMTP_PASS` 是否仍是有效的 163 授权码。
7. 不要短时间不断点击发送，否则会触发冷却和限流。

### 生图失败

1. 打开 `/readyz`，确认 `database`、`storage`、`provider` 和 `payload` 都是 `ok`。
2. 看 Render Logs 中的 taskId 和错误码。
3. 在 Neon `tool_tasks` 查任务状态。
4. 检查钱包是否已退款、`credit_holds` 是否仍有未结算 hold。
5. 不要把用户 prompt、图片 URL 或 API Key 粘到公开工单。

### 支付后没到账

1. 在爱发电确认真实订单状态。
2. 在 Neon `payment_orders` 查本地订单。
3. 在 `payment_callback_events` 查回调。
4. 在 Render Logs 查爱发电官方查询结果。
5. 不要手工直接改 `wallets`；必须通过账本化补偿流程。

## 11. 当前仍需补上的运维事项

1. 真实支付没有执行，因此真实支付入账仍未验收。
2. `~/.config/artigen/neon-backup.env` 当前不存在，说明每日 Neon `pg_dump`
   和每周恢复演练还没有真正启用。
3. Render Free 会休眠，不是商业 SLA。
4. `render.yaml` 是安全关闭功能的模板；Render Dashboard 当前有生产覆盖值。
   不要在不了解差异时用 Blueprint 覆盖 Dashboard 环境。
5. 模型 ID 固定在服务端 allowlist：所有图片任务使用 `Kwai-Kolors/Kolors`，所有非生图文字任务使用
   Cloudflare `@cf/openai/gpt-oss-120b`；Render 环境不应再覆盖模型 ID。
6. 生产来源已经切换到 `main`；后续仍必须从经过 DEV 和 Release gate 验证的不可变
   `main` SHA 人工发布，并通过 `/api/meta` 和平台 deployment 核对真实线上版本。

## 12. 一句话记忆

- 用户网页在 Vercel `artigen-fengfan`。
- API 和任务 Worker 在 Render `artigen-app-fengfan`。
- 业务数据在 Neon PostgreSQL。
- 图片在 Neon S3 兼容对象存储。
- 验证码由 Render 通过 HTTPS 交给 Vercel `artigen-mail-relay`，再由 163 SMTP 发出。
- Turnstile 在 Cloudflare。
- 文本在 Cloudflare `@cf/openai/gpt-oss-120b`，图片在 SiliconFlow `Kwai-Kolors/Kolors`。
- 支付在爱发电，但真实扣款尚未执行。
- 生产密钥主要在 Render/Vercel，安全副本在 macOS 钥匙串，绝不进 Git。

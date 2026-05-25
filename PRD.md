# Artigen PRD

本文档面向后端协作者，描述 Artigen 当前已经落地的产品模块、前后端连接方式、接口边界、认证方式、点数/支付流程、生成流程、图片文件访问规则与运行期数据文件。本文只记录现状和约定。

## 1. 产品范围

Artigen 当前包含以下产品模块：

- Artigen 首页：`/artigen`
- AI 生图工作台：`/artigen/ai`
- 格式工厂和工具箱：`/artigen/tools`
- AI 影像工坊：`/artigen/image-workshop`
- 图片编辑器：`/artigen/image-editor`
- AI 配料表：工具箱入口和 `IngredientLabel` 页面组件链路
- 点数商城：`/artigen/market`
- 订单记录：`/artigen/orders`
- 用量记录：`/artigen/usage`
- 法律页：`/artigen/legal/terms`、`/artigen/legal/privacy`、`/artigen/legal/refund`
- 登录/注册/找回密码：`/login`
- 后台控制台：`/console/*`

保留的兼容入口：

- `/agent-img` -> `/artigen/ai`
- `/format-factory` -> `/artigen/tools`
- `/tools` -> `/artigen/tools`
- `/aether-market` -> `/artigen/market`
- `/legal/*` -> `/artigen/legal/*`
- `/console2` -> `/console`

## 2. 前后端连接方式

前端统一通过 `frontend/src/utils/api.ts` 构造请求地址。

API Base 规则：

- 优先读取 `VITE_API_BASE`。
- `VITE_API_BASE` 为空时读取 `VITE_AGENT_API_BASE`。
- 两者都为空时使用同源相对路径，例如 `/api/generate`、`/files/...`。
- Base 支持 `http://`、`https://`、`//` 和 `/` 开头的路径。
- Base 如果以 `/api` 结尾，`buildApiUrl('/api/health')` 会合并为 `${base}/health`。
- 当前页面不是本地地址时，指向 `localhost`、`127.0.0.1`、`0.0.0.0` 或 `.local` 的 Base 会被忽略。
- Vite 开发服务在 `frontend/vite.config.ts` 中把 `/api` 和 `/files` 代理到 `http://localhost:8080`。

前端主要调用入口：

| 文件 | 职责 | 主要接口 |
| --- | --- | --- |
| `frontend/src/agentImg/services/text.ts` | AI 文本生成、图生图请求、返回值归一化 | `/api/generate`、`/api/img2img` |
| `frontend/src/agentImg/composables/useAgentImgHistory.ts` | 图片历史读取 | `/api/images/history/:userId` |
| `frontend/src/agentImg/index.vue` | AI 生图主页面文件访问和代理 | `/files/*`、`/api/proxy/image` |
| `frontend/src/agentImg/views/ImageEditor.vue` | 图片编辑器文件读取和远程图片代理 | `/files/*`、`/api/proxy/image` |
| `frontend/src/points/index.ts` | 点数、订单、支付 | `/api/credits/*`、`/api/pay/create-order` |
| `frontend/src/login/api.ts` | 邮箱验证码、账号密码、注册、重置、Google 登录 | `/api/login/*`、`/api/auth/*` |
| `frontend/src/utils/analytics.ts` | 行为埋点 | `/api/collection/event` |
| `frontend/src/stores/console.ts` | 后台控制台数据 | `/api/admin/*`、`/api/usage/*` |

## 3. 后端模块职责

| 模块 | 职责 |
| --- | --- |
| `backend/server.js` | Express 入口、环境变量加载、CORS、JSON body、总限流、`/files`、图片代理、Google GSI 代理、路由安装。 |
| `backend/routes/system.js` | `/api/meta`、`/api/health`、`/api/generate`，包含 Artigen prompt 生成、AI 配料表 prompt 生成、点数冻结和 usage/audit 写入。 |
| `backend/imgagent/index.js` | `/api/img2img`、点数接口、支付接口、图片历史、用户 profile/api keys。 |
| `backend/routes/auth.js` | 邮箱验证码登录、账号密码登录、注册、密码重置、Google 登录。 |
| `backend/routes/admin.js` | 控制台登录、用户、订单、图片历史、审计历史、事件、限流统计、管理员调点。 |
| `backend/routes/usage.js` | 行为事件、usage ingest、usage ledger、usage summary、管理员 usage ledger。 |
| `backend/lib/ai-providers.js` | Gemini 文本生成、SiliconFlow 文本生成、SiliconFlow 图片生成、provider fallback。 |
| `backend/lib/auth-utils.js` | 用户 token、管理员 token、密码哈希、鉴权断言、用户读取。 |
| `backend/lib/memory-manager.js` | 图片持久化、用户图片历史、用户审计历史。 |
| `backend/lib/usageLedger.js` | usage ledger 和 analytics event 的读写与归一化。 |
| `backend/imgagent/credits.js` | 钱包、冻结、扣点、发点、订单 ledger。 |
| `backend/utils/storage.js` | `MEMORY_DIR`、JSON 文件路径、目录自动创建和原子写入。 |

## 4. 接口清单

### 系统与生成

| Method | Path | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/meta` | 无 | 返回构建和运行基础信息。 |
| `GET` | `/api/health` | 无 | 返回服务、provider、存储状态。 |
| `POST` | `/api/generate` | 游客可用；登录用户用 Bearer/Cookie | 文本生成、Artigen prompt 生成、AI 配料表 prompt 生成。 |
| `POST` | `/api/img2img` | 游客可用；非游客需要 Bearer/Cookie 匹配 `userId` | 图生图、证件照、老照片、背景、图片编辑等图片生成链路。 |
| `GET` | `/api/proxy/image?url=` | 无 | 安全代理远程图片，限制协议、跳转、大小和 content-type。 |
| `GET` | `/api/proxy/google-gsi` | 无 | 代理 Google GSI client 脚本。 |
| `GET` | `/files/*` | 见文件访问规则 | 读取 `MEMORY_DIR/files` 下的生成文件。 |

### 登录与认证

| Method | Path | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/auth/google/config` | 无 | 返回 Google client id。 |
| `POST` | `/api/auth/google/verify` | 无 | 校验 Google credential，创建/更新用户 session。 |
| `POST` | `/api/login/send-code` | 无 | 发送邮箱验证码。 |
| `POST` | `/api/login/verify` | 无 | 邮箱验证码登录，返回 `userId` 和 `token`。 |
| `POST` | `/api/auth/login` | 无 | 用户名/邮箱 + 密码登录，返回 `userId` 和 `token`。 |
| `POST` | `/api/auth/register` | 无 | 邮箱验证码 + 用户名 + 密码注册，返回 `userId` 和 `token`。 |
| `POST` | `/api/auth/password-reset/send-code` | 无 | 发送重置密码验证码。 |
| `POST` | `/api/auth/password-reset/reset` | 无 | 验证重置码并更新密码。 |

### 用户、点数、支付、历史

| Method | Path | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/user/profile` | Bearer/Cookie | 读取用户 profile。 |
| `POST` | `/api/user/profile` | Bearer/Cookie | 保存用户 profile。 |
| `GET` | `/api/user/apikeys` | Bearer/Cookie | 读取用户 API Key 列表。 |
| `POST` | `/api/user/apikeys` | Bearer/Cookie | 新增用户 API Key。 |
| `DELETE` | `/api/user/apikeys/:keyId` | Bearer/Cookie | 删除用户 API Key。 |
| `GET` | `/api/credits/balance?userId=` | Bearer/Cookie 匹配 `userId` | 点数余额。 |
| `GET` | `/api/credits/costs` | 无 | 当前各功能点数成本。 |
| `POST` | `/api/credits/checkin` | Bearer/Cookie | 签到加点。 |
| `GET` | `/api/credits/orders?userId=` | Bearer/Cookie 匹配 `userId` | 点数订单。 |
| `GET` | `/api/credits/holds?userId=` | Bearer/Cookie 匹配 `userId` | 点数冻结记录。 |
| `POST` | `/api/credits/order/mock` | Bearer/Cookie；需 `ENABLE_MOCK_ORDERS=1` | Mock 点数订单。 |
| `POST` | `/api/pay/create-order` | Bearer/Cookie | 创建支付订单。 |
| `POST` | `/api/pay/afdian/webhook` | 签名按环境变量决定 | 爱发电 webhook 入账。 |
| `GET` | `/api/images/history/:userId` | Bearer/Cookie 匹配 `userId` | 用户图片历史。 |

### Usage 与行为事件

| Method | Path | 认证 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/collection/event` | 无 | 前端行为事件采集。 |
| `POST` | `/api/usage/ingest` | Bearer/Cookie 匹配 `userId` | 写入 usage ledger。 |
| `GET` | `/api/usage/ledger?userId=` | Bearer/Cookie 匹配 `userId` | 用户 usage ledger。 |
| `GET` | `/api/usage/summary?userId=` | Bearer/Cookie 匹配 `userId` | 用户用量汇总。 |

### 控制台

控制台接口使用以下任一认证方式：

- `Authorization: Bearer <adminToken>`，token 来自 `/api/admin/login`。
- `x-admin-key: <ADMIN_KEY>`，key 来自环境变量。

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 控制台账号登录，返回 admin token。 |
| `GET` | `/api/admin/users` | 用户列表、访问统计、钱包摘要。 |
| `POST` | `/api/admin/users/credits` | 管理员调整用户点数。 |
| `GET` | `/api/admin/orders` | 支付订单和点数订单聚合。 |
| `GET` | `/api/admin/credits/holds` | 点数冻结记录。 |
| `GET` | `/api/admin/images/history` | 全站图片历史。 |
| `GET` | `/api/admin/audit/history` | 全站审计历史。 |
| `GET` | `/api/admin/chats/history` | 历史调用记录兼容读取。 |
| `GET` | `/api/admin/events` | 后端记录的事件。 |
| `GET` | `/api/admin/collection/events` | 前端行为事件。 |
| `GET` | `/api/admin/usage/ledger` | 全站 usage ledger。 |
| `GET` | `/api/admin/ratelimit/stats` | 限流统计。 |

## 5. 认证方式

普通用户：

- 登录、注册、Google 登录成功后，后端返回 `token`，并写入 `auth_token` HttpOnly Cookie。
- 前端同时把 token 保存在本地 session 中，后续请求发送 `Authorization: Bearer <token>`。
- 后端通过 `resolveAuthUser` 查 `users.json` 中的 `sessionToken`。
- 涉及 `userId` 的接口会校验 token 对应用户与请求 `userId` 一致。
- 游客用户 ID 以 `guest_` 开头，AI 生成和图生图链路保留游客能力；游客转登录时会合并游客数据到正式用户。

管理员：

- `/api/admin/login` 使用 `CONSOLE_ADMIN_USERNAME` 和 `CONSOLE_ADMIN_PASSWORD` 校验，返回 admin token。
- `ADMIN_KEY` 可直接作为 `x-admin-key` 访问控制台接口。
- 控制台前端会根据 token 形态选择 Bearer 或 `x-admin-key`。

## 6. 点数与支付流程

点数字段：

- 钱包文件：`credits_wallet.json`
- 冻结文件：`credits_holds.json`
- 点数订单：`credits_orders.json`
- 支付订单：`pay_orders.json`

点数成本：

- 前端通过 `/api/credits/costs` 获取成本。
- 后端默认成本在 `backend/imgagent/index.js` 和 `backend/routes/system.js` 中解析。
- AI 配料表成本字段是 `aiIngredientList`，环境变量是 `CREDITS_COST_AI_INGREDIENT_LIST`。

生成扣点流程：

1. 前端提交 `/api/generate` 或 `/api/img2img`，携带 `userId`、`requestId`、`purpose` 或 `reason`、`cost`、`sessionId`、`projectId`、`pageContext`。
2. 后端根据请求中的 `cost` 或后端成本表计算本次成本。
3. 对需要扣点的请求创建 hold。
4. provider 成功返回后确认扣点，并写入图片历史、audit history、usage ledger。
5. provider 失败或请求失败时释放 hold。

支付流程：

1. 前端在商城调用 `/api/pay/create-order`。
2. 后端创建 `pay_orders.json` 订单，返回订单状态和支付信息。
3. 爱发电回调 `/api/pay/afdian/webhook`。
4. 后端按订单和回调内容确认金额、发放点数、写入 `credits_orders.json` 和 `credits_wallet.json`。
5. 前端订单页从 `/api/credits/orders` 读取用户订单。

## 7. AI 生成流程

文本生成入口：`POST /api/generate`

主要请求字段：

- `prompt`：直接发送给文本 provider 的 prompt。
- `purpose`：业务目的，例如 `agentimg_directions`、`agentimg_final`、`agentimg_ingredient_label`、`ingredient_label`。
- `agentImg` / `ingredient`：业务结构化输入，后端按 purpose 生成 prompt。
- `images`：图片参考。
- `model`：前端当前选择模型。
- `userId`、`requestId`、`sessionId`、`projectId`、`requestSource`、`pageContext`：身份、幂等、统计和审计上下文。
- `cost`：前端传入的点数成本。
- `deepMode`、`initialInput`、`userText`：AI 生图深度分析链路上下文。

AI 配料表链路：

1. 前端入口保留在工具箱中。
2. 页面组件是 `frontend/src/agentImg/views/IngredientLabel.vue`。
3. 类型选择组件是 `frontend/src/agentImg/components/IngredientLabelTypeSelect.vue`。
4. 前端本地解析和格式逻辑在 `frontend/src/agentImg/logic/formatFactory/ingredientLabel.ts`。
5. 后端 `/api/generate` 接收 `purpose=agentimg_ingredient_label` 或 `purpose=ingredient_label`。
6. 后端通过 `buildIngredientLabelPrompt` 生成提示词，再调用当前文本 provider。
7. 成本归类为 `aiIngredientList`。

图生图入口：`POST /api/img2img`

主要请求字段：

- `userId`
- `requestId`
- `prompt`
- `negativePrompt`
- `model`
- `params`
- `images`
- `timeoutMs`
- `userText`
- `reason`
- `cost`

后端返回图片 URL 后，会把远程图片持久化到 `/files/<userId>/...` 或 `/files/guest_.../...`，并写入用户图片历史。

## 8. 图片文件访问规则

文件根目录：`${MEMORY_DIR}/files`

访问入口：`GET /files/*`

规则：

- 请求路径会做 decode 和 path resolve，不能越过 `FILES_DIR`。
- 路径至少包含用户目录和文件名。
- `guest_` 开头的用户目录按公开缓存处理，响应 `Cache-Control: public, max-age=2592000`。
- 非游客用户目录需要满足以下任一条件：
  - Bearer token 对应用户 ID 等于路径中的用户目录。
  - Cookie `auth_token` 对应用户 ID 等于路径中的用户目录。
  - 查询参数 token 对应用户 ID 等于路径中的用户目录。
  - 管理员 Bearer token 或 `x-admin-key` 通过。
- 非游客文件响应 `Cache-Control: private, max-age=2592000` 并设置 `Vary: Authorization, Cookie`。
- `/api/proxy/image` 用于读取远程图片，代理会限制协议、跳转、host、文件大小和图片 content-type。

## 9. 运行期数据文件

默认 `MEMORY_DIR`：

- 环境变量 `MEMORY_DIR` 有值时使用该路径。
- 否则非 Windows 且存在 `/data` 时使用 `/data`。
- 否则使用 `backend/memory`。

文件说明：

| 文件 | 内容 |
| --- | --- |
| `users.json` | 用户账号、邮箱、用户名、session token、密码哈希。 |
| `credits_wallet.json` | 用户可用点数、冻结点数和钱包流水摘要。 |
| `credits_holds.json` | 生成中的点数冻结记录。 |
| `credits_orders.json` | 点数发放、消耗、管理员调整、支付入账记录。 |
| `pay_orders.json` | 支付订单和 webhook 状态。 |
| `usage_ledger.json` | 生成、provider、token、点数、状态和耗时记录。 |
| `analytics_events.json` | 页面访问、按钮点击、工具使用等前端行为事件。 |
| `chats.json` | 历史调用记录兼容数据，控制台仍可读取。 |
| `user_<userId>.json` | 单用户 profile、图片历史、审计历史等。 |
| `files/` | 生成图、输入图持久化文件、测试图片。 |

当前仓库不依赖提交本地 `backend/memory` 数据。目录不存在时，后端启动会自动创建 `MEMORY_DIR` 和 `files/`；具体 JSON 文件会在对应业务首次读写时生成。

## 10. 验证命令

前端：

```bash
pnpm --dir frontend run type-check
pnpm --dir frontend run test
pnpm --dir frontend run build
```

后端：

```bash
find backend -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
```

本地 API smoke：

```bash
curl -sS http://localhost:8080/api/meta
curl -sS http://localhost:8080/api/health
curl -sS http://localhost:8080/api/credits/costs
curl -sS http://localhost:8080/api/auth/google/config
```

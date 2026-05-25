# Artigen

> Artigen 是一个面向图片生产和图片处理的 AI 工具站。
> 它把 AI 生图、图生图、图片编辑、格式工具箱、AI 配料表、点数支付和后台控制台放在同一个 Vue + Express 项目里。

---

## 30 秒速览

**这是什么** - Artigen 是一个 AI 影像工具平台。用户可以在 `/artigen/ai` 做 AI 生图和深度提示词优化，在 `/artigen/tools` 使用格式工厂和 AI 配料表，在 `/artigen/image-editor` 做图片编辑，在 `/artigen/market` 购买或查看点数，管理员在 `/console` 查看用户、生成历史、审计、订单、行为事件和系统健康。

**给谁用** - 面向需要快速生成、处理、整理图片资产的个人创作者、电商运营、产品设计和内容团队。普通用户主要使用 Artigen 主站，管理员和运营使用控制台。

**解决什么** - 把“生成图片”“编辑图片”“转换格式”“做配料表”“点数扣费”“支付入账”“审计追踪”放进同一个闭环，避免前端页面、后端接口、支付和运营数据散在多个旧项目里。

**一句话架构** - 前端是 Vue 3 + Vite 的单页应用，核心业务集中在 `frontend/src/agentImg`；后端是 Express 服务，核心业务集中在 `backend/routes/*` 和 `backend/imgagent`；运行期数据默认写入 `backend/memory` 或部署平台的 `/data`。

**当前边界** - 这个仓库已经做过剔除式独立，只保留 Artigen。旧个人主页、旧 Agent/Live2D/VRM、旧项目页、旧 room、旧 ChristmasTree、旧独立 Ingredient 页面、旧 HF/RAG/ModeDoc 接口和脚本都已经从当前业务边界移除。

---

## 角色入口

### 前端协作者

先读这几个文件：

1. `frontend/src/router/index.ts` - 全站路由、重定向和 SEO meta。
2. `frontend/src/agentImg/index.vue` - AI 生图主工作台。
3. `frontend/src/agentImg/views/FormatFactory.vue` - 格式工厂页面。
4. `frontend/src/agentImg/views/ImageWorkshop.vue` - AI 影像工坊页面，包含 AI 配料表入口。
5. `frontend/src/agentImg/views/ImageEditor.vue` - 图片编辑器。
6. `frontend/src/agentImg/services/text.ts` - 前端调用 `/api/generate` 和 `/api/img2img` 的主入口。
7. `frontend/src/points/index.ts` - 点数、订单、支付相关前端 API。
8. `frontend/src/login/api.ts` - 登录、注册、验证码、Google 登录前端 API。

### 后端协作者

先读这几个文件：

1. `PRD.md` - 后端协作的接口、数据和流程约定。
2. `backend/server.js` - Express 入口、CORS、限流、文件访问、代理和路由安装。
3. `backend/routes/system.js` - `/api/meta`、`/api/health`、`/api/generate`。
4. `backend/imgagent/index.js` - `/api/img2img`、点数、支付、图片历史。
5. `backend/routes/auth.js` - 邮箱验证码、密码登录、注册、密码重置、Google 登录。
6. `backend/routes/admin.js` - 控制台管理接口。
7. `backend/routes/usage.js` - 行为事件和 usage ledger。
8. `backend/lib/ai-providers.js` - Gemini 和 SiliconFlow provider 调用。
9. `backend/utils/storage.js` - `MEMORY_DIR` 和 JSON 文件读写。

### 运营或产品协作者

先看这些入口：

1. `/artigen` - 用户看到的产品首页。
2. `/artigen/ai` - AI 生图主流程。
3. `/artigen/tools` - 格式工厂和工具箱。
4. `/artigen/image-workshop` - 影像工坊和 AI 配料表。
5. `/artigen/market` - 点数商城。
6. `/console` - 后台用户、订单、审计和用量数据。
7. `PRD.md` - 当前产品模块和接口现状。

---

## 快速上手

### 前置依赖

| 工具 | 必装 | 说明 |
| --- | --- | --- |
| Node.js | 是 | 建议使用当前项目锁文件兼容的 LTS 版本。 |
| pnpm | 是 | 项目使用 pnpm 和多个 lockfile。 |
| Git | 是 | 用于协作、提交和部署。 |
| Gemini 或 SiliconFlow API Key | 线上需要 | 本地没有 key 时，AI provider 相关接口返回 offline 或配置错误属于正常现象。 |
| QQ SMTP 配置 | 登录验证码需要 | 本地可用测试验证码开关绕过真实邮件发送。 |

### 安装依赖

在仓库根目录执行：

```bash
pnpm install
pnpm run install:all
```

`install:all` 会分别安装 `backend` 和 `frontend` 的依赖：

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
```

### 本地启动

同时启动前后端：

```bash
pnpm run dev
```

默认地址：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 前端 Vite dev server | `http://localhost:4000` | 页面入口。 |
| 后端 Express server | `http://localhost:8080` | API 和 `/files`。 |
| Vite dev proxy | `/api`、`/files` | 代理到 `http://localhost:8080`。 |

单独启动：

```bash
pnpm --dir backend run dev
pnpm --dir frontend run dev
```

### 构建和预览

```bash
pnpm --dir frontend run type-check
pnpm --dir frontend run test
pnpm --dir frontend run build
pnpm --dir frontend run preview
```

根目录构建：

```bash
pnpm run build
```

构建产物在：

```text
frontend/dist
```

### 后端语法检查

```bash
find backend -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
```

---

## 代码阅读路线

### 路线 A: 从页面进入

想知道用户从哪里点到哪里：

1. `frontend/src/router/index.ts`
2. `frontend/src/agentImg/views/LandingPage.vue`
3. `frontend/src/agentImg/index.vue`
4. `frontend/src/agentImg/views/FormatFactory.vue`
5. `frontend/src/agentImg/views/ImageWorkshop.vue`
6. `frontend/src/agentImg/views/ImageEditor.vue`
7. `frontend/src/agentImg/views/AetherMarket.vue`
8. `frontend/src/console/ConsoleLayout.vue`

### 路线 B: 从 AI 生成链路进入

想知道 AI 生图和图生图怎么跑：

1. `frontend/src/agentImg/composables/useAgentImgGeneration.ts`
2. `frontend/src/agentImg/services/text.ts`
3. `backend/routes/system.js`
4. `backend/imgagent/index.js`
5. `backend/lib/ai-providers.js`
6. `backend/lib/memory-manager.js`
7. `backend/imgagent/credits.js`

### 路线 C: 从点数和支付进入

想知道扣点、冻结、订单和入账：

1. `frontend/src/points/index.ts`
2. `frontend/src/agentImg/views/AetherMarket.vue`
3. `frontend/src/agentImg/views/CreditsOrders.vue`
4. `frontend/src/agentImg/views/CreditsUsage.vue`
5. `backend/imgagent/index.js`
6. `backend/imgagent/credits.js`
7. `backend/routes/admin.js`

### 路线 D: 从登录和用户进入

想知道用户身份怎么建立：

1. `frontend/src/login/routes.ts`
2. `frontend/src/login/api.ts`
3. `frontend/src/login/session.ts`
4. `frontend/src/login/storage.ts`
5. `backend/routes/auth.js`
6. `backend/lib/auth-utils.js`
7. `backend/lib/user-utils.js`

### 路线 E: 从后台控制台进入

想知道后台数据怎么展示：

1. `frontend/src/console/ConsoleLayout.vue`
2. `frontend/src/stores/console.ts`
3. `frontend/src/console/views/Dashboard.vue`
4. `frontend/src/console/views/UserManagement.vue`
5. `frontend/src/console/views/Usage.vue`
6. `frontend/src/console/views/ContentAudit.vue`
7. `backend/routes/admin.js`
8. `backend/routes/usage.js`

### 如果只有 10 分钟

读这四个：

1. 本 README 的“30 秒速览”“架构总览”“业务流程速查”。
2. `PRD.md` 的“接口清单”和“AI 生成流程”。
3. `frontend/src/router/index.ts`。
4. `backend/server.js`。

---

## 顶层目录地图

```text
FengFan-1997.github.io/
├── README.md                  # 项目入口文档
├── PRD.md                     # 面向后端协作者的产品和接口说明
├── package.json               # 根脚本，负责联动前后端
├── pnpm-lock.yaml             # 根依赖锁
│
├── frontend/                  # Vue 3 + Vite 前端
│   ├── index.html             # SPA HTML 入口
│   ├── vite.config.ts         # dev server、代理、构建分包
│   ├── package.json           # 前端依赖和脚本
│   └── src/
│       ├── agentImg/          # Artigen 用户端核心业务
│       ├── console/           # 管理控制台页面
│       ├── login/             # 登录、注册、验证码、重置密码
│       ├── points/            # 点数和支付前端 API
│       ├── router/            # 路由和 SEO meta
│       ├── stores/            # Pinia store
│       ├── utils/             # API base、埋点、SEO、页面上下文
│       └── types/             # 共享类型
│
└── backend/                   # Express 后端
    ├── server.js              # HTTP 服务入口
    ├── package.json           # 后端依赖和脚本
    ├── railway.json           # Railway 启动配置
    ├── imgagent/              # 图生图、点数、支付、图片历史
    ├── routes/                # system/auth/admin/usage 路由
    ├── lib/                   # provider、鉴权、限流、文件和 ledger 工具
    ├── utils/                 # storage 路径和 JSON 读写
    └── memory/                # 运行期数据目录，启动后自动生成
```

### `frontend/src/agentImg`

Artigen 用户端核心目录。

| 子目录 | 内容 |
| --- | --- |
| `components/` | 用户端组件，如账号弹窗、上传区、工具卡、AI 配料表类型选择器。 |
| `composables/` | AI 生图、上传、历史、点数、格式工厂等组合逻辑。 |
| `data/` | 工具箱配置和 prompt library。 |
| `logic/` | 图片编辑数学、格式工厂处理器、AI 配料表 SVG 生成等纯逻辑。 |
| `services/` | 调用后端 AI 接口的封装。 |
| `stores/` | Artigen 局部设置。 |
| `styles/` | 用户端样式。 |
| `views/` | Artigen 页面。 |

### `frontend/src/console`

后台控制台。主要页面：

| 文件 | 页面 |
| --- | --- |
| `Dashboard.vue` | 总览。 |
| `UserManagement.vue` | 用户和用户详情。 |
| `Usage.vue` | 用量分析。 |
| `Billing.vue` | 账单视图。 |
| `ContentAudit.vue` | 图片历史、审计、行为事件、健康检查、SEO 内容编辑。 |
| `Playground.vue` | 后台调试生成入口。 |
| `Settings.vue` | 控制台设置。 |

### `backend/routes`

| 文件 | 职责 |
| --- | --- |
| `system.js` | 系统状态和 `/api/generate`。 |
| `auth.js` | 登录、注册、验证码、密码重置、Google 登录。 |
| `admin.js` | 控制台后台接口。 |
| `usage.js` | 行为事件、usage ledger、usage summary。 |

### `backend/imgagent`

| 文件 | 职责 |
| --- | --- |
| `index.js` | `/api/img2img`、点数成本、支付订单、图片历史、用户 profile/api keys。 |
| `credits.js` | 钱包、冻结、扣点、发点、订单 ledger。 |
| `profiles.js` | 用户 profile 和用户 API key 读写。 |

---

## 架构总览

### 三层架构

```text
┌────────────────────────────────────────────────────────────┐
│ Layer 3 - Artigen 产品层                                   │
│ 页面路由 / AI 工作台 / 格式工厂 / 图片编辑 / 商城 / 控制台  │
└───────────────────────────────┬────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────┐
│ Layer 2 - API 与业务服务层                                  │
│ generate / img2img / auth / credits / pay / admin / usage   │
└───────────────────────────────┬────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────┐
│ Layer 1 - Provider 与运行期存储层                           │
│ Gemini / SiliconFlow / SMTP / Afdian / MEMORY_DIR / files   │
└────────────────────────────────────────────────────────────┘
```

### 前端请求路径

```text
Vue 页面
  -> composable 或 service
  -> buildApiUrl()
  -> /api/* 或 /files/*
  -> Vite dev proxy 或线上反向代理
  -> Express route
```

`buildApiUrl()` 在 `frontend/src/utils/api.ts`：

- 先读 `VITE_API_BASE`。
- 再读 `VITE_AGENT_API_BASE`。
- 都为空时走同源相对路径。
- 如果 base 以 `/api` 结尾，会自动避免 `/api/api/...`。
- 线上页面不会使用指向 localhost 的 base。

### 后端路由安装

后端入口是 `backend/server.js`。它负责：

- 加载 `backend/.env`。
- 创建 Express app。
- 配置安全响应头。
- 配置 CORS。
- 配置 JSON body limit。
- 配置总限流。
- 安装 `/files` 本地文件访问。
- 安装 `/api/proxy/image` 和 `/api/proxy/google-gsi`。
- 安装 system、usage、auth、admin、imgagent 路由。

---

## 前端路由

### 主路由

| 路径 | 页面 |
| --- | --- |
| `/` | 重定向到 `/artigen`。 |
| `/artigen` | 首页。 |
| `/artigen/ai` | AI 生图工作台。 |
| `/artigen/tools` | 格式工厂和工具箱。 |
| `/artigen/tools-seo` | 工具箱 SEO 落地页。 |
| `/artigen/image-workshop` | AI 影像工坊。 |
| `/artigen/image-editor` | 图片编辑器。 |
| `/artigen/market` | 点数商城。 |
| `/artigen/orders` | 订单记录。 |
| `/artigen/usage` | 用量记录。 |
| `/artigen/about` | 关于页。 |
| `/artigen/legal/terms` | 服务条款。 |
| `/artigen/legal/privacy` | 隐私政策。 |
| `/artigen/legal/refund` | 退款政策。 |
| `/login` | 登录页。 |
| `/console/*` | 后台控制台。 |

### 兼容重定向

| 旧路径 | 新路径 |
| --- | --- |
| `/agent-img` | `/artigen/ai` |
| `/format-factory` | `/artigen/tools` |
| `/tools` | `/artigen/tools` |
| `/aether-market` | `/artigen/market` |
| `/legal/terms` | `/artigen/legal/terms` |
| `/legal/privacy` | `/artigen/legal/privacy` |
| `/legal/refund` | `/artigen/legal/refund` |
| `/console2` | `/console` |

任意未知路径会重定向到 `/artigen`。

---

## 业务流程速查

### AI 生图

```text
用户输入 prompt
  -> useAgentImgGeneration
  -> frontend/src/agentImg/services/text.ts
  -> POST /api/generate
  -> backend/routes/system.js
  -> callTextGenerate()
  -> Gemini 或 SiliconFlow
  -> 返回文本或结构化 prompt
  -> 前端继续进入图片生成或展示结果
```

关键字段：

- `prompt`
- `purpose`
- `userId`
- `requestId`
- `sessionId`
- `projectId`
- `requestSource`
- `pageContext`
- `cost`
- `model`

### 图生图和图片生成

```text
前端上传图片或生成图片任务
  -> POST /api/img2img
  -> backend/imgagent/index.js
  -> 校验 userId
  -> 计算成本
  -> 创建点数 hold
  -> callSiliconFlowImageGenerate()
  -> 持久化图片到 /files/<userId>/...
  -> 写入图片历史和审计
  -> 确认扣点或释放 hold
```

本地没有 `SILICONFLOW_API_KEY` 时，这条链路会在 provider 阶段返回配置错误；线上 key 在部署平台环境变量中时才会真正生成图片。

### AI 配料表

AI 配料表属于 Artigen 当前主链路，不能当作旧独立 `Ingredient` 项目删除。

前端保留文件：

- `frontend/src/agentImg/views/IngredientLabel.vue`
- `frontend/src/agentImg/components/IngredientLabelTypeSelect.vue`
- `frontend/src/agentImg/logic/formatFactory/ingredientLabel.ts`
- `frontend/src/agentImg/views/ImageWorkshop.vue`
- `frontend/src/agentImg/composables/useFormatFactory.ts`

后端保留 purpose：

- `agentimg_ingredient_label`
- `ingredient_label`

流程：

```text
工具箱或影像工坊选择 AI 配料表
  -> 输入产品信息、配料、风格和标签类型
  -> POST /api/generate
  -> purpose = agentimg_ingredient_label 或 ingredient_label
  -> buildIngredientLabelPrompt()
  -> provider 返回文案和结构
  -> 前端 buildIngredientLabelSvg()
  -> 导出 SVG/图片
```

成本字段：

- API 返回成本名：`aiIngredientList`
- 环境变量：`CREDITS_COST_AI_INGREDIENT_LIST`

### 格式工厂

格式工厂主要在浏览器本地运行：

- 图片格式转换
- 图片压缩
- 尺寸调整
- 水印处理
- GIF 处理
- PDF 相关处理
- AI 配料表 SVG 生成

核心文件：

- `frontend/src/agentImg/views/FormatFactory.vue`
- `frontend/src/agentImg/composables/useFormatFactory.ts`
- `frontend/src/agentImg/logic/formatFactory/processors.ts`
- `frontend/src/agentImg/logic/formatFactory/canvas.ts`
- `frontend/src/agentImg/logic/formatFactory/format.ts`

### 登录和用户

```text
邮箱验证码 / 密码 / Google 登录
  -> frontend/src/login/api.ts
  -> backend/routes/auth.js
  -> users.json
  -> 返回 userId 和 token
  -> 前端保存 app_user_id / app_auth_token
  -> 后续请求带 Authorization: Bearer <token>
```

兼容旧本地 key：

- `agent_user_id`
- `agent_auth_token`

后端同时会写入 HttpOnly Cookie：

- `auth_token`

### 点数和支付

```text
用户发起生成或购买
  -> 前端读取 /api/credits/costs
  -> 生成任务创建 hold
  -> 成功后确认扣点
  -> 失败后释放 hold
```

支付：

```text
商城创建订单
  -> POST /api/pay/create-order
  -> pay_orders.json
  -> 爱发电付款或回调
  -> POST /api/pay/afdian/webhook
  -> credits_orders.json
  -> credits_wallet.json
```

### 控制台

控制台使用两种管理员认证：

- `Authorization: Bearer <adminToken>`，来自 `/api/admin/login`。
- `x-admin-key: <ADMIN_KEY>`，来自部署环境变量。

主要数据：

- 用户列表
- 图片历史
- 审计历史
- 订单
- 点数 holds
- usage ledger
- 前端行为事件
- 限流统计
- 系统健康

---

## API 总览

完整接口说明见 `PRD.md`。这里放最常用入口。

### 系统与生成

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/meta` | 服务基础信息。 |
| `GET` | `/api/health` | provider 和存储健康状态。 |
| `POST` | `/api/generate` | 文本生成、prompt 生成、AI 配料表。 |
| `POST` | `/api/img2img` | 图生图、证件照、老照片、背景和图片编辑生成。 |
| `GET` | `/api/proxy/image?url=` | 安全代理远程图片。 |
| `GET` | `/files/*` | 读取运行期图片文件。 |

### 登录

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/login/send-code` | 发送邮箱验证码。 |
| `POST` | `/api/login/verify` | 邮箱验证码登录。 |
| `POST` | `/api/auth/login` | 用户名/邮箱 + 密码登录。 |
| `POST` | `/api/auth/register` | 注册。 |
| `POST` | `/api/auth/password-reset/send-code` | 发送重置密码验证码。 |
| `POST` | `/api/auth/password-reset/reset` | 重置密码。 |
| `GET` | `/api/auth/google/config` | Google 登录配置。 |
| `POST` | `/api/auth/google/verify` | Google credential 校验。 |

### 点数和支付

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/credits/costs` | 成本表。 |
| `GET` | `/api/credits/balance` | 用户余额。 |
| `POST` | `/api/credits/checkin` | 签到。 |
| `GET` | `/api/credits/orders` | 用户订单。 |
| `GET` | `/api/credits/holds` | 用户冻结记录。 |
| `POST` | `/api/pay/create-order` | 创建支付订单。 |
| `POST` | `/api/pay/afdian/webhook` | 爱发电 webhook。 |

### 控制台

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 管理员登录。 |
| `GET` | `/api/admin/users` | 用户列表。 |
| `POST` | `/api/admin/users/credits` | 管理员调整点数。 |
| `GET` | `/api/admin/images/history` | 全站图片历史。 |
| `GET` | `/api/admin/audit/history` | 全站审计历史。 |
| `GET` | `/api/admin/orders` | 订单聚合。 |
| `GET` | `/api/admin/usage/ledger` | 全站 usage ledger。 |
| `GET` | `/api/admin/collection/events` | 前端行为事件。 |
| `GET` | `/api/admin/ratelimit/stats` | 限流统计。 |

---

## 环境变量

后端会从 `backend/.env` 读取环境变量；线上部署通常在平台环境变量面板配置。AI provider 的 key 如果只在线上配置，本地 smoke 出现 provider 不可用是正常现象。

### 前端变量

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE` | 前端 API Base。为空时请求同源 `/api` 和 `/files`。 |
| `VITE_AGENT_API_BASE` | 兼容旧变量，`VITE_API_BASE` 为空时使用。 |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services 前端 client id。 |

### 后端基础变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 `8080`。 |
| `NODE_ENV` | `development` 或 `production`。 |
| `MEMORY_DIR` | 运行期数据目录。为空时优先 `/data`，否则 `backend/memory`。 |
| `TRUST_PROXY` | 为 `1` 时启用 Express trust proxy。 |
| `CORS_ORIGIN` / `CORS_ORIGINS` | 允许的跨域来源，逗号分隔。 |
| `JSON_BODY_LIMIT` | JSON body 大小限制。 |
| `LOG_REQUESTS` | 请求日志开关。 |
| `API_RATE_LIMIT` | 总限流开关。 |
| `API_RATE_MAX` | 总限流次数。 |
| `API_RATE_WINDOW_MS` | 总限流窗口。 |
| `ADMIN_KEY` | 管理员 key。 |
| `CONSOLE_ADMIN_USERNAME` | 控制台账号用户名。 |
| `CONSOLE_ADMIN_PASSWORD` | 控制台账号密码。 |
| `CONSOLE_ADMIN_TOKEN_SECRET` | 控制台 token 签名密钥。 |
| `CONSOLE_ADMIN_TOKEN_TTL_HOURS` | 控制台 token 有效小时数。 |

### AI provider 变量

| 变量 | 说明 |
| --- | --- |
| `TEXT_PROVIDER` | 文本 provider，支持 `gemini`、`siliconflow` 和 offline fallback。 |
| `REQUIRE_LLM_PROVIDER` | 为 `1` 时，没有 provider 会返回配置错误。 |
| `GEMINI_API_KEY` | Gemini API key。 |
| `GEMINI_API_BASE` | Gemini API base。 |
| `GEMINI_GENERATE_URL` | 单个 Gemini generateContent URL。 |
| `GEMINI_GENERATE_URLS` | 多个 Gemini generateContent URL，逗号分隔。 |
| `GEMINI_TIMEOUT_MS` | Gemini 超时。 |
| `SILICONFLOW_API_KEY` / `SILICONFLOW_TOKEN` / `SILICONFLOW_KEY` | SiliconFlow API key。 |
| `SILICONFLOW_API_BASE` | SiliconFlow API base。 |
| `SILICONFLOW_MODEL` | 文本模型。 |
| `SILICONFLOW_IMAGE_MODEL` | 图生图模型。 |
| `SILICONFLOW_TXT2IMG_MODEL` | 文生图图片模型。 |
| `SILICONFLOW_IMAGE_INPUT_FIELD` | 图片输入字段名。 |
| `SILICONFLOW_TIMEOUT_MS` | 图片接口超时。 |
| `SILICONFLOW_REACTION_TIMEOUT_MS` | 文本接口反应模式超时。 |
| `SILICONFLOW_MIN_INTERVAL_MS` | 请求最小间隔。 |
| `TEXT_GENERATE_MAX_CONCURRENCY` | 文本生成并发。 |
| `TEXT_GENERATE_MAX_QUEUE` | 文本生成队列。 |
| `IMAGE_GENERATE_MAX_CONCURRENCY` | 图片生成并发。 |
| `IMAGE_GENERATE_MAX_QUEUE` | 图片生成队列。 |

### 登录和邮件变量

| 变量 | 说明 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client id。 |
| `GOOGLE_OAUTH_ALLOW_INSECURE` | 非生产环境 Google token 兼容校验。 |
| `QQ_SMTP_USER` | 发信邮箱账号。 |
| `QQ_SMTP_PASS` | 发信邮箱授权码或密码。 |
| `QQ_SMTP_HOST` | SMTP host，默认 `smtp.qq.com`。 |
| `QQ_SMTP_PORT` | SMTP 端口，默认 `465`。 |
| `QQ_SMTP_SECURE` | SMTP secure 开关。 |
| `QQ_SMTP_FROM_NAME` | 发信展示名。 |
| `LOGIN_TEST_CODE` | 本地测试验证码，默认 `123456`。 |
| `LOGIN_TEST_EMAILS` / `LOGIN_TEST_EMAIL_ALLOWLIST` | 允许使用测试验证码的邮箱。 |
| `LOGIN_ALLOW_TEST_CODE` | 测试验证码开关。 |
| `LOGIN_ALLOW_TEST_CODE_IN_PROD` | 生产环境测试验证码开关。 |
| `LOGIN_ALLOW_TEST_CODE_REMOTE` | 远程 IP 测试验证码开关。 |
| `LOGIN_DEBUG_RETURN_CODE` | 调试返回验证码。 |

### 点数、支付、历史变量

| 变量 | 说明 |
| --- | --- |
| `CREDITS_INIT` | 新钱包初始点数。 |
| `CREDITS_CHECKIN_ADD` | 签到增加点数。 |
| `CREDITS_MAX_GRANT_PER_ORDER` | 单订单最多发放点数。 |
| `CREDITS_COST_GENERATE` | 通用生成成本。 |
| `CREDITS_COST_IMG2IMG` / `CREDITS_COST_IMAGE` | 图生图成本。 |
| `CREDITS_COST_AIDESIGN_QUICK` | AI 快速生图成本。 |
| `CREDITS_COST_AIDESIGN_SEMANTIC` | 深度思考语义分析成本。 |
| `CREDITS_COST_AIDESIGN_FINAL` | 深度思考最终生成成本。 |
| `CREDITS_COST_AI_LAB` | AI 实验室成本。 |
| `CREDITS_COST_AI_IMAGE_WORKSHOP` | AI 影像工坊成本。 |
| `CREDITS_COST_AI_BACKGROUND` | AI 背景成本。 |
| `CREDITS_COST_AI_ID_PHOTO` | AI 证件照成本。 |
| `CREDITS_COST_AI_OLD_PHOTO` | AI 老照片成本。 |
| `CREDITS_COST_AI_INGREDIENT_LIST` | AI 配料表成本。 |
| `AFDIAN_PAGE_URL` / `AFDIAN_PAY_URL` | 爱发电付款页。 |
| `AFDIAN_ORDER_CREATE_URL` | 爱发电订单创建地址。 |
| `AFDIAN_WEBHOOK_PUBLIC_KEY` | 爱发电 webhook 公钥。 |
| `AFDIAN_WEBHOOK_REQUIRE_SIGN` | 为 `1` 时强制 webhook 签名校验。 |
| `AFDIAN_ENFORCE_AMOUNT_MATCH` | 为 `1` 时强制订单金额匹配。 |
| `ENABLE_MOCK_ORDERS` | 为 `1` 时启用 mock 订单接口。 |
| `PAY_ORDERS_MAX_KEEP` | 支付订单保留数量。 |
| `PAY_ORDERS_MAX_AGE_DAYS` | 支付订单保留天数。 |
| `IMAGE_HISTORY_MAX_ITEMS` | 单用户图片历史上限。 |
| `AUDIT_HISTORY_MAX_ITEMS` | 单用户审计历史上限。 |
| `USAGE_LEDGER_MAX_ITEMS` | usage ledger 上限。 |
| `ANALYTICS_EVENTS_MAX_ITEMS` | 行为事件上限。 |
| `USAGE_CREDITS_PER_1K_TOKENS` | usage ingest 按 token 估算点数。 |

### 生成和文件变量

| 变量 | 说明 |
| --- | --- |
| `GENERATE_RATE_MAX` | `/api/generate` 限流次数。 |
| `GENERATE_RATE_WINDOW_MS` | `/api/generate` 限流窗口。 |
| `GENERATE_USER_MAX_CONCURRENCY` | 单用户文本生成并发。 |
| `GENERATE_IDEMPOTENCY_TTL_MS` | 生成幂等缓存 TTL。 |
| `IMG2IMG_RATE_MAX` | `/api/img2img` 限流次数。 |
| `IMG2IMG_RATE_WINDOW_MS` | `/api/img2img` 限流窗口。 |
| `IMG2IMG_USER_MAX_CONCURRENCY` | 单用户图生图并发。 |
| `PERSIST_IMAGE_ALLOWED_HOSTS` | 允许后端持久化抓取的远程图片 host。 |
| `DEBUG_FILES` | `/files` 访问调试日志。 |
| `ENABLE_CROSS_ORIGIN_ISOLATION` | 启用 COOP/COEP 响应头。 |
| `ENABLE_HSTS` | 生产环境启用 HSTS。 |
| `HSTS_MAX_AGE` | HSTS max-age。 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 后端访问上游时使用的代理。 |

---

## 运行期数据

默认数据目录：

```text
backend/memory
```

如果部署环境存在 `/data`，后端默认使用：

```text
/data
```

也可以显式配置：

```bash
MEMORY_DIR=/your/persistent/path
```

目录不存在时，后端启动会自动创建 `MEMORY_DIR` 和 `files/`。具体 JSON 文件在业务首次读写时生成。

主要文件：

| 文件 | 内容 |
| --- | --- |
| `users.json` | 用户账号、邮箱、用户名、session token、密码哈希。 |
| `credits_wallet.json` | 用户可用点数和冻结点数。 |
| `credits_holds.json` | 生成中的点数冻结记录。 |
| `credits_orders.json` | 点数发放、消耗、管理员调整、支付入账记录。 |
| `pay_orders.json` | 支付订单和 webhook 状态。 |
| `usage_ledger.json` | 生成、provider、token、点数、状态和耗时记录。 |
| `analytics_events.json` | 页面访问、按钮点击、工具使用等前端行为事件。 |
| `chats.json` | 历史调用记录兼容数据。 |
| `user_<userId>.json` | 单用户 profile、图片历史、审计历史等。 |
| `files/` | 生成图、输入图持久化文件、测试图片。 |

当前仓库不依赖提交本地 `backend/memory` 数据。本地历史数据可以删除，后端会自动重建运行所需结构。

---

## 部署说明

### 根目录脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 同时启动后端和前端 dev server。 |
| `pnpm run build` | 构建前端。 |
| `pnpm run install:all` | 安装后端和前端依赖。 |
| `pnpm run zeabur:build` | 安装依赖并构建前端。 |
| `pnpm run start` | 启动后端。 |

### 前端部署

前端静态产物：

```text
frontend/dist
```

前端可以用静态站点服务部署。线上要保证：

- SPA fallback 指向 `index.html`。
- `/api` 指向后端服务。
- `/files` 指向后端服务。
- `VITE_API_BASE` 与线上 API 规则匹配；如果同源部署可以留空。

### 后端部署

后端入口：

```bash
node backend/server.js
```

`backend/railway.json` 当前启动命令：

```json
{
  "deploy": {
    "startCommand": "node server.js"
  }
}
```

后端需要持久化目录：

- 优先使用部署平台的 `/data`。
- 或设置 `MEMORY_DIR`。

线上 AI key、SMTP、支付密钥通常配置在部署平台环境变量中，不要求写入仓库。

---

## 验证基线

当前整理后的验证命令：

```bash
find backend -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
pnpm --dir frontend run type-check
pnpm --dir frontend run test
pnpm --dir frontend run build
```

API smoke：

```bash
curl -sS http://localhost:8080/api/meta
curl -sS http://localhost:8080/api/health
curl -sS http://localhost:8080/api/credits/costs
curl -sS http://localhost:8080/api/auth/google/config
```

本地没有 provider key 时：

- `/api/health` 可能显示 `textProvider: "offline"`。
- `/api/generate` 可能返回空响应或 provider 配置错误。
- `/api/img2img` 可能返回图片 provider 未配置。

这些属于本地环境变量缺失，不代表代码链路不存在。

---

## 常见问题

### 1. 本地 AI 接口为什么不通

Gemini 和 SiliconFlow 的 key 很可能只配在部署平台。先看：

```bash
curl -sS http://localhost:8080/api/health
```

如果 `hasApiKey` 或 `siliconflow.hasApiKey` 是 `false`，本地生成失败是正常的。

### 2. 邮箱验证码发不出去

检查：

- `QQ_SMTP_USER`
- `QQ_SMTP_PASS`
- `QQ_SMTP_HOST`
- `QQ_SMTP_PORT`
- `QQ_SMTP_SECURE`

本地调试可以使用：

- `LOGIN_TEST_CODE`
- `LOGIN_ALLOW_TEST_CODE`
- `LOGIN_DEBUG_RETURN_CODE`

### 3. `/files/*` 访问 401 或 404

先确认路径是不是至少包含用户目录和文件名：

```text
/files/guest_xxx/file.png
/files/user_xxx/file.png
```

游客目录 `guest_` 开头，公开缓存。正式用户目录需要 Bearer token、Cookie token、查询 token 或管理员权限。

### 4. 构建有大 chunk warning

当前 `pnpm --dir frontend run build` 可以成功。Vite 会提示 `antd`、`echarts` 或 `pdf` chunk 较大，这是构建警告，不是构建失败。

### 5. 为什么没有旧个人主页入口

当前仓库已经剔除式独立，只保留 Artigen。未知路径会回到 `/artigen`，不会再进入旧个人主页、旧 Agent、旧 project、旧 room 等页面。

### 6. `backend/memory` 没了会不会启动失败

不会。`backend/utils/storage.js` 会在启动时创建 `MEMORY_DIR` 和 `files/`。JSON 文件会在业务读写时生成。

---

## 协作文档关系

| 文档 | 作用 |
| --- | --- |
| `README.md` | 让新人理解项目、启动项目、知道从哪里读代码。 |
| `PRD.md` | 给后端协作者看的模块、接口、认证、点数、支付、生成和数据约定。 |
| `frontend/src/console/README_CONSOLE.md` | 控制台局部说明。 |

README 负责回答“这是什么、怎么跑、从哪里看”。PRD 负责回答“前后端怎么连接、接口怎么约定、数据怎么流动”。

---

## 术语表

| 术语 | 含义 |
| --- | --- |
| Artigen | 当前产品名，也是本仓库保留的唯一业务边界。 |
| AI 生图 | `/artigen/ai` 的主工作台，包含 prompt、深度分析和生成链路。 |
| 图生图 | `/api/img2img`，用于参考图生成、证件照、老照片、背景、图片编辑等。 |
| 格式工厂 | `/artigen/tools`，主要是浏览器本地图片处理工具集合。 |
| AI 配料表 | Artigen 工具链的一部分，由 `IngredientLabel` 页面和 `ingredient_label` 后端 purpose 支撑。 |
| 点数 | 用户生成和使用 AI 功能消耗的虚拟额度。 |
| hold | 生成任务开始时冻结的点数，成功确认扣除，失败释放。 |
| usage ledger | 后端记录的一次调用用量，包括 provider、模型、token、点数、耗时和状态。 |
| audit history | 用户生成、图片处理和后台审计相关历史。 |
| MEMORY_DIR | 后端运行期数据目录。 |
| `/files/*` | 后端暴露的运行期图片访问入口。 |
| admin token | `/api/admin/login` 返回的控制台 Bearer token。 |
| `ADMIN_KEY` | 可通过 `x-admin-key` 访问控制台接口的环境变量。 |

---

## 当前剔除结果

已经移除的旧边界包括：

- 旧个人主页和履历页面。
- 旧 `frontend/src/project` 项目页。
- 旧 `frontend/src/room`。
- 旧 `frontend/src/ChristmasTree`。
- 旧独立 `frontend/src/Ingredient` 页面。
- 旧 `frontend/src/agent`、Live2D、VRM、MediaPipe、Pixi、Three 相关代码和静态资源。
- 旧 `secret` 页面。
- 旧 `AgentDebug` 页面。
- 旧 HF/RAG/ModeDoc/embed/chat/memory 后端接口。
- 旧 RAG 和模型扫描脚本。
- 旧项目说明和旧路线图文档。

仍然保留的 Artigen 能力包括：

- `/artigen/*`
- `/console/*`
- `/login/*`
- AI 生图
- 图生图
- 图片编辑
- 格式工厂
- AI 配料表
- 点数和支付
- 图片历史
- 审计和统计
- 法律页
- `/files/*`
- 健康检查和 meta 接口


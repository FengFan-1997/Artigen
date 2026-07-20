# Artigen

> Artigen 是一个面向图片生产和图片处理的 AI 工具站。
> 它把 AI 生图、图生图、图片编辑、格式工具箱、AI 配料表、点数支付和后台控制台放在同一个 Vue + Express 项目里。

生产网站、数据库、邮件、支付、账号和环境变量的接管说明见
[《Artigen 生产环境小白接管手册》](./PRODUCTION_RUNBOOK.zh-CN.md)。

---

## 30 秒速览

**这是什么** - Artigen 是一个 AI 影像工具平台。用户可以在 `/artigen/ai` 做 AI 生图，在 `/artigen/tools/:toolId` 使用 8 个媒体工作流，在 `/artigen/image-workshop/:toolId` 使用 5 个工坊入口，并在 `/artigen/image-workshop/image-editor` 打开图片编辑器 2.0。

**给谁用** - 面向需要快速生成、处理、整理图片资产的个人创作者、电商运营、产品设计和内容团队。普通用户主要使用 Artigen 主站，管理员和运营使用控制台。

**解决什么** - 把“生成图片”“编辑图片”“转换格式”“做配料表”“点数扣费”“支付入账”“审计追踪”放进同一个闭环，避免前端页面、后端接口、支付和运营数据散在多个旧项目里。

**一句话架构** - 前端是 Vue 3 + Vite 的单页应用，核心业务集中在 `frontend/src/agentImg`；后端保留 Express/CommonJS，账户、订单、钱包、不可变账本和统一工具任务以 PostgreSQL 16 为唯一写源，图片通过 file 或 S3/R2 适配器保存；生产付费生图必须使用多实例共享的 S3/R2 对象存储。

**2026 治理基线** - 项目现在使用 Node 24、pnpm 10 workspace 和根目录唯一锁文件。普通用户鉴权是同源 HttpOnly Cookie + CSRF，不接收 bearer token；浏览器不持久化密码、用户 token 或管理员 token，也不能提交价格。生产付费能力只有在 PostgreSQL、服务端价格、签名密钥和 `PAID_FEATURES_ENABLED=true` 全部就绪后才会开放。

**当前边界** - 这个仓库已经做过剔除式独立，只保留 Artigen。旧个人主页、旧 Agent/Live2D/VRM、旧项目页、旧 room、旧 ChristmasTree、旧独立 Ingredient 页面、旧 HF/RAG/ModeDoc 接口和脚本都已经从当前业务边界移除。

---

## 角色入口

### 前端协作者

先读这几个文件：

1. `frontend/src/router/index.ts` - 全站路由、重定向和 SEO meta。
2. `frontend/src/agentImg/index.vue` - AI 生图主工作台。
3. `shared/tools.catalog.json` - 工坊和 8 个工具工作流的唯一产品目录。
4. `frontend/src/agentImg/views/FormatFactory.vue` - 8 个稳定工具工作流页面。
5. `frontend/src/agentImg/views/ImageWorkshop.vue` - 5 个影像工坊入口。
6. `frontend/src/agentImg/views/ImageEditorV2.vue` - 默认图片编辑器 2.0；旧编辑器只作一版回退。
7. `frontend/src/agentImg/services/text.ts` - 前端调用 `/api/generate` 和 `/api/img2img` 的主入口。
8. `frontend/src/points/index.ts` - 点数、订单、支付相关前端 API。
9. `frontend/src/login/api.ts` - 登录、注册、验证码、Google 登录前端 API。

### 后端协作者

先读这几个文件：

1. `PRD.md` - 后端协作的接口、数据和流程约定。
2. `backend/server.js` - Express 入口、Origin/CSRF、限流、文件访问和路由安装。
3. `backend/routes/system.js` - `/api/meta`、`/api/health`、`/api/generate`。
4. `backend/imgagent/index.js` - `/api/img2img`、点数、支付、图片历史。
5. `backend/routes/auth.js` - 邮箱验证码、密码登录、注册、密码重置、Google 登录。
6. `backend/routes/admin.js` - 控制台管理接口。
7. `backend/routes/usage.js` - 行为事件和 usage ledger。
8. `backend/lib/ai-providers.js` - Gemini 和 SiliconFlow provider 调用。
9. `backend/services/billing-service.js` - PostgreSQL 报价、预占、结算、退款和幂等任务事务。
10. `backend/routes/tool-tasks.js` - 统一 catalog、quote、task、asset 与 editor transfer API。
11. `backend/migrations/` - PostgreSQL 16 数据结构和服务端 SKU/套餐种子。

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
| Node.js | 是 | 固定 Node 24（见 `.nvmrc` / `.node-version`）。 |
| pnpm | 是 | 固定 pnpm 10；全仓只有根目录一个 lockfile。 |
| PostgreSQL | 付费/账户生产必装 | PostgreSQL 16；本地只测免费工具时可不配置，此时付费接口 fail-closed。 |
| Git | 是 | 用于协作、提交和部署。 |
| Gemini 或 SiliconFlow API Key | 线上需要 | 本地没有 key 时，AI provider 相关接口返回 offline 或配置错误属于正常现象。 |
| Brevo API + Turnstile | 生产邮箱验证码需要 | 生产邮件走 HTTPS 443；SMTP 只允许本地兼容，debug 只允许非生产回环/白名单。 |

### 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

根命令会一次安装三个 workspace（root、frontend、backend），不要在子目录生成新的锁文件。

需要测试账户、订单或计费时，先配置 `DATABASE_URL` 并执行：

```bash
pnpm --filter backend db:migrate
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
pnpm --filter backend dev
pnpm --filter personal dev
```

### 构建和预览

```bash
pnpm type-check
pnpm test
pnpm build
pnpm --filter personal preview
```

根目录构建：

```bash
pnpm run build
```

构建产物在：

```text
frontend/dist
```

### 完整发布门禁

```bash
pnpm check
```

它依次执行只读 ESLint、类型检查、前后端单测、Chromium/Firefox/WebKit 集成测试、生产构建和首页 250 KiB gzip 预算。CI 同时启动 PostgreSQL 16，并在测试前应用迁移。任何一步失败都不应开放付费入口。

生图 Provider、内部模型或 prompt 模板变化需额外运行固定 30 例质量集。`pnpm --filter backend eval:generation:blind -- --baseline <manifest> --candidate <manifest> --out <review.json>` 创建不暴露左右身份的盲评表；人工填写后运行 `pnpm --filter backend eval:generation:score -- --review <review.json>`，候选硬约束通过率必须至少 90%，并且不得劣于旧链路。没有测试 Provider 凭证时只运行契约 mock，不发起真实收费任务。

---

## 代码阅读路线

### 路线 A: 从页面进入

想知道用户从哪里点到哪里：

1. `frontend/src/router/index.ts`
2. `frontend/src/agentImg/views/LandingPage.vue`
3. `frontend/src/agentImg/index.vue`
4. `frontend/src/agentImg/views/FormatFactory.vue`
5. `frontend/src/agentImg/views/ImageWorkshop.vue`
6. `frontend/src/agentImg/views/ImageEditorRoute.vue` 与 `frontend/src/agentImg/editor/`（V2）；`ImageEditor.vue` 仅为一版兼容回退。
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
    ├── db/                    # PostgreSQL 连接与事务
    ├── migrations/            # PostgreSQL 16 结构、价格与财务约束
    ├── services/              # 任务计费、支付和 file/S3 资产适配器
    ├── imgagent/              # 旧图生图兼容入口与图片历史
    ├── routes/                # auth/payment/tool-task/system/admin/usage 路由
    ├── lib/                   # provider、鉴权、CSRF、限流和目录契约
    ├── scripts/               # JSON 幂等导入与迁移核对
    ├── utils/                 # 旧数据迁移读取和本地文件路径
    └── memory/                # 未跟踪的运行产物；不是生产财务写源
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
- 安装 system、usage、auth、admin、imgagent、payments 和 tool-tasks 路由。

---

## 前端路由

### 主路由

| 路径 | 页面 |
| --- | --- |
| `/` | 重定向到 `/artigen`。 |
| `/artigen` | 首页。 |
| `/artigen/ai` | AI 生图工作台。 |
| `/artigen/tools` | 8 个工具工作流目录。 |
| `/artigen/tools/:toolId` | 稳定工具工作流子路由。 |
| `/artigen/tools-seo` | 工具箱 SEO 落地页。 |
| `/artigen/image-workshop` | 5 个影像工坊目录。 |
| `/artigen/image-workshop/:toolId` | 稳定工坊子路由。 |
| `/artigen/image-workshop/image-editor` | 图片编辑器 2.0；`?editor=legacy` 可临时回退。 |
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
- `model`

兼容入口即使收到 `cost` 也会忽略；价格只能由服务端 SKU/价格版本决定。当前只有接入统一任务执行器的收费操作可以扣点，未接入的旧收费操作会明确 fail-closed。

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
  -> PostgreSQL 用户、身份与会话
  -> Set-Cookie: auth_token=...; HttpOnly; SameSite=Lax
  -> 响应只返回用户资料和 CSRF token，不向浏览器脚本暴露 bearer token
  -> 后续同源请求自动携带 Cookie，写请求同时发送 X-CSRF-Token
```

启动时会清理旧的 `app_auth_token`、`agent_auth_token`、明文密码和旧管理员凭证。`SESSION_NOT_BEFORE` 可一次性使旧会话失效；切换用户必须重新登录。游客本地内容可由前端显式合并，游客点数不会合并。

### 点数和支付

```text
用户发起生成或购买
  -> 统一任务先读取服务端 catalog/quote
  -> 创建任务时锁定价格并创建 hold
  -> 成功后确认扣点
  -> 失败后释放 hold
```

支付：

```text
商城创建订单
  -> POST /api/pay/create-order
  -> PostgreSQL 锁定套餐版本、金额、币种和点数
  -> 爱发电付款
  -> 用户从爱发电订单详情复制 provider 订单号
  -> POST /api/pay/orders/:orderId/verify
  -> 使用 API token 查询并核对已付款 provider 订单
  -> 锁定本地订单和钱包
  -> PostgreSQL 订单 + 不可变 wallet_ledger 原子入账一次
```

爱发电官方 checkout 不承诺保留任意 `custom_order_id` 或 URL `remark`，因此 webhook 只作为加速通知，不能单独完成 Artigen 用户绑定。未知订单、错金额、错套餐不会入账；同一 provider 订单只能领取一次，重放和并发领取受唯一键与事务锁保护。

### 控制台

控制台使用短时管理员 Bearer token，来自 `/api/admin/login`。生产环境拒绝默认 `admin/admin123456`，也始终禁用静态 `ADMIN_KEY` 后门；`x-admin-key` 只允许在非生产且显式开启兼容开关时使用。生产登录名必须同时对应 PostgreSQL `administrators` 中一条 active 用户记录；每次管理请求会重新检查角色，财务调账与支付补偿会把 `actor_user_id` 写入不可变审计。

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
| `GET` | `/api/auth/session` | 读取当前 Cookie 会话和 CSRF token。 |
| `POST` | `/api/auth/logout` | 撤销服务端会话并清除 Cookie。 |

### 工具任务与资产

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/tools/catalog` | 唯一工具目录、能力、限制、隐私与 SKU。 |
| `GET` | `/api/generation/models` | 稳定产品 profile、可用性、比例与参考图能力；不暴露 Provider 或内部模型。 |
| `POST` | `/api/tool-tasks/quote` | 由服务端价格版本创建短时报价。 |
| `POST` | `/api/tool-tasks` | multipart 创建任务；必须带 `Idempotency-Key`。 |
| `GET` | `/api/tool-tasks/:taskId` | 读取本人任务、结果、receipt 与 warnings。 |
| `DELETE` | `/api/tool-tasks/:taskId` | 真实取消本人任务并释放未结算 hold。 |
| `GET` | `/api/assets/:assetId` | 经所有权校验读取 opaque 资产。 |
| `DELETE` | `/api/assets/:assetId` | 用户提前删除本人资产；存在活动 transfer 时拒绝。 |
| `POST` | `/api/editor/transfers` | 创建短时、登录用户专属的编辑器资产 transfer。 |
| `POST` | `/api/editor/transfers/:transferId/consume` | 同一用户一次性消费 transfer；受 Origin/CSRF 保护。 |

### 点数和支付

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/credits/costs` | 兼容期成本表；新功能使用 catalog/quote。 |
| `GET` | `/api/credits/balance` | 用户余额。 |
| `POST` | `/api/credits/checkin` | legacy JSON billing 签到；标准 PostgreSQL 生产模式返回 `410`。 |
| `GET` | `/api/credits/orders` | 用户订单。 |
| `GET` | `/api/credits/holds` | 用户冻结记录。 |
| `GET` | `/api/pay/packages` | 读取当前 active 套餐 UUID、完整 SKU 和服务端价格。 |
| `POST` | `/api/pay/create-order` | 创建支付订单。 |
| `GET` | `/api/pay/orders/:orderId` | 读取本人本地支付订单。 |
| `POST` | `/api/pay/orders/:orderId/verify` | 登录用户提交爱发电订单号；服务端查询并原子核验到账。 |
| `POST` | `/api/pay/afdian/webhook` | 爱发电 webhook；仅作通知，始终通过 provider API 复核。 |

### 控制台

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 管理员登录。 |
| `GET` | `/api/admin/users` | 用户列表。 |
| `POST` | `/api/admin/users/credits` | 管理员调整点数。 |
| `GET` | `/api/admin/images/history` | 全站图片任务元数据；只返回计数、分类、哈希和 opaque asset ID。 |
| `GET` | `/api/admin/audit/history` | 全站审计元数据；不返回原始 prompt、用户文本、图片 URL 或文件名。 |
| `GET` | `/api/admin/orders` | 订单聚合。 |
| `GET` | `/api/admin/usage/ledger` | 全站 usage ledger。 |
| `GET` | `/api/admin/collection/events` | 前端行为事件。 |
| `GET` | `/api/admin/generation/events` | PostgreSQL 脱敏生图事件。 |
| `GET` | `/api/admin/generation/funnel` | 生图成功/退款/持久化、队列与 Provider p50/p95、未结算 hold 和成功成本。 |
| `GET` | `/api/admin/ratelimit/stats` | 限流统计。 |
| `GET` | `/api/admin/payments/dead-letters` | 查看已验签但未匹配的支付事件。 |
| `POST` | `/api/admin/payments/reconcile/:eventId` | 重新查询 provider 后补偿处理 dead letter。 |

---

## 环境变量

后端会从 `backend/.env` 读取环境变量；线上部署通常在平台环境变量面板配置。AI provider 的 key 如果只在线上配置，本地 smoke 出现 provider 不可用是正常现象。

### 前端变量

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE` | 前端 API Base。为空时请求同源 `/api` 和 `/files`。 |
| `VITE_AGENT_API_BASE` | 兼容旧变量，`VITE_API_BASE` 为空时使用。 |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services 前端 client id。 |
| `VITE_IMAGE_EDITOR_V2_DEFAULT` | 默认 `v2`；设为 `legacy`/`false` 可灰度回退。 |
| `VITE_AI_DESIGN_TASK_V2_ENABLED` | 主生图统一任务链前端灰度；默认开启，设为 `false` 可回退一版。 |

### 后端基础变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 `8080`。 |
| `NODE_ENV` | `development` 或 `production`。 |
| `DATABASE_URL` | PostgreSQL 16 连接串；账户、钱包、订单、账本和任务的生产写源。 |
| `DATABASE_MIGRATION_URL` | 可选的迁移专用直连 URL，必须与 `DATABASE_URL` 指向相同 hostname、port 和 database；未配置时复用 `DATABASE_URL`。 |
| `PG_CONNECT_TIMEOUT_MS` | PostgreSQL 建连超时，运维脚本默认 10 秒。 |
| `PG_BIN_DIR` | PostgreSQL 16 客户端工具目录；脚本会先读它，再探测 Homebrew arm64/Intel 常见 keg-only 路径，最后才使用 PATH。 |
| `PG_SSL_REJECT_UNAUTHORIZED` | 托管数据库默认校验证书；只有无法提供 CA 的受控环境才可显式设为 `0`。 |
| `PG_SSL_CA` / `PG_SSL_CA_BASE64` | 托管 PostgreSQL 根 CA（PEM 或其 Base64），推荐用于完整证书校验。 |
| `MIGRATION_LOCK_TIMEOUT_MS` / `MIGRATION_LOCK_POLL_MS` | 生产迁移 advisory lock 等待上限与轮询间隔，默认 120 秒/1 秒。 |
| `PAID_FEATURES_ENABLED` | 只有明确为 `true` 且数据库可用时才开放付费能力。 |
| `CSRF_SECRET` | Cookie 写请求的 CSRF HMAC 密钥，生产必填。 |
| `OTP_HMAC_SECRET` | OTP HMAC 密钥，生产必填。 |
| `SESSION_TOKEN_HASH_SECRET` | PostgreSQL 会话 token 哈希密钥；生产必须与其他密钥不同且至少 32 字节。 |
| `SESSION_NOT_BEFORE` | ISO/Unix 时间；早于此时间签发的旧会话全部失效。 |
| `MEMORY_DIR` | 旧 JSON shadow-read/迁移及本地文件适配器目录；不是生产财务写源。 |
| `TRUST_PROXY` | 为 `1` 时启用 Express trust proxy。 |
| `CORS_ORIGIN` / `CORS_ORIGINS` | 允许的跨域来源，逗号分隔。 |
| `JSON_BODY_LIMIT` | 普通 JSON body 大小限制；生产默认 1 MiB。Word 转 PDF 使用限流后的独立严格上限。 |
| `LOG_REQUESTS` | 请求日志开关。 |
| `API_RATE_LIMIT` | 总限流开关。 |
| `API_RATE_MAX` | 总限流次数。 |
| `API_RATE_WINDOW_MS` | 总限流窗口。 |
| `ADMIN_KEY` | 仅非生产显式兼容；生产环境始终禁用静态管理员 key。 |
| `ALLOW_LEGACY_ADMIN_KEY` | 仅非生产可设为 `1` 开启静态 key 兼容。 |
| `CONSOLE_ADMIN_USERNAME` | 控制台登录名；生产必须匹配 active PostgreSQL 管理员用户的 username/email/legacy ID。 |
| `CONSOLE_ADMIN_PASSWORD` | 控制台账号密码；生产至少 16 位并拒绝默认密码。 |
| `CONSOLE_ADMIN_TOKEN_SECRET` | 控制台 token 签名密钥；生产必填，多实例必须使用同一稳定值。 |
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
| `AI_DESIGN_TASK_V2_ENABLED` | 主生图统一任务链服务端灰度；只有显式为 `true` 才公布可用 profile。 |
| `WORKSHOP_AI_TASK_V2_ENABLED` | 工坊付费 AI 统一任务链总开关；显式开启后才允许职业形象、AI 场景背景和配料原文整理报价/创建任务。 |
| `AI_DESIGN_TASK_V2_ROLLOUT_PERCENT` | 主生图稳定用户分桶比例，取值 `0`–`100`；同一数据库用户始终落在同一 cohort。 |
| `AI_DESIGN_TASK_V2_INTERNAL_USERS` | 逗号分隔的数据库用户 UUID；全局开关开启时，这些内部用户可越过百分比灰度。 |
| `TASK_PAYLOAD_ENCRYPTION_KEY` | 主生图 prompt/产品资料及配料整理原文的 AES-256-GCM 密钥；接受 32 字节原文、64 位 hex，或 `hex:`/`base64:` 编码。任一对应付费任务开启但密钥缺失时 fail-closed。 |
| `AI_DESIGN_SILICONFLOW_TEXT_MODEL` | `standard-v1` 的服务端文生图模型 ID，不由公共模型接口返回。 |
| `AI_DESIGN_SILICONFLOW_EDIT_MODEL` | `standard-v1` 的服务端参考图编辑模型 ID。 |
| `AI_DESIGN_SILICONFLOW_DIRECTIONS_MODEL` | 四方向分析的服务端文本模型 ID。 |
| `AI_IMAGE_TIMEOUT_MS` / `AI_DIRECTIONS_TIMEOUT_MS` | 主生图与方向分析 Provider 超时。 |
| `AI_GENERATION_CONTRACT_MOCK` | 仅非生产契约测试可设为 `1`；生产始终使用真实 Provider 配置。 |
| `AI_DESIGN_GENERATE_COST_MINOR` / `AI_DESIGN_DIRECTIONS_COST_MINOR` | 可选 Provider 单次成本最小货币单位，仅用于脱敏运营聚合。 |

### 登录和邮件变量

| 变量 | 说明 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client id。 |
| `GOOGLE_OAUTH_ALLOW_INSECURE` | 非生产环境 Google token 兼容校验。 |
| `AUTH_EMAIL_OTP_ENABLED` | 生产邮件验证码总开关；开启后 `/readyz` 强制检查 PostgreSQL、三份独立认证密钥、邮件 Provider 和 Turnstile。 |
| `MAIL_PROVIDER` | 生产使用 `relay`（Vercel HTTPS → 163 SMTP）；仍兼容 `brevo`，生产环境拒绝直接 SMTP fallback。 |
| `MAIL_RELAY_URL` | Vercel 中继的固定 HTTPS `/api/send-otp` 地址。 |
| `MAIL_RELAY_SHARED_SECRET` | Render 与中继共享的独立强密钥，至少 32 字节；只存平台环境变量。 |
| `BREVO_API_KEY` | 可选的 Brevo Transactional Email HTTPS API key；仅在 `MAIL_PROVIDER=brevo` 时使用。 |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | 固定为 `Artigen <sorates1997@163.com>`；163 SMTP 授权码只保存在中继环境变量。 |
| `MAIL_TIMEOUT_MS` | 邮件 HTTPS 请求超时，默认 8 秒。 |
| `TURNSTILE_REQUIRED` | 登录/验证码人机校验总开关；生产开启邮件 OTP 时应为 `true`。 |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 服务端 secret。 |
| `TURNSTILE_HOSTNAMES` | 允许的精确前端 hostname，逗号分隔，只填 FQDN（不含协议、端口、路径或通配符）；生产必须包含 `APP_ORIGIN` 的 hostname。 |
| `QQ_SMTP_USER` / `QQ_SMTP_PASS` | 只用于本地开发的 SMTP fallback；生产会拒绝。 |
| `QQ_SMTP_HOST` / `QQ_SMTP_PORT` / `QQ_SMTP_SECURE` | 本地 SMTP 连接参数。 |
| `LOGIN_TEST_CODE` | 仅非生产可用；必须显式配置自定义值，拒绝默认 `123456`。 |
| `LOGIN_TEST_EMAILS` / `LOGIN_TEST_EMAIL_ALLOWLIST` | 所有非生产测试验证码都必须命中的邮箱白名单。 |
| `LOGIN_ALLOW_TEST_CODE` | 非生产测试验证码总开关，必须显式设为 `1`。 |
| `LOGIN_ALLOW_TEST_CODE_IN_PROD` | 已废弃且无效；生产环境永远禁止测试验证码。 |
| `LOGIN_ALLOW_TEST_CODE_REMOTE` | 远程非生产环境的附加开关；代理头不参与“本机”判断。 |
| `LOGIN_DEBUG_RETURN_CODE` | 调试返回验证码。 |

### 点数、支付、历史变量

| 变量 | 说明 |
| --- | --- |
| `CREDITS_INIT` | 新钱包初始点数。 |
| `CREDITS_CHECKIN_ADD` | legacy JSON billing 签到增加点数。 |
| `CREDITS_MAX_GRANT_PER_ORDER` | 单订单最多发放点数。 |
| `CREDITS_COST_GENERATE` | 兼容接口成本；新任务价格来自 PostgreSQL SKU/价格版本。 |
| `CREDITS_COST_IMG2IMG` / `CREDITS_COST_IMAGE` | 兼容图生图成本。 |
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
| `AFDIAN_API_USER_ID` / `AFDIAN_API_TOKEN` | 服务端查询订单凭证；用户领取和 webhook 处理都必须通过官方 API 获取并核对规范订单。 |
| `AFDIAN_QUERY_ORDER_URL` | 爱发电订单查询 API；生产固定为可解析的官方 `https://afdian.com/api/open/query-order`，避免凭证被发送到其他主机。 |
| `AFDIAN_WEBHOOK_PUBLIC_KEY` | 可选爱发电 webhook RSA 公钥；仅在该创作者账号确实启用签名时配置。 |
| `AFDIAN_WEBHOOK_REQUIRE_SIGN` | 官方文档中的 webhook 无签名，默认 `0` 并强制 API 复核；只有爱发电明确为账号启用 RSA 后才设为 `1`。 |
| `AFDIAN_PACKAGE_PLAN_ID_MAP` | 套餐 UUID/完整 SKU 到爱发电 plan id 的服务端映射。 |
| `AFDIAN_PACKAGE_PAY_URL_MAP` | 套餐 UUID/完整 SKU 到付款页的服务端映射。 |
| `ENABLE_LEGACY_JSON_BILLING` | 仅无数据库、非生产环境可显式开启旧 JSON 计费适配器；生产始终禁用。 |
| `ENABLE_MOCK_ORDERS` | 仅 legacy 非生产适配器可设为 `1` 启用 mock 订单。 |
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
| `TASK_QUEUE_CONCURRENCY` | 单实例 PostgreSQL 租约队列并发，默认 2、上限 8。 |
| `TASK_WORKER_ENABLED` | 是否在当前进程启动任务 Worker；免费 Render 模板固定为 `0`，避免 Web 实例误处理收费任务。 |
| `TASK_LEASE_MS` | Worker 租约时长，默认 90 秒。 |
| `TASK_HEARTBEAT_MS` | Worker 心跳周期，默认 20 秒，必须短于租约。 |
| `TASK_QUEUE_POLL_MS` | `LISTEN/NOTIFY` 之外的耐久轮询周期，默认 1 秒。 |
| `TASK_QUEUE_LISTENER_RECONNECT_MS` | 队列 `LISTEN` 连接断开后的初始重连退避，默认 250ms。 |
| `TOOL_TASK_CREATE_RATE_MAX` | 单用户/来源创建云端任务的每分钟上限，默认 12；在 multipart 写入临时盘前执行。 |
| `PERSIST_IMAGE_ALLOWED_HOSTS` | 允许后端持久化抓取的远程图片 host。 |
| `OLD_PHOTO_OUTPUT_HOSTS` / `AI_OUTPUT_ALLOWED_HOSTS` | 生产老照片和主生图 Provider 结果允许域名；缺失时远程结果抓取 fail-closed，并固定已验证 DNS 地址。 |
| `PROXY_IMAGE_ALLOWED_HOSTS` / `IMAGE_PROXY_ALLOWED_HOSTS` | 生产图片代理允许域名；缺失时代理 fail-closed。 |
| `ASSET_STORAGE_DRIVER` | `file`、`s3` 或 `r2`；数据库仅保存 opaque URI 与元数据。 |
| `ASSET_FILE_ROOT` | `file` 适配器根目录；默认 `MEMORY_DIR/assets-v2`。 |
| `ASSET_GC_INTERVAL_MS` | 多实例安全资产回收周期，默认 5 分钟。 |
| `S3_BUCKET` / `ASSET_S3_BUCKET` / `R2_BUCKET` | S3/R2 bucket。 |
| `S3_ENDPOINT` / `ASSET_S3_ENDPOINT` / `R2_ENDPOINT` | S3/R2 兼容 endpoint。 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 对象存储凭证；R2 同时支持对应 `R2_*` 变量。 |
| `CONVERT_MAX_FILE_BYTES` | Word 转 PDF 输入上限，默认 24 MiB、硬上限 40 MiB。 |
| `CONVERT_MAX_CONCURRENCY` | 单实例 LibreOffice 并发，默认 1、硬上限 8；在大体积 JSON 解析前 fail-closed。 |
| `CONVERT_TIMEOUT_MS` | 单次 LibreOffice 转换超时，默认 90 秒。 |
| `CONVERT_KILL_GRACE_MS` | 取消/超时后从 SIGTERM 升级到进程组 SIGKILL 的等待时间，默认 750ms。 |
| `CONVERT_OFFICE_TO_PDF_DISABLED` | 为 `1` 时关闭 LibreOffice 服务端保真转换。 |
| `DEBUG_FILES` | `/files` 访问调试日志。 |
| `ENABLE_CROSS_ORIGIN_ISOLATION` | 启用 COOP/COEP 响应头。 |
| `ENABLE_HSTS` | 生产环境启用 HSTS。 |
| `HSTS_MAX_AGE` | HSTS max-age。 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 后端访问上游时使用的代理。 |

---

## 运行期数据

PostgreSQL 16 保存用户/身份、Cookie 会话、验证码、管理员、钱包、不可变账本、预占、价格、套餐、支付订单/回调、工具任务、资产元数据、编辑器 transfer 和财务/管理事务审计。迁移在 `backend/migrations/`。

图片二进制不写入数据库。`ASSET_STORAGE_DRIVER=file` 默认使用 `MEMORY_DIR/assets-v2`，只用于本地开发和单实例契约测试；生产付费生图必须配置 `ASSET_STORAGE_DRIVER=s3`/`r2` 及共享 endpoint、bucket 和 credentials。数据库只保存 opaque URI、magic-byte 校验后的 MIME、大小、尺寸和保留期。对象写入后会重新读取并校验大小与 SHA-256，只有验证通过的生成结果才能结算。过期资产通过 PostgreSQL `SKIP LOCKED` 租约回收；同内容重传、任务/transfer 引用和多实例并发不会绕过二次状态校验。file 适配器还会以游标扫描 inventory，在宽限期后清理“对象写成功但数据库事务未提交”的孤儿文件。

当前统一云端工具执行器开放“AI 老照片增强/上色”、AI 职业形象、AI 场景背景、配料原文整理，以及 `ai-design.generate`/`ai-design.directions`。所有价格只来自服务端 catalog、operation SKU 和 quote：职业形象 5 点、AI 场景背景 5 点、配料整理 10 点、主生图 10 点、方向分析 5 点；前端不硬编码费用。职业形象和背景请求只提交服务端枚举与主体变换参数，不能提交 prompt，prompt 由服务端构造；配料任务可以提交用户原文，但服务端会在结算前执行逐项来源追溯，新增事实即失败退款。所有 operation 的客户端都不能传 Provider、内部模型、steps、guidance 或价格。其余尚未接入可信 Provider 或 LibreOffice 能力的收费 operation 会明确返回 `TOOL_OPERATION_UNAVAILABLE`/`CONVERTER_UNAVAILABLE`，不会排队、扣费或从本地失败静默降级。Word 保真转换必须由用户勾选上传同意，服务端也会再次校验 consent 与 DOCX 容器。

Word 保真转换在读取 Base64 JSON 前获取单实例并发槽，并对 ZIP central directory、本地文件头、CRC、OOXML 必需部件、entry 数量、单项/累计未压缩大小及压缩比执行预检。每次 LibreOffice 使用独立 profile；请求断开或超时会终止整个 POSIX 进程组，Windows 使用 `taskkill /T /F` fallback。Node `child_process` 没有跨平台可移植的 CPU/内存 rlimit，因此生产部署还必须在 Railway/container 层配置 CPU、内存和 PID 上限，不能只依赖应用内并发闸门。

主生图与工坊付费 AI 任务通过 PostgreSQL `FOR UPDATE SKIP LOCKED` 租约认领、心跳与 `LISTEN/NOTIFY` 跨实例取消运行。Provider 派发前的过期任务最多重领一次；已派发但结果未知的任务不盲重试并全额释放 hold；过期 hold 在输入完成、认领、心跳、Provider 派发和结算各阶段都会 fail-closed。主生图 prompt/产品档案和配料原文只存在 AES-256-GCM 短期 payload，普通 `tool_tasks.options` 只保存枚举、长度与哈希，任务终态即删除 payload；职业形象与背景 prompt 始终由服务端枚举构建。参考输入默认保留 24 小时，生成结果默认 30 天并允许用户提前删除。

生图灰度由全局 `AI_DESIGN_TASK_V2_ENABLED`、内部用户 allowlist 和稳定百分比分桶共同控制，发布顺序为内部用户 → 10% → 50% → 100%。全局开关是财务或资产指标越界时的立即熔断开关；分桶依据数据库用户 UUID，不因刷新、换浏览器或多实例而漂移。

旧用户、钱包、订单等财务 JSON 快照只用于幂等导入、shadow read 和迁移核对，已从版本控制忽略；切换后不得作为财务回退源。非财务的最小化 usage、analytics、图片/审计历史目前仍使用 legacy JSON 适配器写入 `backend/memory`，只保存下述净化后的元数据。

行为事件、usage ledger、图片历史和审计历史采用元数据最小化：原始 prompt/用户文本/模型输出/页面上下文只保留长度与带命名空间的 SHA-256，图片和文件引用只保留 opaque ID，IP 只保留哈希，User-Agent 只保留设备类别。写入时会执行白名单净化，读取旧 JSON 时会再次净化，因此历史遗留的图片 URL、文件名、凭证和敏感 query 也不会由管理接口原样返回。

首次生产管理员需先是普通 PostgreSQL 用户，再显式授权角色：

```bash
pnpm --filter backend admin:grant -- <用户 UUID 或 legacy user id> owner
```

`operator` 可读，`admin` 可执行调账/支付补偿，`owner` 包含全部权限；把 `administrators.active` 设为 false 后，已有 token 的后续管理请求也会立即被拒绝。

---

## 部署说明

### 分支和部署关系

| 分支 | 作用 | 部署关系 |
| --- | --- | --- |
| `main` | 线上发布分支。 | Railway 前后端服务跟随 `main` 自动部署。 |
| `test` | 团队测试分支。 | 用于日常功能、修复、文档的合并前测试；是否绑定 Railway 测试环境以 Railway 当前项目配置为准。 |

日常协作默认流程：

```text
feature/fix/docs/refactor 分支 -> PR 到 test -> 测试通过 -> PR 到 main -> Railway 线上部署
```

紧急修复可以使用 `hotfix/*` 直接 PR 到 `main`，线上恢复后再同步回 `test`。

### 根目录脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 同时启动后端和前端 dev server。 |
| `pnpm run build` | 构建前端。 |
| `pnpm install` | 从根目录唯一 lockfile 安装全部 workspace。 |
| `pnpm check` | 执行完整发布门禁。 |
| `pnpm run start` | 启动后端。 |
| `pnpm run start:production` | advisory lock 下完成迁移，成功后再启动后端。 |
| `pnpm run db:local:setup` | 在已运行的本地 PostgreSQL 16 上创建开发角色/数据库并执行迁移。 |
| `pnpm run db:backup:neon` | 使用 PostgreSQL 16 `pg_dump` 生成一致性备份、SHA-256 和核对清单。 |
| `pnpm run db:restore:verify -- --dump <文件>` | 恢复到专用演练库并核对清单、约束及财务不变量。 |
| `pnpm run db:audit` | 对目标 PostgreSQL 执行只读的钱包、账本、hold、任务、支付与 schema 防护审计。 |

### PostgreSQL 16 本地开发

仓库不会安装或启动系统 PostgreSQL。先自行准备一个正在运行的 PostgreSQL 16，再执行：

```bash
pnpm run db:local:setup
pnpm run dev
```

默认创建 `artigen` 角色，以及 `artigen_dev`、`artigen_test`、`artigen_restore_verify` 三个数据库，并对三者执行全部版本化迁移。若 `backend/.env` 不存在，脚本会以 0600 权限从 `.env.example` 生成本地配置，写入 `DATABASE_URL`、`TEST_DATABASE_URL`、`RESTORE_VERIFY_DATABASE_URL`（以及兼容别名 `NEON_VERIFY_DATABASE_URL`），生成三份互不相同的 256-bit `OTP_HMAC_SECRET`、`SESSION_TOKEN_HASH_SECRET`、`CSRF_SECRET`，并保持 `TASK_WORKER_ENABLED=0`。若文件已存在，只幂等补齐上述缺失/空的连接串、本地数据库配置、安全密钥和 Worker gate，任何非空值均不覆盖；输出只列出被补齐的变量名，不打印密钥。通过 `LOCAL_PG_ADMIN_URL`、`LOCAL_PG_USER`、`LOCAL_PG_PASSWORD`、`LOCAL_PG_DATABASE`、`LOCAL_PG_TEST_DATABASE` 和 `LOCAL_PG_VERIFY_DATABASE` 可覆盖默认值。只创建数据库而暂不迁移时使用：

```bash
pnpm run db:local:setup -- --no-migrate
```

### Neon 连接、备份与恢复演练

当前任务队列使用 advisory lock 与 `LISTEN/NOTIFY` 这类会话级 PostgreSQL 能力，因此 `DATABASE_URL` 必须使用 Neon direct（非 `-pooler`）连接串。`DATABASE_MIGRATION_URL`、`NEON_DATABASE_URL`、恢复演练和审计连接同样必须使用 direct URL；脚本会主动拒绝 Neon `-pooler` 主机。生产启动同时配置 `DATABASE_MIGRATION_URL` 和 `DATABASE_URL` 时，两者的 hostname、port、database 必须完全一致（允许账号不同），防止迁移错库后启动。Neon 也明确要求 `pg_dump` 避免 pooled URL。参见 [Neon PostgreSQL 兼容说明](https://neon.com/docs/reference/compatibility) 和 [Neon 数据迁移指南](https://neon.com/docs/import/migrate-from-neon)。

备份机必须安装与服务端同主版本的 `pg_dump`/`pg_restore`（本项目固定 PostgreSQL 16）。脚本依次查找 `PG_BIN_DIR`、`/opt/homebrew/opt/postgresql@16/bin`、`/usr/local/opt/postgresql@16/bin`、常见 `libpq` keg 和 PATH，不要求把 keg-only 工具全局 link。创建一致性 custom-format 备份：

```bash
NEON_DATABASE_URL='<direct-url>' pnpm run db:backup:neon
```

默认输出到仓库外的 `~/Library/Application Support/Artigen/backups/`，目录权限固定为 0700；每次生成权限为 0600 的 `.dump`、`.manifest.json` 和 `.sha256`。即使显式传入 `--output-dir`，也不能选择仓库内部路径或经符号链接落入仓库的路径。manifest 保存迁移名与 public 表行数，但不保存连接密码。成功完成新备份后按三文件一组只保留最近 14 组，并删除更旧的完整组。

恢复验证只能对专用演练数据库执行，数据库名必须包含 `verify`、`restore` 或 `drill`，并且需要显式确认清空 public schema：

```bash
RESTORE_VERIFY_DATABASE_URL='<dedicated-restore-url>' \
NEON_VERIFY_ALLOW_RESET=1 \
pnpm run db:restore:verify -- \
  --dump "$HOME/Library/Application Support/Artigen/backups/artigen-neon-....dump"
```

`NEON_VERIFY_DATABASE_URL` 暂时保留为兼容别名。恢复会核对 SHA-256、文件大小、迁移清单、public 表行数和约束，然后在同一恢复库执行只读财务审计：钱包不得为负、账本增量链与尾余额必须吻合、frozen 必须等于 held hold、任务/报价/扣费/退款状态必须闭合、支付回调和入账必须唯一，关键 append-only trigger 与唯一索引也必须存在且有效。任一检查失败均非零退出；脚本不会自动删除演练库，便于人工抽查后再由运维人员删除。需要单独审计数据库时可执行：

```bash
AUDIT_DATABASE_URL='<direct-url>' pnpm run db:audit
```

macOS 每日备份只提供 launchd 模板，不会自动注册或修改用户定时任务。需要启用时，由用户在仓库根目录手动执行：

```bash
install -d -m 700 "$HOME/.config/artigen" "$HOME/Library/LaunchAgents"
test -e "$HOME/.config/artigen/neon-backup.env" || \
  install -m 600 /dev/null "$HOME/.config/artigen/neon-backup.env"
$EDITOR "$HOME/.config/artigen/neon-backup.env"
cp backend/ops/launchd/com.artigen.neon-backup.plist.example \
  "$HOME/Library/LaunchAgents/com.artigen.neon-backup.plist"
cp backend/ops/launchd/com.artigen.neon-restore-verify.plist.example \
  "$HOME/Library/LaunchAgents/com.artigen.neon-restore-verify.plist"
sed -i '' "s|__REPO_ROOT__|$(pwd)|g" \
  "$HOME/Library/LaunchAgents/com.artigen.neon-backup.plist"
sed -i '' "s|__REPO_ROOT__|$(pwd)|g" \
  "$HOME/Library/LaunchAgents/com.artigen.neon-restore-verify.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.artigen.neon-backup.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.artigen.neon-restore-verify.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.artigen.neon-backup.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.artigen.neon-restore-verify.plist"
```

`~/.config/artigen/neon-backup.env` 至少配置 `NEON_DATABASE_URL='<direct-url>'`、专用演练库的 `RESTORE_VERIFY_DATABASE_URL='<restore-verify-direct-url>'` 和 `NEON_VERIFY_ALLOW_RESET=1`，并保持 0600。每日任务生成并轮换备份；每周任务选择最新 dump，恢复到专用演练库并执行迁移、表行数、校验和、约束及完整财务不变量审计。仓库本身没有执行上述命令，也没有创建任何用户 launchd 任务。

### 前端部署

前端静态产物：

```text
frontend/dist
```

前端可以用静态站点服务部署。线上要保证：

- SPA fallback 指向 `index.html`。
- `/api` 指向后端服务。
- `/files` 指向后端服务（旧兼容）；新资产使用 `/api/assets/:assetId`。
- `VITE_API_BASE` 与线上 API 规则匹配；如果同源部署可以留空。

### 后端部署

生产后端入口：

```bash
pnpm run start:production
```

该命令先连接 PostgreSQL 16，在固定 application advisory lock 下执行全部 pending migration；获得锁超时或迁移失败时不会启动 HTTP 服务。`DATABASE_MIGRATION_URL` 只用于迁移且必须与应用 `DATABASE_URL` 指向相同 hostname、port 和 database。

Railway 后端服务必须把 Root Directory 设为 `/backend`（或显式选择 `backend/railway.json`），这样下列相对命令才会在正确目录执行：

```json
{
  "deploy": {
    "preDeployCommand": ["pnpm db:migrate:locked"],
    "startCommand": "pnpm start:production"
  }
}
```

Railway 会在新容器接管流量前执行所有尚未应用的版本化 PostgreSQL 迁移；启动命令再次幂等核对，覆盖平台重启路径。

仓库根目录的 `render.yaml` 提供 Render Blueprint：CI checks 通过后部署、完整 workspace 构建、启动阶段迁移锁和 60 秒优雅关闭。构建命令会显式清空 `VITE_API_BASE` 与 `VITE_AGENT_API_BASE`，确保 Render 上的前端、Cookie 和 `/api` 保持同源。平台健康检查只调用浅层 `/healthz`，不会因数据库或外部 Provider 的短暂波动反复重启实例；`/readyz` 保留给人工 smoke 或部署深检。

Render Free 不使用 `preDeployCommand`，迁移由 `start:production` 在监听端口前 fail-closed 执行。模板默认 `plan: free`、`PG_POOL_MAX=5`、`TASK_WORKER_ENABLED=0`，并关闭付费生图与邮件 OTP；此时 `/readyz` 会明确把数据库、对象存储、任务 payload、Provider 和邮件依赖标为 `skipped`，且不会对这些外部依赖发起 I/O。Cookie 会话只在 `/api` 与 `/files` 水合，SPA、静态资源和健康检查不会因用户已登录而额外唤醒 Neon。开启付费或邮件 OTP 后，深检会要求 PostgreSQL 已应用仓库最新迁移（当前 `011_otp_delivery_dispatch_state`，包含 OTP `provider_dispatched_at`）、对应对象存储/Provider，以及独立认证密钥、Brevo 和 Turnstile secret + site key；生产 Turnstile 还要求 HTTPS `APP_ORIGIN` 与精确 `TURNSTILE_HOSTNAMES` 一致。按 [Render Blueprint 规范](https://render.com/docs/blueprint-spec) 导入并完成 smoke 后，再分阶段开启邮件 OTP、Worker 与收费能力。

后端生产必须配置 PostgreSQL 16；生产付费生图必须使用 S3/R2 兼容共享对象存储，Railway/Render 本地文件只用于开发或非付费契约测试。未完成迁移、备份恢复演练和 staging 核对前保持 `PAID_FEATURES_ENABLED=false`。

线上 AI、Brevo、Turnstile、对象存储和支付密钥只配置在部署平台环境变量中，不写入仓库。`backend/.env.example` 只包含非敏感示例、空密钥占位和本地安全默认值。

---

## 验证基线

当前整理后的验证命令：

```bash
pnpm check
```

API smoke：

```bash
curl -sS http://localhost:8080/healthz
curl -sS http://localhost:8080/readyz
curl -sS http://localhost:8080/api/meta
curl -sS http://localhost:8080/api/health
curl -sS http://localhost:8080/api/tools/catalog
curl -sS http://localhost:8080/api/auth/session
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

生产 Render 不直接连接 SMTP；验证码走带 HMAC 签名的 Vercel HTTPS 中继，再由中继连接 163 SMTP。依次检查：

- `AUTH_EMAIL_OTP_ENABLED=true`
- `MAIL_PROVIDER=relay`
- `MAIL_RELAY_URL=https://你的中继域名/api/send-otp`
- Render 与 Vercel 配置相同的 `MAIL_RELAY_SHARED_SECRET`
- Vercel 已配置 163 的 `SMTP_USER`、SMTP 授权码 `SMTP_PASS` 与发件人
- `VITE_TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY`
- `APP_ORIGIN=https://你的-render-host`
- `TURNSTILE_HOSTNAMES=你的-render-host`（只填 hostname）
- Cloudflare Widget Hostname Management 中也允许同一 hostname

先请求 `/readyz`；如果邮件、Turnstile hostname、数据库或迁移未就绪，会返回对应的内部检查码。中继投递结果未知时接口返回 `202`，不要立即用新幂等键盲目重发。

QQ SMTP 只保留本地兼容。非生产调试还可以使用：

- 自定义且不等于 `123456` 的 `LOGIN_TEST_CODE`
- `LOGIN_ALLOW_TEST_CODE=1`
- 仅包含测试账号的 `LOGIN_TEST_EMAILS` / `LOGIN_TEST_EMAIL_ALLOWLIST`
- 远程环境额外设置 `LOGIN_ALLOW_TEST_CODE_REMOTE=1`
- `LOGIN_DEBUG_RETURN_CODE`

### 3. `/files/*` 访问 401 或 404

先确认路径是不是至少包含用户目录和文件名：

```text
/files/guest_xxx/file.png
/files/user_xxx/file.png
```

旧游客目录以 `guest_` 开头。正式用户目录只接受同源 Cookie 会话或内存管理员 bearer；查询 token 已禁用，外域资源不会附带 Cookie 或 token。

### 4. 构建有大 chunk warning

`pnpm build` 可能提示控制台、ECharts 或 PDF 的按路由 chunk 较大；它们不会在首页预加载。`pnpm --filter personal test:budget` 会强制首页初始 JavaScript 不超过 250 KiB gzip。

### 5. 为什么没有旧个人主页入口

当前仓库已经剔除式独立，只保留 Artigen。未知路径会回到 `/artigen`，不会再进入旧个人主页、旧 Agent、旧 project、旧 room 等页面。

### 6. `backend/memory` 没了会不会启动失败

免费本地工具和基础服务不会依赖提交的 `backend/memory`。生产付费、钱包和订单必须使用 PostgreSQL；缺少数据库时相关接口会明确返回 fail-closed 错误。

---

## 协作文档关系

| 文档 | 作用 |
| --- | --- |
| `README.md` | 让新人理解项目、启动项目、知道从哪里读代码。 |
| `PRD.md` | 给后端协作者看的模块、接口、认证、点数、支付、生成和数据约定。 |
| `CONTRIBUTING.md` | 团队协作规范，包括分支、提交、PR、Review、Railway 发布和测试门禁。 |
| `frontend/src/console/README_CONSOLE.md` | 控制台局部说明。 |

README 负责回答“这是什么、怎么跑、从哪里看”。PRD 负责回答“前后端怎么连接、接口怎么约定、数据怎么流动”。CONTRIBUTING 负责回答“怎么协作、怎么 Review、怎么合并、怎么发布”，并以 `test` 作为团队测试分支、`main` 作为线上发布分支。

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
| usage ledger | 后端记录的一次调用用量，包括 provider、模型族、token、点数、耗时和状态；内容只留哈希与长度。 |
| audit history | 用户生成、图片处理和后台审计的最小化元数据，不保存原始创作内容和图片地址。 |
| MEMORY_DIR | 后端运行期数据目录。 |
| `/files/*` | 后端暴露的运行期图片访问入口。 |
| admin token | `/api/admin/login` 返回的控制台 Bearer token。 |
| `ADMIN_KEY` | 仅非生产且 `ALLOW_LEGACY_ADMIN_KEY=1` 时可用的旧控制台兼容 key；生产始终禁用。 |

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

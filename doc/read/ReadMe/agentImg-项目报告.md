# agentImg（Artigen）项目报告（前后端全链路）

更新时间：2026-01-11  
范围：`g:\AvuePro\newPro\frontend\src\agentImg`（前端模块） + 其依赖的后端接口/积分系统（`g:\AvuePro\newPro\backend`）

---

## 1. 这是什么（给小白的 30 秒说明）

agentImg（产品名在路由/SEO 中叫 Artigen）是一个“图片生产工坊”，包含三块核心能力：

1) **AI 工坊（AI Workshop）**：用户输入一句话（可选上传参考图/Logo），系统会帮用户“规划视觉方向/补全提示词”，然后调用后端 AI 图片生成接口产出图片。  
2) **格式工厂（Format Factory）**：纯前端图片/视频/PDF 处理工具集（转换、压缩、裁剪/旋转、PDF 拆分/合并、视频转 GIF 等），强调“不用上传，浏览器本地处理”。  
3) **算力商城（Compute Market）**：购买积分（点数），用于 AI 生成扣费；并提供订单/点数明细查询。

这三块在前端是同一个子模块（`frontend/src/agentImg`），后端通过 `/api/*` 提供 AI、积分、支付订单、历史记录等接口。

---

## 2. 技术栈总览

### 2.1 前端（frontend）

- 框架：Vue 3（Composition API）  
- 语言：TypeScript  
- 构建：Vite  
- 状态管理：Pinia  
- 路由：vue-router  
- UI：Ant Design Vue  
- 其他重要依赖：
  - `pdfjs-dist`：PDF 解析/渲染（格式工厂 PDF 工具）  
  - `gifenc`：GIF 编码（视频转 GIF）  

代码入口与工程化配置参考：
- [package.json](file:///g:/AvuePro/newPro/frontend/package.json)
- [vite.config.ts](file:///g:/AvuePro/newPro/frontend/vite.config.ts)
- [router/index.ts](file:///g:/AvuePro/newPro/frontend/src/router/index.ts)

### 2.2 后端（backend）

- 运行时：Node.js  
- Web 框架：Express  
- 配置：dotenv  
- 跨域：cors  
- 网络请求：node-fetch（ESM 版本）  

后端入口与依赖参考：
- [backend/package.json](file:///g:/AvuePro/newPro/backend/package.json)
- [server.js](file:///g:/AvuePro/newPro/backend/server.js)

### 2.3 AI/模型供应商（后端实现）

后端 `/api/generate` 支持两类文本生成：
- Google Gemini（当后端配置了 `API_KEY` 时优先）  
- SiliconFlow Chat（当后端配置了 `SILICONFLOW_API_KEY` 时可作为 fallback；或显式请求 qwen 模型）

后端 `/api/img2img` 用于图片生成（包含文生图/图生图统一入口的实现形态），当前走 SiliconFlow 的图片生成能力，并会把结果图片“落到后端可访问的 /files 路径或返回远端 URL”。

相关实现参考：
- [/api/generate](file:///g:/AvuePro/newPro/backend/routes/system.js#L370-L545)
- [/api/img2img](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L524-L710)

---

## 3. 模块结构（前端 agentImg 目录说明）

目录：`frontend/src/agentImg`

- `index.vue`：AI 工坊主页面（产品档案、深度思考、上传参考图/Logo、生成图片、历史记录、积分展示）  
- `views/`
  - `LandingPage.vue`：Artigen 落地页入口（路由 `/artigen`）  
  - `FormatFactory.vue`：格式工厂页面（路由 `/artigen/format-factory`）  
  - `AetherMarket.vue`：算力商城页面（路由 `/artigen/market`）  
  - `CreditsOrders.vue`：我的订单（路由 `/artigen/orders`）  
  - `CreditsUsage.vue`：点数明细（路由 `/artigen/usage`）  
  - `legal/*`：服务条款/隐私/退款页  
- `components/`：TitleBar、页脚、账号弹窗（显示余额、订单、冻结等）  
- `composables/`
  - `useAgentImgFlow.ts`：深度思考“方向建议”生成（文本模型），并提供统一的 Abort/超时/错误人性化  
  - `useAgentImgSettings.ts`：产品档案输入状态 + 生成上下文文本  
  - `useFormatFactory*.ts`：格式工厂工具的状态机、去水印/Live Photo 等子能力封装  
- `services/text.ts`：统一封装对后端 `/api/generate`、`/api/img2img` 的 fetch 调用（包含 requestId、超时、Abort、错误归一化、图片 URL 安全处理）  
- `data/`：提示词库（baseStyle、安全负面提示词）与格式工厂工具配置  
- `logic/`：格式工厂底层处理（Canvas、PDF、GIF、URL 生命周期等）+ JSON 提取/安全序列化等通用逻辑  
- `styles/`：主题样式（例如 cyberpunk.css）

---

## 4. 路由与页面入口（用户怎么“走到这里”）

前端路由在 [router/index.ts](file:///g:/AvuePro/newPro/frontend/src/router/index.ts) 定义，agentImg 相关路径如下：

- `/artigen` → 落地页：`agentImg/views/LandingPage.vue`  
- `/artigen/ai` → AI 工坊：`agentImg/index.vue`  
- `/artigen/format-factory` → 格式工厂：`agentImg/views/FormatFactory.vue`  
- `/artigen/market` → 算力商城：`agentImg/views/AetherMarket.vue`  
- `/artigen/orders` → 我的订单：`agentImg/views/CreditsOrders.vue`  
- `/artigen/usage` → 点数明细：`agentImg/views/CreditsUsage.vue`  
- `/artigen/legal/*` → 法务页：Terms/Privacy/Refund

另外有兼容/短链重定向：
- `/agent-img` → `/artigen/ai`  
- `/format-factory` → `/artigen/format-factory`  
- `/aether-market` → `/artigen/market`

---

## 5. 关键数据结构（你会在很多地方看到）

在 [types.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/types.ts) 定义：

- `AgentImgDirectionOption`：深度思考模式下的“4 个方向建议”
  - `title`：方向标题（用户可改）  
  - `summary`：方向摘要（用户可改）  
  - `styleTags`：该方向的风格标签（用于拼到 prompt）  
  - `negativeTags`：该方向建议的负面标签（用于拼到 negativePrompt）  
  - `suggested`：建议参数（步数/CFG/seed 等）
- `AgentImgPromptResult`：一次生成用的最终提示词
  - `prompt`：正向提示词
  - `negativePrompt`：负向提示词
  - `params`：可选参数（imageSize/steps/guidanceScale/seed）

积分相关（在多个文件出现的形态）：
- `CreditsBalance`：`{ userId, available, frozen }`
  - available：可用点数
  - frozen：已冻结点数（请求开始先冻结，成功后确认扣除；失败则退回）

---

## 6. 最重要的业务流程（逐步讲清楚）

本节把用户端看到的每一步，映射到前后端怎么做、怎么扣费、怎么容错。

### 6.1 登录态与 guest（为什么“未登录也能用”）

前端用 `localStorage` 维护两个状态：
- `app_user_id` / `agent_user_id`：用户 ID（兼容旧 key）  
- `app_auth_token` / `agent_auth_token`：登录 token（兼容旧 key）

如果用户从未登录，系统会自动生成一个 `guest_xxx` 用户 ID（只存在于浏览器 localStorage），在 [login/session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts#L43-L52) 的 `ensureGuestUserId()` 实现。

后端接口鉴权策略大致是：
- 如果 `userId` 是真实账号（非 `guest_`），必须带 `Authorization: Bearer <token>` 且 token 对应的 userId 必须匹配请求里的 userId。  
- 如果 `userId` 是 `guest_`，通常允许以“游客模式”调用（能生成，但积分/订单等能力会受限）。

### 6.2 AI 工坊（/artigen/ai）——“深度思考”两段式

入口文件： [agentImg/index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue)

AI 工坊在 UI 上把生成拆成 2 个阶段：

#### 阶段 A：方向规划（Deep Thinking / 4 方向）

触发时机：
- 用户开启“深度思考”，输入一句话（并可能补充产品档案、上传参考图）
- 点击生成后，如果当前还没有 4 个方向建议，会先调用“方向规划”

实现方式：
- 使用组合式函数 [useAgentImgFlow.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts)
  - `buildDirectionPrompt()` 用 JSON Schema 约束模型输出必须是 `{"options":[...4项...]}`  
  - `analyzeDirections()` 调用 `generateText()` 请求后端 `/api/generate`，拿到文本后用 `extractFirstJsonObject()` 抽取第一个 JSON 对象并做严格字段归一化  
  - 如果没解析出 4 个方向，会报 `PARSE_OPTIONS_FAILED` 并提示用户重试  

对后端的调用：
- `POST /api/generate`（封装在 [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L194-L260) 的 `generateText`）
- 关键字段：
  - `prompt`：方向规划提示词（包含 schema + context + userInput）  
  - `userId`：guest 或真实 userId（由 `ensureGuestUserId()` 提供）  
  - `requestId`：前端生成，便于后端幂等扣费/记录  
  - `images`：可选，把参考图（最多 3 张）以 base64 形式随请求发给后端（如果后端/模型支持多模态，会更稳）

积分扣费（后端）：
- `/api/generate` 会按 purpose 映射到 `CREDITS_COST_*` 计费（例如 directions/final 会走 aidesignSemantic/aidesignFinal；默认兜底 generate=10）  
- 实现是“先冻结、后结算、失败退款”，见 [system.js](file:///g:/AvuePro/newPro/backend/routes/system.js#L370-L546)：
  - `freezeCredits({ userId, cost, requestId, reason: purpose || 'generate' })`
  - 成功则 `settleHold({ actualCost: resolvedCost })`
  - 异常/空响应则 `refundHold`

#### 阶段 B：图片生成（img2img / 统一生成入口）

当用户选中某个方向后，前端会把：
- 用户输入（+ 产品档案上下文）  
- 方向 styleTags / negativeTags  
拼装成最终 prompt/negativePrompt，并调用 `/api/img2img`。

相关关键代码在 [agentImg/index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L696-L742)（组装方向状态）以及生成段落（例如 runGen 调用 img2img 的区域）。

对后端的调用：
- `POST /api/img2img`（封装在 [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L103-L192) 的 `img2img`）
- 关键字段：
  - `prompt` / `negativePrompt`  
  - `params`：可选（steps/guidanceScale/seed/imageSize）  
  - `images`：参考图/Logo（最多 3 个输入；字符串 URL 或 `{mimeType,dataBase64}`）

积分扣费（后端）：
- `/api/img2img` 按 `CREDITS_COST_IMG2IMG`（或其他 fallback）计费，默认 10  
- 完整链路见 [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L524-L710)：
  - 先 `freezeCredits({ reason })`
  - 如果没有图片结果：`refundHold` 并返回错误 `EMPTY_IMAGE_RESULT`
  - 有图片结果：`settleHold({ actualCost: resolvedCost })`，写入 image_history，返回图片 URL（优先返回 `/files/...` 形式）

前端生成的“防御性”处理（很关键，避免卡死/安全问题）：
- 超时：`AbortController` + `setTimeout`（`generateText/img2img` 默认 120s）  
- 图片输入限制：最多 3 个，base64 最大 25MB（防止把浏览器/服务器打爆）  
- URL 安全：只允许 `http/https/blob/data:image/*` 等安全协议，且 `'/files/...'` 会自动补全成后端 base url  
见 [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L39-L101)

### 6.3 AI 工坊的“历史记录”（guest 与登录用户不同）

实现文件： [agentImg/index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L960-L1079)

- 未登录（guest_）：
  - 历史记录保存在浏览器 localStorage
  - 并且做了节流（throttled）避免频繁写入导致卡顿  
  - `MAX_HISTORY = 200`，防止无限增长
- 已登录：
  - 历史记录从后端拉取：`GET /api/images/history/:userId?limit=200`
  - 后端会从用户记忆文件的 `image_history` 字段返回（`server.js` 有对应路由）

### 6.4 算力商城（/artigen/market）——购买与到账检测

实现文件： [AetherMarket.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/AetherMarket.vue)

用户看到的流程：
1) 选套餐（starter/standard/pro/ultimate）  
2) 前端调用创建订单接口，打开支付链接  
3) 支付完成后，页面自动轮询余额变化（到账成功则停止）

前端调用：
- 创建订单：`createPayOrder(packageId)` → `POST /api/pay/create-order`（封装在 [points/index.ts](file:///g:/AvuePro/newPro/frontend/src/points/index.ts#L54-L92)）
- 查询余额：`getCreditsBalance()` → `GET /api/credits/balance?userId=...`
- 轮询逻辑：每 4 秒查询一次，最多 2 分钟超时；余额大于 baseline 判定到账

后端实现：
- `POST /api/pay/create-order` 在 [backend/imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js) 实现：
  - 校验必须已登录（拒绝 guest_）
  - 生成 `pay_...` 订单号
  - 返回 `payUrl`（按 env 映射拼接到爱发电支付页）
- 爱发电支付完成后：后端通过 webhook `/api/pay/afdian/webhook` 入账，并记录到 `credits_orders.json` 等文件

### 6.5 订单与点数明细（/artigen/orders 与 /artigen/usage）

前端 API 封装在 [points/index.ts](file:///g:/AvuePro/newPro/frontend/src/points/index.ts)：
- `getCreditsOrders()` → `GET /api/credits/orders`
- `getCreditsHolds()` → `GET /api/credits/holds&limit=...`

后端路由在 [backend/imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L513-L532)：
- `/api/credits/orders`：返回该用户所有入账订单  
- `/api/credits/holds`：返回该用户最近冻结/扣除/退款记录（hold）

---

## 7. 格式工厂（/artigen/format-factory）——“纯前端处理”的实现逻辑

入口文件： [FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)  
核心状态机： [useFormatFactory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useFormatFactory.ts)

### 7.1 为什么它是“纯前端”

格式工厂的大部分工具不需要后端：
- 读取用户文件（File/Blob）  
- 用 Canvas/PDF.js/编码器在浏览器本地处理  
- 生成处理结果 Blob  
- 用 `URL.createObjectURL()` 生成下载链接并导出  

这带来两个产品价值：
- 隐私：用户文件不上传服务器  
- 速度：无需网络传输，大文件处理更快（瓶颈在本机）

### 7.2 工具状态机（选工具 → 选文件 → 参数 → 运行 → 下载）

在 [useFormatFactory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useFormatFactory.ts) 里，核心状态包括：
- `activeToolId / activeTool`：当前选择的工具  
- `sourceFile / sourceFiles`：输入文件（部分工具支持批处理）  
- `outputBlob / outputUrl / outputItems`：输出结果与可下载链接  
- `progress`：进度（支持批处理时把“每个文件”的进度映射成整体进度）  
- `runController`：AbortController，用于用户取消/防止重复点击造成并发处理

### 7.3 性能与稳定性细节（这里做得很实用）

- Object URL 生命周期管理：输出/输入 URL 会被 revoke，防止内存泄漏  
- 批处理进度聚合：例如 webp/jpeg/ico 等批处理，会把每个文件 0-100 的进度映射为全局进度  
- 取消能力：切工具/关闭弹窗会 abort 当前任务  
- 输入校验：根据 toolId 限制 accept 文件类型、限制页数/尺寸等

---

## 8. 工程化与性能优化汇总（可对外宣传/写 PRD 的点）

### 8.1 前端打包拆包（减少首屏体积）

在 [vite.config.ts](file:///g:/AvuePro/newPro/frontend/vite.config.ts#L194-L209) 里手动配置了 `manualChunks`：
- `vue`、`antd`、`echarts`、`three`、`pixi`、`mediapipe`、`pdf`、`gsap`  

效果：
- 首屏只加载路由所需 chunk，重库按需加载  
- AI 工坊/格式工厂/商城各自的依赖不会互相拖累

### 8.2 前端调用的“防爆”与“可取消”

在 [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts)：
- 每次请求都有 requestId（便于后端幂等/追踪）  
- AbortController + 超时，避免请求永远 pending  
- 图片输入数量与 base64 大小上限，避免浏览器内存炸掉

### 8.3 后端接口的限流与扣费一致性

当前实现里扣费一致性主要靠“冻结-结算-退款”的资金模型（见 [credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L114-L265)），能保证：
- 请求开始即锁定用户额度（避免并发透支）
- 失败能自动退回（避免误扣）

限流目前在部分路由上已使用（例如 usage/admin），但 **`/api/img2img` 与 `/api/generate` 这两条高成本路由仍建议补齐服务端限流与并发闸门**（见本文最后的优化计划）。

积分实现核心在：
- [credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js)
- [storage.js](file:///g:/AvuePro/newPro/backend/utils/storage.js)

---

## 9. 关键配置项（部署/联调时最常用）

### 9.1 前端环境变量

在 [utils/api.ts](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts)：
- `VITE_API_BASE` 或 `VITE_AGENT_API_BASE`：后端 base URL  
  - 不配时默认走同源 `/api`（适合本地 Vite proxy）

本地开发时 Vite proxy 见 [vite.config.ts](file:///g:/AvuePro/newPro/frontend/vite.config.ts#L174-L193)：
- `/api` → `http://localhost:8080`
- `/files` → `http://localhost:8080`

### 9.2 后端环境变量（AI + 积分 + 支付）

从 [server.js](file:///g:/AvuePro/newPro/backend/server.js) 与 [backend/imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js) 可见常用项：

- AI：
  - `API_KEY`：Gemini Key（存在则优先用 Gemini 文本）  
  - `SILICONFLOW_API_KEY`：SiliconFlow Key（img2img 必需；generate 可作为 fallback 或 qwen）  
  - `SILICONFLOW_IMAGE_MODEL`：图片模型名（写入 image_history 也会记录）  
- 积分：
  - `CREDITS_COST_GENERATE`：/api/generate 扣费（默认 10）  
  - `CREDITS_COST_IMG2IMG`：/api/img2img 扣费（默认 10）  
- 支付（爱发电）：
  - `AFDIAN_PAGE_URL` / `AFDIAN_PAY_URL` / `AFDIAN_ORDER_CREATE_URL`：支付页基础 URL  
  - `AFDIAN_PACKAGE_PAY_URL_MAP` / `AFDIAN_PACKAGE_PLAN_ID_MAP` / `AFDIAN_PLAN_PACKAGE_MAP`：套餐与支付链接/planId 映射  
  - `AFDIAN_ENFORCE_AMOUNT_MATCH`：是否强制校验金额一致  

---

## 10. 你要二次开发时，建议从哪里下手（按需求场景）

### 10.1 想新增一个“AI 生成模式/模型”

推荐改动点：
- 前端：在 [agentImg/index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue) 增加模型选项与传参  
- 前端：在 [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts) 按需扩展 payload  
- 后端：
  - 文本侧：在 [system.js](file:///g:/AvuePro/newPro/backend/routes/system.js#L370-L545) 扩展 `/api/generate` 的 provider/模型与计费映射  
  - 图片侧：在 [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L524-L710) 扩展 `/api/img2img` 的模型白名单与入参校验，并复用积分冻结逻辑

### 10.2 想新增一个“格式工厂工具”

推荐改动点：
- `data/formatFactoryTools.ts`：新增工具配置  
- `logic/formatFactory/processors.ts`：新增处理器（尽量纯函数 + 可进度回调）  
- `useFormatFactory.ts`：把工具 id 接到 UI 参数与执行分支

### 10.3 想调整扣费策略（价格/冻结逻辑/套餐）

推荐改动点：
- 后端：`CREDITS_COST_*` env 默认值与校验（见 [system.js](file:///g:/AvuePro/newPro/backend/routes/system.js#L77-L120) 与 [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L524-L566) 的 cost resolve）  
- 后端：`backend/imgagent/credits.js`（冻结/确认/退款/合并钱包/订单入账）  
- 前端：商城套餐展示在 [AetherMarket.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/AetherMarket.vue) 与后端 payPackages（`backend/imgagent/index.js`）

---

## 11. 相关代码快速导航（最常用入口）

- AI 工坊页面：[index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue)  
- 深度思考方向规划：[useAgentImgFlow.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts)  
- 产品档案上下文：[useAgentImgSettings.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgSettings.ts)  
- 文本/图片生成请求封装：[services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts)  
- 算力商城：[AetherMarket.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/AetherMarket.vue)  
- 积分前端 API：[points/index.ts](file:///g:/AvuePro/newPro/frontend/src/points/index.ts)  
- 后端 generate：[system.js](file:///g:/AvuePro/newPro/backend/routes/system.js)  
- 后端 img2img：[imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js)  
- 后端积分系统：[credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js)  
- 后端商城/订单/webhook：[backend/imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js)

---

## 12. P0 问题与分阶段优化计划（计划 + 已落地项）

本节基于当前代码（后端 `backend/*` + 前端 `frontend/src/agentImg/*`）梳理“最急需提升”的点，并给出可落地的分阶段计划与验收方式；其中部分 P0 已落地，会在条目标题中标注「已修复」。

### 12.1 P0（必须优先，安全/资金/稳定性）

1) **/files 的访问控制（已修复：非 guest 需鉴权，支持 admin 审核读取）**  
现状：`/files/:userId/*` 已按 userId 做访问控制（见 [server.js](file:///g:/AvuePro/newPro/backend/server.js#L184-L270)）：  
- `guest_*`：仍作为公开静态资源（`Cache-Control: public`）。  
- 非 `guest_*`：必须满足其一：  
  - 资源 owner：Bearer token 解析出的 userId 与路径 userId 一致；  
  - 控制台 admin：Bearer admin token 或 `X-Admin-Key` 通过校验，可跨用户读取（用于控制台内容审核展示图片）。  
建议：保留上述鉴权逻辑的同时，尽量让 guest 文件路径不可枚举（随机前缀/分层目录）；如需进一步收敛风险，可考虑“短期签名 URL（过期时间 + HMAC）”。  
验收：随机用户拿到他人 `/files/...` 路径时必须 401/403；控制台 admin 可正常展示；自身路径可正常展示与下载。

2) **persistImageRefForUser 存在 SSRF 风险（可被利用请求内网资源）**  
后端会对任意 `http(s)` 图片 URL 进行抓取并落盘（见 [persistImageRefForUser](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L144-L199)）。如果攻击者能传入内网地址，可能造成 SSRF。  
建议：  
- 禁止私网/本机 IP（127.0.0.0/8、10/8、172.16/12、192.168/16、::1、fc00::/7 等）；禁止 `localhost` 与 `.local`；限制重定向跳转次数并在每次跳转后重复校验。  
- 引入允许列表：只允许可信上游（例如 siliconflow 的输出域名）与本站 `/files/`；对用户自带 URL 一律拒绝或走前端直传 base64。  
验收：对私网 URL 必须拒绝；对合法 siliconflow 输出 URL 正常落盘。

3) **高成本路由缺少服务端限流/并发闸门（成本与稳定性风险）**  
`/api/img2img` 与 `/api/generate` 当前没有强制 rateLimit 包裹（入口分别见 [img2img](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L524-L710)、[generate](file:///g:/AvuePro/newPro/backend/routes/system.js#L370-L545)）。  
建议：  
- 增加按 IP + userId 的双维度限流；对同一 userId 进行并发数限制（例如同一时刻最多 1–2 个生成）。  
- 增加“重复 requestId”快速返回（目前冻结侧已幂等，但生成侧仍会打到上游）。  
验收：压测下后端 QPS/并发可控，不会把上游打爆；重复请求不会重复消耗上游。

4) **前端日志可能泄露 prompt/用户输入（已修复：默认脱敏且仅调试可见）**  
现状：前端请求封装的日志已改为默认脱敏（只记录 `promptLen/promptHash`），且仅在开发环境或手动开启调试开关时输出（见 [shouldLogAiRequest](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L17-L26)、[img2img 日志](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L194-L320)、[generateText 日志](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts#L358-L472)）。  
验收：生产构建中不输出 prompt 原文；仅在 `import.meta.env.DEV` 或 `localStorage.agent_debug_enable_v1=1` 时可看到调试日志。

### 12.2 P1（重要，性能/一致性/可维护性）

1) **图片落盘与展示策略统一**  
`/api/img2img` 会把上游 URL 下载后落盘到 `/files/...`（见 [persistImageRefForUser](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L144-L199)），但仍可能返回远端 URL（当落盘失败或输入就是远端）。  
建议：  
- 统一约定“前端展示优先用 `/files/`，下载优先用 `/files/`”；落盘失败时返回明确状态字段（例如 `persisted: false`）用于 UI 提示与重试。  
- 对落盘失败增加可观测性：写入 usage_ledger 的 status 与错误码（便于控制台统计）。  

2) **usage_ledger / image_history 口径统一与可追踪性增强**  
现在 ledger 里记录了 creditsDelta、token usage、trigger 等（见 [usageLedger.js](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L143-L196) 与 img2img 写入逻辑）。  
建议：  
- 增加统一字段：`purpose/reason/deepMode/requestSource`，让控制台可以按“AI Design 深度思考/快速模式”拆解成本。  
- 统一 requestId 生成规范：同一轮生成从方向分析到出图保持链路关联（例如 parentRequestId）。  

3) **服务端错误码与前端人性化映射补齐**  
前端已对 `INSUFFICIENT_CREDITS/EMPTY_IMAGE_RESULT/UPSTREAM_TIMEOUT` 做映射（见 [useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts#L150-L225)）。  
建议：  
- 后端对常见失败补齐稳定错误码集合（4xx/5xx 分层），并对上游错误做归一化（例如 `SILICONFLOW_IMAGE_429`）。  

### 12.3 P2（增强项，体验/运营/增长）

- 历史记录支持删除/导出/多端同步（已登录用户 image_history）。  
- 生成队列与“排队中/预计等待”体验；失败重试与一键复用参数。  
- 控制台增加“按模型/按 reason 的成本、成功率、平均时延、落盘命中率”报表。

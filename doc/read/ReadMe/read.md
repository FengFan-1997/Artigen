# Artigen / agentImg 项目面试速通（代码层面）

> 目标：让“只懂业务、不懂代码”的前端同学能把项目讲清楚：技术栈、模块怎么分、核心链路怎么跑、难点怎么解决、你负责了什么。

## 0. 一句话介绍（面试开场）

这是一个 **Vue3 + Node/Express** 的 AI 应用：前端提供「AI 设计作图（agentImg）」与「运营控制台」，后端统一代理大模型/生图服务，负责 **鉴权、限流、图片落盘、点数计费、使用流水（usage ledger）记录**，并提供历史记录、静态文件访问等能力。

## 1. 技术栈（按端拆开讲）

### 1.1 前端（frontend）

- 框架：Vue 3 + TypeScript + Vite（入口：[main.ts](file:///g:/AvuePro/newPro/frontend/src/main.ts)）：负责创建应用并安装全局插件（Pinia/Router/UI/埋点）
- 路由：vue-router：[router/index.ts](file:///g:/AvuePro/newPro/frontend/src/router/index.ts)：路由表 + SEO meta 注入 + chunk load error 自恢复
- 状态：Pinia：[stores/index.ts](file:///g:/AvuePro/newPro/frontend/src/stores/index.ts)、[stores/language.ts](file:///g:/AvuePro/newPro/frontend/src/stores/language.ts)：全局状态（登录弹窗/语言等）
- UI：Ant Design Vue（`app.use(Antd)`）
- 其它：vue3-lazyload（图片懒加载）、marked（markdown 渲染）、echarts（图表）、three/VRM、pixi-live2d（项目还有 3D/Live2D 相关能力）

### 1.2 后端（backend）

- 运行：Node.js + Express（入口：[server.js](file:///g:/AvuePro/newPro/backend/server.js)）：安全头/requestId/日志/限流/路由装配的总入口
- 配置：dotenv（读取 `backend/.env`）
- 网络：node-fetch 动态 import + 超时封装：[fetch-utils.js](file:///g:/AvuePro/newPro/backend/lib/fetch-utils.js)
- AI Provider：
  - 文本：Gemini / SiliconFlow（可配置优先级与 fallback）：[ai-providers.js](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js)
  - 生图/图生图：SiliconFlow Images API（含并发限制、模型 fallback、错误码包装）：[ai-providers.js](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js)
- 数据存储：以 **JSON 文件**为主（用户、点数钱包、计费 hold、usage ledger、事件采集等），由统一工具读写：[storage.js](file:///g:/AvuePro/newPro/backend/utils/storage.js)

## 2. 代码结构（面试最推荐的讲法）

### 2.1 Monorepo 脚本

- 根目录脚本同时启动前后端（concurrently）：
  - [package.json](file:///g:/AvuePro/newPro/package.json)
  - `pnpm run dev` 会并行执行 `pnpm --dir backend run dev` + `pnpm --dir frontend run dev`

### 2.2 前端目录（核心只看这几个）

- `frontend/src/agentImg/`：AI 设计作图模块（你的主战场）
  - 入口页面与布局：`index.vue`、`views/*`
  - 核心逻辑拆到 composables：`composables/useAgentImg*.ts`
  - 与后端交互封装：`services/text.ts`
- `frontend/src/login/`：登录页、验证码/密码登录、session 持久化
- `frontend/src/utils/`：API base 适配、埋点等

### 2.3 后端目录（按职责划分）

- `backend/server.js`：应用入口 + 中间件 + 路由安装（“总装配”）
- `backend/routes/*`：按业务拆的路由模块（auth/admin/usage/system/hf）
- `backend/imgagent/*`：专门负责 **生图、点数扣费、历史记录** 的路由与逻辑
- `backend/lib/*`：通用能力（限流、鉴权、AI provider、usage ledger、memory manager 等）
- `backend/utils/storage.js`：文件落盘（JSON）统一入口

## 3. 核心链路 ①：登录/鉴权（你要能讲清楚它怎么保护接口）

### 3.1 前端：userId/token 如何产生与持久化

- 未登录用户也会有 `guest_` 形式的 userId（用于匿名使用与数据隔离）：
  - [login/session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts)：负责 guest userId 生成、token 读取、登录态判断与兼容旧 key（核心函数：`ensureGuestUserId()`、`getCurrentUserId()`、`getAuthToken()`、`isLocalLoggedIn()`）
- 登录成功后，把 `userId` 与 `token` 写入 localStorage（兼容 legacy key）：
  - `setLoggedIn({ userId, token })`：[login/session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts)

### 3.2 后端：如何验证“请求里的 userId 就是 token 对应的 userId”

后端核心是 **“userId 绑定 token，不允许代替别人请求”**：

- 入口校验函数：`assertAuthUserMatches(req,res,targetUserId)`：[auth-utils.js](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js)
- 在多个接口里使用：
  - `/api/chat` 在 [server.js](file:///g:/AvuePro/newPro/backend/server.js) 中先取 body 的 userId，再判断非 guest_ 就必须 auth match
  - `/api/img2img` 在 [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js) 同样规则

你可以这样解释安全策略：

- guest_：允许匿名调用（方便产品漏斗）
- 非 guest_：必须带 `Authorization: Bearer <token>`，且 body/path 里的 `userId` 必须等于 token 解出来的 userId，否则 403

## 4. 核心链路 ②：AI 设计作图（agentImg）的端到端流程

这条链路你在面试里讲清楚，基本就稳了。

### 4.1 前端如何组织复杂流程：用 composables 拆职责

agentImg 不是一个“单组件堆逻辑”，而是把复杂流程拆成多个 composables（更好维护/复用/测试心智）：

- [useAgentImgUI.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgUI.ts)：UI 状态与提示（loading/弹窗/错误提示等），避免每个组件自己维护一套
- [useAgentImgAuth.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgAuth.ts)：鉴权与唤起登录（guest_ 可用、需要登录时统一弹窗）
- [useAgentImgUpload.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgUpload.ts)：上传/选图/压缩与转 base64（统一图片输入形态）
- [useAgentImgFlow.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts)：深度思考/方向规划（生成多个方案供用户选择）
- [useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)：真正发起生成（图生图）+ 错误码人类化 + 取消（Abort）+ 埋点
- [useAgentImgHistory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts)：历史记录读取/分页/刷新，与后端 `/api/images/history/:userId` 对接

你可以把它讲成一个“流水线”：

1) 用户输入文案/上传参考图  
2)（可选）深度思考：先让大模型生成 4 个方向（标题+总结+风格标签）  
3) 用户选一个方向 → 拼出最终 prompt/negative prompt  
4) 调用 img2img 出图 → UI 展示、支持取消、写入历史

### 4.2 前端如何请求后端：统一走 buildApiUrl

- API base 通过环境变量 `VITE_API_BASE`（或 `VITE_AGENT_API_BASE`）注入，能适配本地/线上：  
  - [utils/api.ts](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts)：统一拼接 baseUrl，并做“线上禁止误指向 localhost”的防呆
- agentImg 请求封装在：
  - [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts)：封装 `/api/generate`、`/api/img2img`，统一 requestId/timeout/AbortController/errorCode 处理

### 4.3 后端 /api/img2img 的完整流程（扣费 + 调用 Provider + 图片落盘 + 记账）

`/api/img2img` 路由在：[imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L569-L730)

你可以按下面顺序讲（这是代码真实执行顺序）：

1) 参数校验：`MISSING_USER_ID`、`EMPTY_PROMPT` 等  
2) 鉴权：非 guest_ 走 `assertAuthUserMatches`  
3) 资源控制：同 userId 的并发 slot（防止同用户狂点导致后端堆积）  
4) 计费冻结：先把要扣的点数从 available 转到 frozen（hold），避免生成成功但扣费失败  
   - [credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js) 的 `freezeCredits()` / `confirmHold()` / `refundHold()`  
5) 调用生图服务：`callSiliconFlowImageGenerate()`（并发限制、超时、错误码包装）  
   - [ai-providers.js](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js)
6) 图片落盘：把 provider 返回的 url/base64 转成 `/files/...` 本地可控链接（带安全校验，防 SSRF）  
   - [persistImageRefForUser](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L145-L214)
7) 失败回滚：任何关键失败会退还 hold（保证用户体验与财务一致性）  
8) usage ledger 记账：把 requestId、用户、耗时、错误码、预计扣费等写入 `usage_ledger.json`  
   - [upsertUsageLedgerItem](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L143-L195)

## 5. 核心链路 ③：点数/扣费与“可追踪流水”（为什么这么设计）

### 5.1 为什么要有 hold（冻结）机制

生图调用是外部服务，有不确定性：超时、失败、429、返回空图……  
如果“先扣费再出图”，失败就要补偿；如果“先出图再扣费”，扣费失败就变成白嫖。

所以采用两阶段：

- 冻结（freeze）：从 available 挪到 frozen（生成开始前）
- 确认（confirm/settle）：生成成功后把 frozen 真正扣掉（或按实际 cost settle）
- 回滚（refund）：生成失败/落盘失败 → 把 frozen 退回 available

实现见：[credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js)

### 5.2 usage ledger 是什么、解决什么问题

它是一个“流水账”，用来回答：

- 这次请求是谁发的？（userId/sessionId/projectId）
- 调用哪个 provider/模型？（provider/model/usedUrl）
- 花了多久？（durationMs）
- 计划扣多少/实际扣多少？（creditsPlanned/creditsDelta）
- 成功还是失败？为什么失败？（status/errorCode）

实现见：[usageLedger.js](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js)  
落盘位置见：[storage.js](file:///g:/AvuePro/newPro/backend/utils/storage.js#L4-L20)

## 6. 核心链路 ④：限流（Rate Limit）与错误码统一（你可以当成“稳定性工程”讲）

### 6.1 后端限流怎么做

- 基于 token bucket 思路做内存桶：按 `tag|ip` 维度限制
- 命中后返回：
  - HTTP 429
  - `Retry-After` header（秒）
  - JSON `{ error: 'RATE_LIMITED', retryAfterSec, requestId? }`

实现见：[rateLimit.js](file:///g:/AvuePro/newPro/backend/lib/rateLimit.js#L110-L127)

### 6.2 前端怎么把错误码变成用户能懂的话

- agentImg 的错误提示集中在 `humanizeImgError()`：
  - [useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)
  - 例如：`RATE_LIMITED`/`API_ERROR_429` → “请求过于频繁，请稍后再试”

你面试时可以强调“错误码统一”的意义：

- 让前端提示稳定，不依赖后端具体文案
- 让埋点/监控能按 errorCode 聚合
- 让运营后台能按类型统计失败原因（429/503/timeout/insufficient credits…）

## 7. 你可以重点讲的难点与解决方案（都是代码层面）

### 7.1 生图链路的“强一致性”：扣费、落盘、历史、流水必须同进退

- 难点：外部生图成功但落盘失败、或落盘成功但扣费确认失败，会造成体验与财务不一致
- 解决：hold 冻结 + 失败回滚；同时在错误分支也写 usage ledger（用于追踪与排障）

### 7.2 图片落盘的安全问题（URL 下载 = SSRF 风险）

当 provider 返回的是远程 url，如果后端直接 fetch 下载，会有 SSRF 风险（内网/localhost/非 80/443 端口）。

项目里对 `persistImageRefForUser()` 做了多层保护：

- DNS lookup 校验解析结果不落到私网段
- 禁止 `localhost`、`.local`、内网 IP
- 只允许 http/https、只允许 80/443
- 限制最大下载字节数（避免大文件打爆内存/磁盘）

实现见：[memory-manager.js](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L145-L305)

### 7.3 高并发与“点按钮连点”的稳定性

- 后端：并发 limiter（文本/图片不同并发上限）+ user slot（同一 userId 限制并发）
  - [ai-providers.js](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js)
  - [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js)
- 前端：AbortController 支持取消；请求 requestId 标识；失败/取消单独埋点
  - [useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)

### 7.4 线上/本地 API base 适配（避免“线上页面打到 localhost”）

`buildApiUrl()` 会对 baseUrl 做安全过滤：如果页面不是本地但 base 指向 localhost，会直接返回空，避免误配：  
[utils/api.ts](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts)

## 8. 面试时你可以用的“模块职责”总结（背这段就够）

- 前端 agentImg：负责把“用户输入 → 深度思考 → prompt → 出图 → 历史/下载”串起来，并把错误/取消/埋点收敛在统一入口
- 后端 imgagent：负责 **计费一致性**（freeze/confirm/refund）、调用生图 provider、图片落盘、记录 usage ledger
- 后端 system：负责文本生成 `/api/generate`、系统级能力（模型配置、健康检查等）
- 后端 auth：负责登录注册与 token 绑定
- usage ledger：负责“每次请求可追踪、可统计、可排障”

## 9. 关键文件索引（你背路径就能快速定位）

### 9.1 前端入口： [main.ts](file:///g:/AvuePro/newPro/frontend/src/main.ts)：Vue3 应用装配（Pinia/Router/UI/埋点）都在这里完成

这文件就是“前端启动脚本”：把 Vue App 创建出来，然后把路由、状态管理、UI 框架等插件装进去，最后 `mount('#app')`。

- 技术点：`createApp(App)` + `app.use(createPinia())` + `app.use(router)`，这就是 Vue3 应用的标准装配流程
- 业务点：`initAnalytics()` 在最早阶段执行，保证页面进入就能记到埋点（比如后面 router.afterEach 的 pageview）
- 面试说法：我把“全局能力”统一挂在入口，避免每个页面重复初始化

### 9.2 路由与 SEO： [router/index.ts](file:///g:/AvuePro/newPro/frontend/src/router/index.ts)：路由表 + SEO meta 注入 + chunk 加载失败自恢复

这文件负责“页面怎么跳转”，但它不只做路由表，还做了两件工程化工作：**SEO meta 注入** 和 **chunk 加载失败自恢复**（动态 import 失败自动刷新一次）。

- 技术点：`router.afterEach` 里动态设置 `document.title`、meta description、OpenGraph、JSON-LD，并调用 `trackPageView`
- 稳定性：`router.onError` 识别 chunk load error → 给 url 加 `__reload` 做一次兜底刷新
- 面试说法：我把 SEO/埋点收敛到路由层，页面只管业务展示

### 9.3 agentImg 请求封装： [services/text.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/services/text.ts)：前端 API SDK（generate/img2img、超时/取消、错误码归一）

这文件本质是一个“前端 API SDK”：把 `/api/generate`（文生文）和 `/api/img2img`（图生图）封装成函数，统一处理 token、requestId、超时、错误码、图片输入规范等。

- 技术点：使用 `buildApiUrl()` 统一拼 API base；用 `ensureGuestUserId()` 让匿名用户也能走完整链路
- 稳定性：`AbortController` + timeout，保证“卡住的请求”可取消；`toRequestErrorCode()` 把各种异常收敛成前端能识别的 errorCode
- 数据形态：`normalizeImg2ImgImages()` 支持 dataURL/base64/`/files/`，并限制数量与 base64 大小，避免请求体爆炸

### 9.4 agentImg 生成主流程： [useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)：从“方向选择 → 拼 prompt → 出图 → 写历史”的 orchestrator

这文件是“作图业务的大脑”，把多个 composables（鉴权、上传、flow、history、credits、UI）串成一个可执行的生成流程：生成前埋点 → 发起 img2img → 成功写历史/刷新点数 → 失败做错误提示/取消提示。

- 技术点：把错误码集中在 `humanizeImgError()`，做到后端返回什么 code，前端都能稳定提示
- 交互点：支持取消（Abort）并把“取消”和“失败”区分开埋点（比如 `ai_generate_abort` vs `ai_generate_fail`）
- 面试说法：我把复杂流程拆 composables，再由生成主流程做 orchestration，避免单文件巨石

### 9.5 后端入口与路由装配： [server.js](file:///g:/AvuePro/newPro/backend/server.js)：安全/日志/限流/静态文件隔离 + 路由依赖注入的总入口

这是后端“总装配”文件：express 初始化、全局中间件、依赖初始化（storage/ledger/ai providers），然后把 auth/admin/usage/imgagent/system/hf 等路由模块装上去。

- 技术点：通过 `createLedger({...})` 初始化 usage ledger，再把 `upsertUsageLedgerItem` 等能力作为依赖注入给 routes
- 工程点：`rateLimit(tag, opts)` 在入口统一挂载，路由按 tag 控制不同速率（chat/generate/img2img 等）
- 面试说法：我用“依赖注入”的方式组织 routes，避免 routes 内部到处 require 全局单例，后期更容易替换实现

你真正要读懂的是：它不仅是“挂路由”，还把**安全与可观测性**做在入口层，确保每个请求都有 requestId、日志、限流、静态文件隔离。

- 关键位置（requestId 与安全 header）：[server.js:L87-L124](file:///g:/AvuePro/newPro/backend/server.js#L87-L124)  
  - 每个请求都会被注入 `X-Request-Id`（优先复用 header 的 `x-request-id`，否则生成 uuid）
  - 同时设置 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Frame-Options` 等基础安全 header（线上还能按 env 开启 COOP/COEP 与 HSTS）
- 关键位置（结构化请求日志）：[server.js:L126-L147](file:///g:/AvuePro/newPro/backend/server.js#L126-L147)  
  - 可按 env 控制是否记录；记录内容包含 rid/ip/method/url/status/durMs/ua，方便排障与追踪
- 关键位置（CORS 策略）：[server.js:L149-L178](file:///g:/AvuePro/newPro/backend/server.js#L149-L178)  
  - 支持 `CORS_ORIGIN(S)` 白名单；未配置时本地放开、线上默认收敛（避免误开放）
- 关键位置（/files 静态文件“按 userId 隔离”）：[server.js:L184-L241](file:///g:/AvuePro/newPro/backend/server.js#L184-L241)  
  - `/files/<userId>/...` 的访问会校验：guest_ 直接允许；非 guest_ 必须 token 对应 userId 才能读
  - 还做了路径穿越防护（`..`、`\0`、path.resolve root 校验）
- 关键位置（全局 API 限流开关）：[server.js:L254-L270](file:///g:/AvuePro/newPro/backend/server.js#L254-L270)  
  - 入口层可对整个 `/api` 做“总闸”限流，外加每条路由自己再按 tag 细分
- 关键位置（/api/proxy/image 的 SSRF 防护）：[server.js:L272-L510](file:///g:/AvuePro/newPro/backend/server.js#L272-L510)  
  - 允许前端拿远程图片时走后端代理，但严格禁止内网/localhost、限制重定向次数、限制最大字节数，并做图片类型嗅探
- 关键位置（路由安装与依赖注入）：[server.js:L844-L959](file:///g:/AvuePro/newPro/backend/server.js#L844-L959)  
  - `installUsageRoutes / installImgagentRoutes / installSystemRoutes / installHfRoutes` 都是“把能力当参数传进去”，这就是依赖注入的组织方式
- 关键位置（HF 预热）：[server.js:L978-L1017](file:///g:/AvuePro/newPro/backend/server.js#L978-L1017)  
  - 读取 `HF_PREWARM_URLS` 后启动后台预热请求，用于提高冷启动命中率（避免用户第一下卡）

### 9.6 图生图路由： [imgagent/index.js](file:///g:/AvuePro/newPro/backend/imgagent/index.js)：/api/img2img 的“强一致性链路”（扣费/落盘/记账同进退）

这里就是 `/api/img2img` 的核心实现：它不是简单转发，而是一个“强一致性链路”——校验 → 鉴权 → 限流/并发控制 → 冻结点数 → 调用 SiliconFlow 生图 → 图片落盘 → 写 usage ledger → 失败就回滚。

- 技术点：非 guest_ 用户走 `assertAuthUserMatches`，避免“拿别人的 userId 来出图”
- 计费点：先 freeze（hold）再生成，任何异常（provider error/落盘失败）都会 refund，保证用户不会“没图还扣钱”
- 可追踪：成功/失败分支都会 upsert usage ledger，方便在控制台按 requestId 排查

你可以把它讲成“后端把 AI 生成做成一个具备财务一致性与可观测性的事务流程”：

- 关键位置（不同业务触发点的 cost 口径统一）：[imgagent/index.js:L37-L115](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L37-L115)  
  - 前端会传 `reason`（比如 ai_background / ai_id_photo），后端会把 reason 归一化成 key，再映射到点数 cost 与中文 reasonText
- 关键位置（同 userId 并发 slot）：[imgagent/index.js:L121-L154](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L121-L154)  
  - `IMG2IMG_USER_MAX_CONCURRENCY` 控制同一用户同时最多几个 img2img，避免“连点”把后端堆满
- 关键位置（/api/img2img 入口与校验/鉴权/冻结）：[imgagent/index.js:L569-L635](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L569-L635)  
  - 参数不合法直接返回 `MISSING_USER_ID / EMPTY_PROMPT`
  - 非 guest_ 必须 `assertAuthUserMatches`
  - `freezeCredits` 失败会返回 402，并把 wallet 一并带回（前端可直接提示余额不足）
- 关键位置（调用上游失败的回滚与错误码透传）：[imgagent/index.js:L636-L689](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L636-L689)  
  - provider 抛错会 refund hold，并把 `e.code/e.message` 收敛为 errorCode
  - 同时写一条 usage ledger（status=error、creditsDelta=0、creditsPlanned=resolvedCost），用于排障
- 关键位置（输出图落盘与“persistSummary”）：[imgagent/index.js:L691-L840](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L691-L840)  
  - 对每张 provider 图片尝试落盘成 `/files/...`，并记录每种落盘失败的原因统计（方便后续优化）
- 关键位置（输入图也落盘，保证历史可复现）：[imgagent/index.js:L774-L829](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L774-L829)  
  - 输入图如果是 url 也会尝试落盘；如果是 `{ mimeType,dataBase64 }` 就写文件
- 关键位置（成功记账 + 写入图片历史）：[imgagent/index.js:L842-L933](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L842-L933)  
  - ledger 写入包括 provider/model/耗时/ip/ua/seed/timings/图片数量/落盘统计
  - image_history 会记录 prompt、negativePrompt、params、inputImages、images，前端历史列表就靠这里
- 关键位置（点数商城与订单回调）：[imgagent/index.js:L962-L1163](file:///g:/AvuePro/newPro/backend/imgagent/index.js#L962-L1163)  
  - `POST /api/pay/create-order`：生成本地 orderId + 拼 Afdian 支付链接（remark 里带 userId/packageId/orderId）
  - `POST /api/pay/afdian/webhook`：可选验签 + 解析 remark 兜底取 userId/packageId + 做幂等入账

### 9.7 点数钱包与冻结扣费： [credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js)：available/frozen + hold 的两阶段扣费实现

这是点数系统的“账本实现”：钱包（available/frozen）和 hold（冻结记录）都落盘到 JSON 文件，提供 freeze/confirm/settle/refund 四类核心操作。

- 技术点：`freezeCredits()` 会把 available 扣到 frozen，并生成 holdId；同 requestId 会复用已有 hold（避免重复冻结）
- 一致性：`confirmHold()` / `settleHold()` 把 frozen 真正扣掉（或按实际扣费），`refundHold()` 退回 available
- 面试说法：两阶段扣费（hold）是为了兼容外部服务不确定性，避免“扣了钱没结果”或“有结果没扣钱”

关键是你要能说清楚“为什么要分 available / frozen”以及“如何保证幂等”：

- 关键位置（钱包初始化与默认赠送点数）：[credits.js:L36-L69](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L36-L69)  
  - `ensureWallet()` 会在首次使用时创建钱包，默认初始点数来自 env（`CREDITS_INIT`）
- 关键位置（冻结：同 requestId 幂等复用）：[credits.js:L115-L167](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L115-L167)  
  - `findHoldByRequestId()` 会扫描 holds：相同 userId + requestId（可选 reason）直接返回已有 holdId，避免重复冻结
  - 真正冻结时：available -= cost，frozen += cost，并把 hold 记录写入 `credits_holds.json`
- 关键位置（结算：按实际 cost 多退少补）：[credits.js:L200-L234](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L200-L234)  
  - `settleHold({ actualCost })`：如果实际 cost 小于冻结 cost，会把差额 refund 回 available
  - 这是“强一致性”的关键：外部服务不确定，但账本永远能对上
- 关键位置（退款）：[credits.js:L236-L265](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L236-L265)  
  - provider 失败/落盘失败等场景，直接把 frozen 退回 available
- 关键位置（每日签到赠送）：[credits.js:L299-L319](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L299-L319)  
  - `lastCheckinDay` 用 ISO 日期 key 去重，保证一天只能领一次
- 关键位置（订单入账的幂等）：[credits.js:L321-L360](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L321-L360)  
  - `applyAfdianOrder()` 以 `afdianOrderId` 做幂等：处理过就直接返回 alreadyProcessed，避免重复加点

### 9.8 限流： [rateLimit.js](file:///g:/AvuePro/newPro/backend/lib/rateLimit.js)：按 tag|ip 的内存 token bucket 限流，统一返回 RATE_LIMITED

这文件做了一个轻量的 in-memory rate limiter：按 `tag|ip` 建桶，类似 token bucket 的“按时间补充 token”方案，命中则返回 429。

- 技术点：命中返回 `{ error: 'RATE_LIMITED', retryAfterSec, requestId? }`，并带 `Retry-After` header，前端就能做统一提示
- 实用点：`getClientIp()` 支持 trust proxy + x-forwarded-for，并过滤私网场景（尽量取到真实 ip）
- 面试说法：后端限流是稳定性兜底，防止接口被刷爆导致全站不可用

### 9.9 流水账： [usageLedger.js](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js)：按 requestId upsert 的可观测性核心（统一口径/可追踪）

这是“可观测性”的核心：把每次 AI 请求（成功/失败/耗时/扣费/错误码）做统一记录，写进 `usage_ledger.json`，后面运营台或排障都靠它。

- 技术点：`upsertUsageLedgerItem()` 以 requestId 为主键 upsert，并用 `mergeLedgerItem()` 做字段合并（避免多次写入互相覆盖关键信息）
- 字段口径：把 `error`、`duration`、`credits` 等老字段归一到 `errorCode`/`durationMs`/`creditsDelta`，方便统计聚合
- 面试说法：我做了统一流水口径，让数据能“按 errorCode 聚合、按 requestId 追踪”

它解决的是：线上出现“扣费异常/上游 429/落盘失败/超时”，你能在同一个地方**按 requestId 把整条链路串起来**。

- 关键位置（requestId 清洗与安全）：[usageLedger.js:L25-L30](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L25-L30)  
  - `sanitizeLedgerId()` 把 requestId/sessionId/projectId 变成可落盘、可索引的安全字符串（只保留 `[a-zA-Z0-9_-]`）
- 关键位置（upsert + 字段归一）：[usageLedger.js:L143-L195](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L143-L195)  
  - 如果旧代码写了 `error/duration/credits`，这里会自动映射到 `errorCode/durationMs/creditsDelta`
  - 多次写同一个 requestId 会走 merge（补齐字段而不是覆盖掉已有关键字段）
- 关键位置（merge 规则）：[usageLedger.js:L113-L141](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L113-L141)  
  - 字符串会 trim + 截断；数字要 finite；数组/对象要非空，整体避免把“空值”写坏数据
- 关键位置（计算文字链路的点数消耗）：[usageLedger.js:L197-L204](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L197-L204)  
  - 按 tokensTotal 与 ragUsed 估算 credits（给文本链路做口径化计费/统计）
- 关键位置（轻量埋点事件存储）：[usageLedger.js:L80-L111](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L80-L111)  
  - `appendAnalyticsEvent()` 会对 payload 做白名单式清洗，避免把超大/敏感内容写进 analytics_events.json

### 9.10 图片落盘与安全： [memory-manager.js](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js)：把外部图片落为 /files/，并补齐 SSRF 防护与历史/记忆

这文件里最关键的是 `persistImageRefForUser()`：把外部图片（dataURL 或远程 http/https url）保存到服务端本地的 `/files/...`，这样前端展示/下载走我们自己的域名，不依赖上游链接长期有效。

- 安全点：对远程 url 做了多层校验（禁止 localhost/内网段、限制端口、DNS 解析检查），本质是在防 SSRF
- 稳定性：限制最大下载字节数，避免大文件把内存/磁盘打爆
- 面试说法：我把“外部不稳定资源”落到本地可控存储，提升可用性，同时补齐了 SSRF 安全防护

它不只是“保存图片”，还承担了：输入图落盘、历史记录落盘、用户长期记忆压缩（把短期 buffer 压成 core memory）。

- 关键位置（写文件：按 userId 分目录 + 生成随机文件名）：[memory-manager.js:L69-L93](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L69-L93)  
  - 所有用户文件最终都会变成 `/files/<userId>/<filename>`，配合 server.js 的鉴权隔离
- 关键位置（persistImageRefForUser：dataURL/远程 url 落盘）：[memory-manager.js:L145-L364](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L145-L364)  
  - dataURL：直接 base64 解码写文件
  - 远程 url：严格校验协议/端口/host/DNS 解析结果，限制最大字节数与重定向次数，最后写入 `/files/`
- 关键位置（persistGenerateImageInputForUser：前端 base64 输入图落盘）：[memory-manager.js:L366-L381](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L366-L381)
- 关键位置（图片历史写入 user memory）：[memory-manager.js:L388-L406](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L388-L406)  
  - `appendUserImageHistory()` 把最新 entry 插到数组头，并限制最大条数（`IMAGE_HISTORY_MAX_ITEMS`）
- 关键位置（聊天长期记忆：短期 buffer 超阈值自动压缩）：[memory-manager.js:L481-L527](file:///g:/AvuePro/newPro/backend/lib/memory-manager.js#L481-L527)  
  - 缓冲超过阈值后，会调用 text provider 抽取“可长期记住的事实”，写入 `core_memory`，并缩短 short_term_buffer

### 9.11 AI Provider（文本/生图统一出口）： [ai-providers.js](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js)：对接上游模型并做超时/并发/错误码收敛

这文件是后端“真正去调用上游”的地方：不管你是 `/api/generate`（文本）还是 `/api/img2img`（图生图），最终都会走到这里去请求 Gemini/SiliconFlow。它做的不是“简单 fetch”，而是把 **并发控制、上游多端点容灾、错误码收敛、RPM 限制兜底** 全部集中在一个模块里，让路由层只关心业务流程（扣费/落盘/记账），不用每处重复写网络鲁棒性逻辑。

- 并发与排队：用一个自实现的 semaphore（并发上限 + 队列上限），避免上游慢/抖时把 Node 进程堆满（堆积到一定程度就直接返回 `SERVER_BUSY`）
- SiliconFlow RPM 问题兜底：对 SiliconFlow 做最小间隔 gate（串行排队 + 间隔等待），再加上 RPM 错误识别与延迟重试，尽量把“上游节流”吸收在 provider 层
- 多模型/多端点 fallback：Gemini 会轮询多个 endpoint；SiliconFlow chat 会尝试 messages/chat_completions 两个 URL；image 侧会尝试 modelCandidates（优先用户选的模型，其次固定模型）
- 错误码统一：上游各种 HTTP 状态与 body 文本，被包装成 `SILICONFLOW_IMAGE_400/401/403...`、`SILICONFLOW_RPM_LIMIT`、`MISSING_*_API_KEY`、`EMPTY_PROMPT` 这种“可被前端稳定识别”的 code

- 关键位置（SiliconFlow 最小间隔 gate，降低 RPM 风险）：[ai-providers.js:L22-L38](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L22-L38)
- 关键位置（并发 limiter：createSemaphore + run/stats）：[ai-providers.js:L40-L83](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L40-L83)
- 关键位置（Gemini 文本：多 endpoint 轮询 + failures 收集）：[ai-providers.js:L110-L153](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L110-L153)
- 关键位置（SiliconFlow 文本：双 URL 尝试 + usage 解析 + RPM 识别）：[ai-providers.js:L155-L274](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L155-L274)
- 关键位置（SiliconFlow 图像：图片输入规范化 + 模型 fallback + 错误码包装）：[ai-providers.js:L276-L427](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L276-L427)
- 关键位置（文本统一入口 callTextGenerate：provider 选择 + retry + fallback）：[ai-providers.js:L429-L530](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L429-L530)
- 关键位置（Gemini 向量：embedContent 多 endpoint 轮询）：[ai-providers.js:L532-L575](file:///g:/AvuePro/newPro/backend/lib/ai-providers.js#L532-L575)

### 9.12 系统级路由（/api/generate 等）： [system.js](file:///g:/AvuePro/newPro/backend/routes/system.js)：文本生成、系统能力与配置暴露的主要路由

你可以把它理解成“后端文本侧的业务路由集合”：把 **健康检查/诊断接口**、**HF 相关预热**、以及 **/api/generate（文生文）** 统一放在一个模块里，并且同样把“稳定性工程”做得很实用：限流、同 userId 并发 slot、idempotency（避免重复扣费/重复生成）、错误码收敛、usage ledger 记账。

- /healthz /readyz：告诉你服务是否 ready（可选要求必须配置 LLM key 才算 ready），并返回 requestId（方便排障链路串起来）
- /api/health：输出当前 provider、Gemini/SiliconFlow endpoint 配置、HF cache 状态、RAG vectors 文件统计、memoryDir 是否可写；支持 `?probe=1` 做一次轻量“真探测”
- /api/generate：文本生成入口（agentImg 的“深度思考”也走它）
  - 先做 idempotency：同一个 requestId 在 TTL 内重复请求会复用结果，不会重复打上游
  - 再做 per-user 并发 slot：限制同 userId 同时生成数量，避免连点导致服务堆积
  - 再做鉴权：非 guest_ 必须 token↔userId 一致
  - 再做点数 hold：按 purpose 估算 cost，freeze → 成功 settle，失败 refund
  - 最后记 usage ledger：把 provider/model/tokens/creditsDelta/duration/ip/ua 写进去，保证“可追踪”

- 关键位置（ready/healthz）：[system.js:L173-L186](file:///g:/AvuePro/newPro/backend/routes/system.js#L173-L186)
- 关键位置（/api/health 聚合诊断 + probe）：[system.js:L205-L375](file:///g:/AvuePro/newPro/backend/routes/system.js#L205-L375)
- 关键位置（HF 预热：/api/admin/hf/prewarm + 启动自动预热）：[system.js:L377-L534](file:///g:/AvuePro/newPro/backend/routes/system.js#L377-L534)
- 关键位置（/api/generate：idempotency 复用与并发 slot）：[system.js:L638-L710](file:///g:/AvuePro/newPro/backend/routes/system.js#L638-L710)
- 关键位置（/api/generate：点数冻结/回滚/结算）：[system.js:L722-L777](file:///g:/AvuePro/newPro/backend/routes/system.js#L722-L777)
- 关键位置（/api/generate：写 usage ledger + 生成 payload）：[system.js:L779-L857](file:///g:/AvuePro/newPro/backend/routes/system.js#L779-L857)
- 关键位置（/api/generate：错误码归一与 HTTP status 映射）：[system.js:L858-L907](file:///g:/AvuePro/newPro/backend/routes/system.js#L858-L907)

### 9.13 鉴权工具（token→userId）： [auth-utils.js](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js)：解析 token 并强制 userId 匹配

面试讲法可以是：**后端永远不信任前端传的 userId**。只要不是 guest_，就必须带 token，然后后端通过 token 找到用户（resolveAuthUser），再强制比对“targetUserId === token 对应的 userId”，不一致直接 403，避免“拿别人 userId 冒充请求”。

这文件还顺便把几块“安全相关能力”集中在一起：

- 普通用户：token 存在 users.json（sessionToken），后端通过 bearer/cookie 解析 token，再找到 userId
- 管理后台：提供两种 admin 鉴权（Bearer admin token 或 x-admin-key），并且 admin token 是自实现的 HMAC 校验（带 exp 过期）
- 密码：支持 scrypt hash，同时兼容旧的明文 password（验证成功后可提示 upgraded）

- 关键位置（解析 Authorization Bearer）：[auth-utils.js:L74-L79](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L74-L79)
- 关键位置（token → userId：resolveAuthUser）：[auth-utils.js:L255-L263](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L255-L263)
- 关键位置（强制 userId 匹配：assertAuthUserMatches）：[auth-utils.js:L293-L305](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L293-L305)
- 关键位置（密码 hash/verify：scrypt + legacy 兼容）：[auth-utils.js:L30-L57](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L30-L57)
- 关键位置（admin token：签发/校验/过期）：[auth-utils.js:L125-L212](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L125-L212)
- 关键位置（admin 鉴权：Bearer admin token 或 x-admin-key）：[auth-utils.js:L214-L253](file:///g:/AvuePro/newPro/backend/lib/auth-utils.js#L214-L253)

### 9.14 JSON 文件存储统一入口： [storage.js](file:///g:/AvuePro/newPro/backend/utils/storage.js)：所有数据落盘路径与读写都从这里走

项目不是用数据库，而是用 JSON 文件做轻量存储，所以“路径在哪里、怎么读写、怎么保证默认结构”全部由这里集中管理，避免每个模块各写各的导致口径不一致。

这份文件在工程上很关键，因为它决定了“哪些数据是持久化的、落盘目录在哪、怎么写才不会写坏文件”：

- 路径统一：users、usage ledger、credits wallet/holds/orders、pay orders、analytics events、RAG vectors 全部是固定文件名
- 读写封装：readJson/writeJson 统一处理 JSON parse error / 文件不存在
- 写入更安全：writeJson 用临时文件 + rename 方式落盘，尽量避免中途崩溃导致写出半个 JSON
- user memory：按 userId 分文件（user_xxx.json），并且会 sanitize userId，避免奇怪字符把路径搞乱

- 关键位置（MEMORY_DIR 与各种 JSON 文件路径常量）：[storage.js:L4-L20](file:///g:/AvuePro/newPro/backend/utils/storage.js#L4-L20)
- 关键位置（readJson：不存在返回默认值，parse 失败兜底）：[storage.js:L27-L37](file:///g:/AvuePro/newPro/backend/utils/storage.js#L27-L37)
- 关键位置（writeJson：tmp 写入 + rename 原子替换）：[storage.js:L39-L57](file:///g:/AvuePro/newPro/backend/utils/storage.js#L39-L57)
- 关键位置（按 userId 分文件 + sanitizeUserId）：[storage.js:L59-L75](file:///g:/AvuePro/newPro/backend/utils/storage.js#L59-L75)

### 9.15 前端 agentImg 页面入口： [index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue)：把多个 composables 组装成可用的作图页面

它更像“业务容器组件”：负责把 UI（输入区/方向选择/出图区/历史区/点数/模型选择/下载）拼起来，然后把行为交给 composables（flow/generation/history/auth/upload/credits/models/ui/settings），从而做到页面不堆底层逻辑。

你面试时讲它的价值点是：**把大流程拆成多个 composables，然后在页面层做 orchestration（组装/数据流转）**。这里最直观的就是 8 段职责分区：Locale→Auth→Credits→UI→Models→Upload→Flow→History→Generation。

- 状态组织：页面只保存“拼装层”需要的 computed/ref（比如 primaryText/canPrimary/selectedOption*），真正的请求与错误处理都下沉到 composables
- 交互细节：支持拖拽图片到输入框自动占用空位；支持深度模式与快速模式切换时自动 cancel/abort/reset，避免“上一个请求还在跑”
- 成本展示：根据 deepMode / 是否在选方向阶段动态显示 cost 文案（⚡xx），并且 hover tip 解释点数扣费
- 预填充：用 localStorage 的 prefill key 把其它页面选中的参考图带到这里（用户体验更顺）

- 关键位置（所有 composables 在页面层统一装配）：[index.vue:L501-L756](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L501-L756)
- 关键位置（拖拽上传：drop 自动填充预览位 + 取消上一次流程）：[index.vue:L776-L815](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L776-L815)
- 关键位置（主按钮文案/可点击状态/点数展示）：[index.vue:L822-L888](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L822-L888)
- 关键位置（prefill：从 localStorage 消费一次性引用图）：[index.vue:L891-L910](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L891-L910)

### 9.16 前端深度思考/方向规划： [useAgentImgFlow.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts)：从用户输入生成多个可选方案

这块是“先想再画”的关键：先用文本模型产出多个方向（title/summary/styleTags/negativeTags），用户选中一个方向后，再生成最终的 `{ prompt, negativePrompt, params }`，再交给 img2img 去画，减少出图随机性与“用户表达不清导致模型跑偏”。

它的实现方式很工程化：把 LLM 输出强约束成 JSON（schema），然后通过 `extractFirstJsonObject()` 抽取第一段 JSON，再用 normalize/校验函数做字段口径化，确保 UI 一定拿到“可用的 4 个方向/一个最终 prompt”。

- Prompt 构建：前端只传结构化字段（stage/userInput/contextText/memoryInputs/option 等）给 `/api/generate`；后端按 purposeKey 选择 `buildAgentImgDirectionPrompt` / `buildAgentImgFinalPrompt`，把 schema、语言约束（中英）、输出格式规则（summary 必须 7 行、tag 数量范围等）写进 system prompt，减少模型乱输出
- 多轮输入融合：会把 userInputMemory（历史输入）融合进 prompt，并声明冲突时以最新为准
- 解析兜底：方向建议如果解析不到 4 个，会自动重试一次（attempt=1），仍失败就给出 PARSE_OPTIONS_FAILED
- 可取消：内部持有 AbortController，切换模式/重置时能取消正在跑的 generateText

- 关键位置（后端方向阶段 prompt 构建 + 规则约束）：[system.js:L341-L385](file:///g:/AvuePro/newPro/backend/routes/system.js#L341-L385)
- 关键位置（后端最终 prompt 构建：融合 baseStyle 与安全 negative）：[system.js:L387-L428](file:///g:/AvuePro/newPro/backend/routes/system.js#L387-L428)
- 关键位置（前端调用 /api/generate：统一 requestId + purpose + images）：[useAgentImgFlow.ts:L193-L214](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts#L193-L214)
- 关键位置（analyzeDirections：解析 options，不足 4 个自动重试）：[useAgentImgFlow.ts:L216-L276](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts#L216-L276)
- 关键位置（generateFinal：解析 prompt/negativePrompt/params）：[useAgentImgFlow.ts:L278-L310](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgFlow.ts#L278-L310)

### 9.17 前端历史记录： [useAgentImgHistory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts)：对接后端 image_history 并做分页/刷新

你可以强调“历史是后端落盘的，不怕刷新丢失”：后端写入用户 memory 的 `image_history`，前端登录后会按 userId 拉取；同时前端也做了 localStorage 兜底（网络失败或未登录时仍能看到最近历史）。

它这里的工程点主要是“数据规范化与降噪”：

- storage key 按 userId 隔离：不同用户历史不串号（guest_ 也有自己的 key）
- 本地历史读取：会过滤无效条目（没有 prompt/negativePrompt/ts 的不算），并限制最大条数
- 远端历史读取：从 `/api/images/history/:userId?limit=200` 拉数据，提取第一张图当作列表封面，并把 `/files/...` 这种相对路径通过 buildApiUrl 变成可访问的完整地址
- UI 交互：scrollToGeneration 通过 `gen-${id}` 定位到聊天流里的那条生成结果，点击历史直接跳转

- 关键位置（按 userId 生成 localStorage key）：[useAgentImgHistory.ts:L28-L31](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L28-L31)
- 关键位置（从 localStorage 读取并规范化历史）：[useAgentImgHistory.ts:L40-L86](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L40-L86)
- 关键位置（从后端拉 history，并把 /files 路径补成可访问 URL）：[useAgentImgHistory.ts:L107-L169](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L107-L169)
- 关键位置（历史持久化节流：避免每次 push 都写 localStorage）：[useAgentImgHistory.ts:L171-L183](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L171-L183)
- 关键位置（点击历史 → 滚动定位到生成结果 DOM）：[useAgentImgHistory.ts:L192-L201](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L192-L201)

### 9.18 前端 API base 防呆： [api.ts](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts)：环境切换与安全兜底（线上不打 localhost）

这块是工程稳定性：避免 env 配错导致线上页面请求本机接口，同时把 baseUrl 拼接、路径规范化都收敛在一个函数里，agentImg/services 只负责传参。

你可以这么讲它的设计：**把“环境差异”集中在一个地方消化掉**，业务代码只需要写 `/api/img2img` 这种“相对 API 路径”。

- baseUrl 来源：优先 `VITE_API_BASE`，其次 `VITE_AGENT_API_BASE`
- 安全防呆：如果页面不是本地（比如线上域名），但 baseUrl 指向 localhost/127.0.0.1/0.0.0.0/.local，会直接返回空 base（从而避免把请求打到用户本机）
- 路径拼接：支持 base 形态是 `/`、`//`、`http(s)://`，并且对 `/api` 前缀做了避免重复拼接的处理

- 关键位置（解析并校验 baseUrl，线上禁止 localhost）：[api.ts:L7-L22](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts#L7-L22)
- 关键位置（拼接最终 API URL，处理 base=/api 的情况）：[api.ts:L25-L35](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts#L25-L35)

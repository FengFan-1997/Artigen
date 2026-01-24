# 项目经历：Artigen（AI 作图点数计费平台 + 运营控制台）

## 项目概述
- **项目定位**：面向电商/内容团队的 AI 图像生成与素材处理平台，提供「端侧创作工具（agentImg）」+「统一登录体系（login）」+「运营管理控制台（console）」+「后端 API（backend）」的闭环能力。
- **业务形态**：用户可游客试用、登录后沉淀历史与点数；支持点数计费、套餐支付引导、生成记录与用量审计；后台支持数据看板、使用记录分析与导出、内容审计、用户管理等。
- **个人职责（可写简历）**：负责前后端核心架构设计与实现；打通登录/计费/生成/历史/控制台数据链路；完成性能与稳定性优化。

## 技术栈
- **前端**：[Vue 3](file:///g:/AvuePro/newPro/frontend/package.json#L42) + TypeScript + Vite + Pinia + Vue Router
- **组件/可视化**：Ant Design Vue、ECharts（控制台趋势/统计）、Canvas（格式工厂/水印交互）、vue3-lazyload（图片懒加载）
- **后端**：Node.js + Express + node-fetch（上游调用/代理）+ nodemailer（邮箱验证码）+ dotenv + cors
- **工程化**：ESLint / Prettier / vue-tsc；前后端统一 `buildApiUrl` 方式对接 API（[api.ts](file:///g:/AvuePro/newPro/frontend/src/utils/api.ts)，[server.js](file:///g:/AvuePro/newPro/backend/server.js)）

## 核心模块与亮点能力
### 1) agentImg：端侧 AI 作图工作台（用户侧）
- **多能力入口**：AI 影像工坊 / AI 背景 / 证件照 / 老照片 / 配料表 / 格式工厂等（[views](file:///g:/AvuePro/newPro/frontend/src/agentImg/views)）。
- **对话式生成体验**：支持「快速生成」与「深度思考模式」两阶段流程（分析方向 → 编辑方向 → 生成）（[index.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/index.vue#L527-L755)）。
- **可控的生成链路**：支持中断生成（AbortController）、请求去重、失败可解释错误映射（[useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)）。
- **模型策略与分层**：模型下拉选择 + Pro 权限引导（Qwen Image / Edit 模型等），与点数商城联动（[useAgentImgModels.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgModels.ts)）。
- **历史与沉淀**：游客使用本地历史、登录后拉取服务端历史；侧边栏快速定位生成结果（[useAgentImgHistory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts)）。

### 2) login：统一登录体系（游客 → 账号体系）
- **多登录方式**：邮箱验证码、账号密码、Google 登录、重置密码；统一错误语义化（[api.ts](file:///g:/AvuePro/newPro/frontend/src/login/api.ts)）。
- **游客机制**：自动生成 guest_id，支持游客先用后登；登录后可做数据合并（前端：[session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts)，后端合并逻辑见 [auth.js](file:///g:/AvuePro/newPro/backend/routes/auth.js)）。

### 3) console：运营管理控制台（管理侧）
- **可视化与分析**：用量趋势、成功率、延迟统计、Top 模型/用户、CSV 导出；支持按用户/时间段/模型/状态过滤（[Usage.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Usage.vue)）。
- **安全的会话管理**：控制台独立 session 存储与过期校验，支持 bearer / x-admin-key 模式切换（[stores/console.ts](file:///g:/AvuePro/newPro/frontend/src/stores/console.ts)）。

### 4) backend：统一 API 与计费闭环
- **路由分层清晰**：Auth / Admin / Usage / Imgagent / System / HF Proxy 分模块安装（[server.js](file:///g:/AvuePro/newPro/backend/server.js#L409-L523)）。
- **点数计费一致性**：实现“冻结→确认/结算/退款”两阶段扣费，避免上游超时/失败导致的资金不一致，并支持按 requestId 幂等（[credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js#L115-L234)）。
- **用量台账与埋点**：对 usage ledger 与 analytics events 做输入清洗、字段裁剪、容量上限与 upsert（[usageLedger.js](file:///g:/AvuePro/newPro/backend/lib/usageLedger.js#L8-L175)）。
- **安全代理与资源服务**：文件服务防目录穿越；图片代理防 SSRF（禁止私网 host）、限制体积、内容类型嗅探与缓存（[server.js](file:///g:/AvuePro/newPro/backend/server.js#L187-L376)）。

## 性能优化（可写简历）
- **端侧图片预处理降本增效**：上传前对 >2.5MB 图片等比压缩至最长边 1536，并转 JPEG；同时生成 360px 预览缩略图，减少网络传输与加速 UI 展示（[useAgentImgUpload.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgUpload.ts#L61-L161)）。
- **历史写入节流**：游客历史 localStorage 写入 250ms 节流 + 最大 200 条截断，降低频繁写入带来的卡顿与存储膨胀（[useAgentImgHistory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgHistory.ts#L166-L179)）。
- **可取消请求提升交互响应**：生成链路用 AbortController 支持“立即停止”，并清理 pending 状态，避免重复请求堆积（[useAgentImgGeneration.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgGeneration.ts)）。
- **HF 资源代理缓存**：实现磁盘缓存（TTL/容量上限/文件数上限）+ 负缓存 + 后台 prune，降低外部依赖波动并提升命中率（[hf-proxy.js](file:///g:/AvuePro/newPro/backend/lib/hf-proxy.js#L9-L165)）。
- **服务端日志与限流**：按环境开关请求日志并输出 `durMs`；API 统一速率限制，减轻突发流量与恶意请求压力（[server.js](file:///g:/AvuePro/newPro/backend/server.js#L125-L262)）。

## 创新点/优势总结（可写简历）
- **计费幂等与可回滚**：用“冻结/确认/退款/结算”机制把 AI 生成从“扣费动作”解耦出来，能承受上游超时/中断/重试场景，保证钱包一致性（[credits.js](file:///g:/AvuePro/newPro/backend/imgagent/credits.js)）。
- **游客先用后登的增长闭环**：通过 guest_id 先体验、登录后合并数据与权益，降低首次使用门槛并提高转化（[session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts)，[auth.js](file:///g:/AvuePro/newPro/backend/routes/auth.js)）。
- **多模型/分层策略**：在前端完成模型能力分层与 Pro 引导，结合点数商城形成商业化路径（[useAgentImgModels.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useAgentImgModels.ts)）。
- **端到端可观测**：后端统一 `X-Request-Id` 贯穿日志与台账，结合控制台筛选/导出，实现定位问题与运营分析的闭环（[server.js](file:///g:/AvuePro/newPro/backend/server.js#L86-L151)，[Usage.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Usage.vue)）。
- **安全默认开启**：SSR F 防护、文件路径穿越防护、安全响应头、CORS 白名单/可配置，为公开部署提供更高安全基线（[server.js](file:///g:/AvuePro/newPro/backend/server.js)）。

## 简历一句话版本
- **Artigen：AI 作图点数计费平台（Vue3/TS + Node/Express）**：负责端侧作图工作台、统一登录、运营控制台与后端计费闭环；通过端侧图片压缩/缩略图、服务端缓存与限流、两阶段扣费幂等机制，提升生成体验、稳定性与商业化落地能力。


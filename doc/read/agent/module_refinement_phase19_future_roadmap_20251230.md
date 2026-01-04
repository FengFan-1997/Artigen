# 模块阶段 19：未来路线图与改造清单（2025-12-30）

> 目的：基于 mustRead 与 doc2 的约束，以及当前 `frontend/src/agent` 与 `backend/server.js` 的现状，给出未来 1–3 个月的“大方向”、具体要改的地方、以及可拆分为 2–5 模块/次的长期开发清单。

## 0. 当前现状（我读到的真实结构）

### 0.1 前端（Agent）

- Agent 入口容器：`frontend/src/agent/components/Agent.vue`
  - 负责：交互采样、状态机（大量 UI 状态）、聊天窗口、任务 plan 执行、avatarPlan 执行、背景反应（DOM/BOM）、idle AI 等编排。
- VRM：
  - 模型列表与选择：`frontend/src/agent/composables/useVrmModels.ts`
  - 渲染与动作：`frontend/src/agent/components/VrmWidget.vue`
  - 本地“鼠标控制开关”与“Agent 控制不受开关影响”已经在 `Agent.vue` 的 `vrmMouseControlEnabled` 逻辑中体现。
- Live2D（Cubism2/3）：
  - 渲染：`frontend/src/agent/components/Live2DWidget.vue` 
  - 资源基址可走后端 HF 代理：`Live2DWidget.vue` 内有 HuggingFace base 归一化与 `/api/hf/` 替换逻辑。
- 协议与解析：
  - AI 回复解析：`frontend/src/agent/logic/aiReplyParser.ts`
  - avatarPlan 类型：`frontend/src/agent/types/avatarPlan.ts`
  - plan 执行：`frontend/src/agent/composables/useTaskExecutor.ts`
  - avatarPlan 执行：`frontend/src/agent/composables/useAvatarPlanRunner.ts`
- “实时反应”关键链路已存在：
  - 交互采样与语义化：`frontend/src/agent/utils/semanticEvents.ts`
  - 本地人格/系统信号反应：`frontend/src/agent/logic/localReactions.ts`、`frontend/src/agent/logic/systemSignals.ts`
  - 后台反应编排：`frontend/src/agent/composables/useBackgroundReactions.ts`

### 0.2 后端（LLM + HuggingFace 代理 + Memory）

- LLM：
  - 支持 Gemini / SiliconFlow（中国可用）/ offline 回退：`backend/server.js`
  - Chat 入口：`POST /api/chat`
- HuggingFace 模型代理（解决国内可访问的关键）：
  - 资源代理：`/api/hf/:owner/:repo/resolve/:ref/*`
  - 列表代理：`/api/hf-list/:owner/:repo`
  - 已支持多 base 轮询：`HF_RESOLVE_BASES`、`HF_API_BASES`（默认包含 `https://hf-mirror.com` 与 `https://huggingface.co`）
- 本地存储：
  - `backend/memory/*.json` 与 `backend/utils/storage.js`

## 1. 未来大方向（你想要的“实时 + 不可预料行为 + 人设”如何落地）

我认为这项目的长期正确方向只有一个：**“本地快轨（0 延迟可见反馈）+ AI 慢轨（人格化、组合行为、策略补强）+ 记忆分层（可增长但不爆 token）”。**

你在 doc2 里担心的核心矛盾（不可预料行为 & 网络延迟）不能靠“全丢给 AI”解决，也不能靠“本地穷举规则”解决，必须做三层分工：

1) **本地快轨**（必须稳定、可预测、可取消）
   - 只做：微表情、抖动、朝向、气泡“占位”、轻量 idle、基础碰撞反馈、基础情绪数值增减。
   - 目标：用户任何一次交互都有立刻反馈（解决“5 秒后才反应像傻子”的观感）。

2) **AI 慢轨**（必须协议化、可去重、可中断）
   - 只做：把“复杂组合事件”映射成更符合人设的文本 + avatarPlan（必要时输出 plan）。
   - 目标：AI 到来时看起来像“回过神来开始傲娇吐槽”，而不是“刚刚没反应”。

3) **记忆分层**（必须可压缩、可审计、可恢复）
   - 只存“事实”而不是“全部原文”，并分为：短期 buffer（最近）/ 中期摘要（会话）/ 长期 core memory（偏好与关系）。
   - 目标：长期互动越多，Agent 越“懂你”，但每次请求 token 始终可控。

## 2. 必须改的地 方（大方向下的“架构性”改造点）

### 2.1 统一前后端 baseUrl / 环境变量（避免写死 localhost）

问题：`frontend/src/agent/utils/user.ts` 写死 `API_URL = 'http://localhost:8080/api/auth'`，这会在 Zeabur 或任意非本地部署时直接失效，并且与 `useVrmModels.ts` 的 `VITE_AGENT_API_BASE` 风格不一致。

方向：

- 前端所有请求都统一走 `VITE_AGENT_API_BASE`（或 `VITE_API_BASE`），保证部署环境可切换。
- 后端 `/api/*` 在同域部署时优先相对路径（避免跨域与 cookie/token 问题）。

关联文件：

- `frontend/src/agent/utils/user.ts`
- `frontend/src/agent/services/aiService.ts`
- `frontend/src/agent/composables/useVrmModels.ts`

### 2.2 “单文件巨兽”拆分：把 Agent.vue 变成“编排层”

问题：`Agent.vue` 同时承担交互采样 + 状态机 + UI + 多种执行器编排，未来迭代很容易“牵一发而动全身”。

方向：

- 保留 `Agent.vue` 做 orchestrator（编排），把三类逻辑拆出：
  - 交互采样与语义事件队列（Interaction Pipeline）
  - 情绪状态机与数值衰减（Emotion Engine）
  - AI 调用策略（节流、去重、取消、优先级）

目标不是“多写文件”，而是让每次只改 2–5 模块时不会把全局打穿。

关联文件（现有基础已具备）：

- `frontend/src/agent/utils/semanticEvents.ts`（继续强化）
- `frontend/src/agent/composables/useBackgroundReactions.ts`
- `frontend/src/agent/composables/useIdleAi.ts`
- `frontend/src/agent/logic/localReactions.ts`

### 2.3 统一协议：把“回复文本 + avatarPlan + plan + tags”当作唯一接口契约

问题：当前链路里已经支持 `avatarPlan:`、`plan:`、`emotionTag:` 等多种标签，但长期扩展会出现：

- AI 输出不稳定（漏字段、格式漂移）
- 多来源事件（聊天/任务/DOM/交互）互相覆盖
- 动作计划执行不可取消（或取消不干净）

方向：

- 让后端 `buildChatPrompt` 固化输出约束，把“允许列表（mots/expressions）+ 严格 JSON”作为必须项。
- 前端解析器 `parseAiReply` 只接受一个“严格 envelope”，失败就降级到本地快轨策略。

关联文件：

- `backend/server.js`（Prompt 规则固化）
- `frontend/src/agent/logic/aiReplyParser.ts`（严格解析与容错）
- `frontend/src/agent/types/avatarPlan.ts`（类型约束扩充）

### 2.4 国内加载模型的最终方案：后端多镜像 + 可选缓存层

你要的“国内不挂梯子也能加载 HF 模型”，当前后端已经走在正确方向上：`HF_RESOLVE_BASES` 默认包含 `hf-mirror.com`。

未来建议分两档：

- 档 A（现在就能用）：只靠 `HF_RESOLVE_BASES / HF_API_BASES` 轮询镜像
  - 在 Zeabur 配置环境变量即可（不改代码）。
- 档 B（规模化）：加一层可控缓存（避免重复拉大文件、降低抖动）
  - 后端加“热资源缓存策略”（ETag/Range/TTL），或把 VRM/Live2D assets 镜像到对象存储（R2/OSS/COS）并通过环境变量切换 assetsBase。

关联文件：

- `backend/server.js`（HF 代理与 list 代理已存在）
- `frontend/src/agent/composables/useVrmModels.ts`（VRM 走 `/api/hf/`）
- `frontend/src/agent/components/Live2DWidget.vue`（Live2D assets base 归一化）

## 3. 具体需要完善的地方（按优先级）

### P0（稳定性/部署阻断）

1) **前端 API 地址完全去硬编码**
   - 目标：不改代码即可在本地/Zeabur/自建域名切换。
   - 现状风险点：`frontend/src/agent/utils/user.ts`

2) **AI 请求“可取消 + 可去重 + 有优先级”**
   - 目标：交互触发的反应不会把聊天/任务的回复覆盖掉。
   - 建议优先级：任务续航 > 聊天 > DOM 背景反应 > 交互补强 > idle。
   - 现状基础：`cancelAiRequests`、多个 AbortController 已出现于 `Agent.vue` 与 `aiService`，但需要统一策略入口。

3) **记忆增长控制（token 预算）**
   - 目标：长期使用不会把 Gemini/SiliconFlow 的输入打爆。
   - 做法：短期 buffer 超限 -> 自动总结 -> 写入长期 core memory -> 清空 buffer。
   - 现状基础：前端有 `useLocalMemory`，后端有 `backend/memory/*`，但“压缩策略”需要落地成可执行模块。

### P1（“像活的一样”体验）

4) **情绪数值引擎（傲娇/害羞/生气/疲惫）**
   - 输入：`semantic.tags`（见阶段 18）、任务状态、DOM 信号
   - 输出：本地快轨（微表情 + 气泡）与 AI 慢轨（更精准台词 + avatarPlan）
   - 关键：衰减/冷却（避免一直生气或一直害羞）
   - 关联：`frontend/src/agent/utils/semanticEvents.ts`、`Agent.vue` 状态字段、`localReactions.ts`

5) **VRM 观感问题定位：抽动、下半身截断**
   - 抽动常见来源：look-at/idle 叠加、mixer 与骨骼操作竞争、deltaTime 不稳定。
   - 截断常见来源：camera near/far、fitToView box 计算、presentationGroup 的 scale/position。
   - 现状关键点：`frontend/src/agent/components/VrmWidget.vue` 的 `fitToView` / `ensureFacingCamera` / `applyPresentationPose`。

6) **“任务续航”体验：能持续推进，但不污染记忆**
   - 现状：`taskSession` + `requestNextTaskChunk` 已做了 `suppressMemorySave`，方向正确。
   - 下一步：让任务能生成“过程摘要”（而不是把每次续航都喂回去）。

### P2（高级 Agent：引导/操作网页 + RAG）

7) **RAG（站内知识问答）从“文件”升级到“可增量更新”**
   - 现状：后端 `vectors.json` 里已有阶段性记录，但 embedding/检索还需要明确闭环。
   - 长期：站点内容抓取 -> 分块 -> embedding -> 向量检索 -> 注入 prompt（只在需要时注入）。

8) **DOM/BOM 反应升级为“可解释的系统事件”**
   - 现状：已能 MutationObserver 捕获 toast/alert 等信号，并触发后台反应。
   - 下一步：给每类事件定义标准结构（error/success/warn/info + 目标元素摘要 + 页面路径）。

9) **真正的“操作引导/自动化（plan）”鲁棒性**
   - 目标：选择器失效时能自修复（AI 给备选 selector、或让前端做 target 解析与 fallback）。
   - 风险：过度依赖 DOM 细节导致维护成本爆炸，需要先定“允许做什么”边界。

## 4. 建议的长期开发拆分（每次只做 2–5 个模块）

下面给一份“未来很多内容”的模块化 backlog（可按你节奏挑选）。每个条目都设计成 1 次迭代可完成的 2–5 模块组合。

### 迭代 A（P0：部署与一致性）

- A1：统一 API baseUrl（移除硬编码、统一环境变量）
- A2：AI 请求调度器（优先级/去重/取消/冷却）
- A3：后端环境变量清单固化（Zeabur 一键配置：LLM + HF 镜像）

### 迭代 B（P0：记忆分层闭环）

- B1：前端短期 buffer 与写入节流（避免每个事件都写）
- B2：后端“摘要压缩”接口（把 buffer -> summary/core memory）
- B3：长期记忆检索注入策略（只注入相关条目，避免全量）

### 迭代 C（P1：情绪引擎）

- C1：情绪数值模型（anger/shy/happy/tired 等 + 衰减）
- C2：语义标签到情绪的映射表（可配置）
- C3：本地快轨动作库（小动作/气泡模板）

### 迭代 D（P1：VRM 稳定性）

- D1：抽动定位与修复（look/mixer/pose 冲突治理）
- D2：下半身截断修复（camera framing + fitToView 策略）
- D3：按需加载与资源缓存策略（避免重复加载）

### 迭代 E（P2：RAG 可用版）

- E1：文档分块与 embedding 生成（可从 doc/read/docs 或指定目录开始）
- E2：检索 + 注入 prompt（只在“站内问题”触发）
- E3：可观测性（命中哪些片段、token 预算）

### 迭代 F（P2：网页操作引导可用版）

- F1：选择器解析与 resolveTarget 鲁棒性（多策略）
- F2：引导 UI 标准化（高亮/连线/提示气泡一致）
- F3：plan 执行的“失败归因”与自动修复（让 AI 继续而不是直接失败）

## 5. 国内 HuggingFace 加速的落地建议（可直接照做）

你现在的后端默认已经支持镜像轮询（`hf-mirror.com`），建议把 Zeabur 环境变量固定为：

- `HF_RESOLVE_BASES=https://hf-mirror.com,https://huggingface.co`
- `HF_API_BASES=https://hf-mirror.com,https://huggingface.co`

当某个镜像抽风时，会自动尝试下一个。

如果你未来要做到“更稳更省流量”，建议再补一层：

- 把 VRM/Live2D 资源放到对象存储（或国内 CDN），然后把 `VITE_LIVE2D_ASSETS_BASE`、VRM 的默认 path base 指向 CDN。
- 后端保留 `/api/hf/` 作为 fallback（以及用于开发环境/临时回退）。

## 6. 这份路线图下一步怎么用（建议你怎么推进）

建议你从迭代 A 开始（部署一致性 + 调度器），然后直接做迭代 B（记忆分层闭环），最后做迭代 C（情绪引擎）。这三步做完，Agent 的“实时性观感 + 长期可用性”就稳定了，再去攻坚 RAG 与网页操作引导，收益更大且风险更可控。

## 时间戳

- 2025-12-30 （基于 `doc/read/mustRead/one.md`、`doc/read/doc2/*`、`frontend/src/agent/*` 与 `backend/server.js`）


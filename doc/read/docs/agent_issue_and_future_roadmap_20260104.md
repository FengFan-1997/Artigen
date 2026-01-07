# Agent 问题梳理、修复说明与未来展望（2026-01-04）

## 1. 当前能力与链路总览

- 视觉与交互：
  - Live2D/VRM 双模式，小萝莉 Agent 常驻页面角落，可拖拽、漫游、跟随鼠标、能量衰减与疲劳。
  - 鼠标快速环绕、频繁点击等行为会通过本地状态机触发眩晕、生气、害羞等情绪。
- 人设与上下文：
  - VRM 人设通过 `virtual:vrm-models` 与 `/doc/modeDoc` 绑定，在前端由 `getPersonaRulesForAi` 读取并注入到 AI 上下文。
  - AI 调用时统一由 `buildAgentContext` 构造上下文（人设、运行时状态、近期记忆、页面语义事件等），发送给后端 `/api/chat` 等接口。
- 协议与解析：
  - 后端在 `backend/server.js:buildChatPrompt` 中注入情绪标签、动作标签与 `plan/avatarPlan` 协议。
  - 前端通过 `logic/aiReplyParser.ts:parseAiReply` 统一解析：
    - 文本回复（cleanResponse）
    - `emotionTag`/情绪标签、`motionTag`、`avatarPlan`、`plan`
    - 包含 `v: "1"` 的 envelope JSON（支持 `{ v: "1", plan, avatarPlan, decision }` 结构）
  - 解析结果在 `components/Agent.vue:applyAiReply` 中落地成：
    - 聊天文本、语音播报
    - Live2D/VRM 表情与动作
    - 任务计划（plan → useTaskExecutor）
    - avatarPlan 动作脚本队列。
- 动作系统与 avatarPlan：
  - 允许的动作与表情由 `ALLOWED_MOTIONS/ALLOWED_EXPRESSIONS` 与 `data/motionMapping.ts` 约束和归一化。
  - `sanitizeAvatarPlanSteps` 对 `avatarPlan` 做限制与防御性处理（类型校验、步数上限、duration 限制、并行动作处理等）。
  - `runAvatarPlanSteps` 负责执行 motion/expression/pose/speak/bubble/move/wait/event 等脚本，支持 `parallel` 并行动作。
- 任务规划与续航：
  - `useTaskExecutor.ts` 负责执行 `plan`（navigate/click/input/hover/scroll/press/wait/highlight），并持久化到 `localStorage`，支持页面刷新后恢复任务。
  - `Agent.vue` 中的 `taskSession` 与 `requestNextTaskChunk` 实现任务续航（TaskContinue）：
    - 记录 `active/goal/autoContinueCount/lastContinueAt` 到 `localStorage`。
    - 在任务完成/失败、路由跳转、刷新后根据条件自动向 AI 请求下一段 `plan + avatarPlan`。
- 背景反应与闲置 AI：
  - DOM 监测：`startDomObserver` 使用 `MutationObserver` 监听 toast/alert/错误提示等 DOM 变化，归类为 success/error 等信号。
  - 背景反应：这些信号经 `reactToSystemEvent → requestAgentReaction` 汇总后发送给 AI，使用 `suppressMemorySave=true`，生成短旁白 + 动作。
  - 闲置 AI：`maybeTriggerIdleAi` 在长时间无交互时调用 AI，强制要求输出轻量 `avatarPlan`（idle/mood 为主），仅执行动作不写入记忆。
- 记忆与个性化：
  - 前端 `useLocalMemory` 管理短期记忆与事实抽取（facts），并通过 `getChatHistory` 从后端拉取历史对话。
  - 后端通过 `backend/utils/storage.js` 中的 JSON 文件记录用户对话，实现基础长期记忆。
  - 登录系统与记忆在 `module5_user_personalization.md` 中有完整设计，已部分落地在 `useAuth` 和 `ChatWindow` 中。

## 2. 本轮主要改动与修复

### 2.1 统一 AI 回复解析逻辑

- 问题：
  - 之前情绪标签、动作标签与 `avatarPlan/plan` 的解析逻辑散落在 `Agent.vue` 内部，部分逻辑与 `aiReplyParser.ts` 重复。
  - 导致不同场景下（chat / task / idle / 背景反应）对同一条 AI 回复的理解不完全一致，调试难度大。
- 改动：
  - 强制所有 AI 回复都经过 `logic/aiReplyParser.ts:parseAiReply`，由该模块负责：
    - 提取 envelope JSON（`{ v: "1", plan, avatarPlan, decision }`）
    - 提取 `plan`、`avatarPlan`、`motionTag`、`motionCommand`、`emotionTag`、表情覆盖 `[EXPR: xxx]`
    - 提取情绪标签 `[ANGRY]/[POUT]/[SHY]/[HAPPY]/[DIZZY]/[CRY]/[CONFUSED]/[FAINT]/[TIRED]/[SLEEPY]`
    - 生成 `queuedAvatarSteps` 与 `tags`（angry/happy/poutingOrShy/dizzy/cry/confused/tiredOrFaint）。
  - `components/Agent.vue:applyAiReply` 只负责根据 `ParsedAiReply` 结果更新状态与执行动作，而不再重复解析。
- 效果：
  - AI 回复协议变更时只需更新 `aiReplyParser.ts`，大幅降低维护复杂度。
  - 各类触发（chat / task / idle / 背景反应）的行为更加一致。

### 2.2 强化 avatarPlan 必选与兜底逻辑

- 问题：
  - 用户希望“每次 AI 回复都要驱动动作”，但在以下场景容易出现无动作：
    - 模型只输出文本与情绪标签 `[HAPPY]`，未输出 `avatarPlan` 或 `motionTag`。
    - `avatarPlan:` 后的 JSON 不合法或被截断。
  - 结果是 Agent 气泡有文字但身体完全不动，体验割裂。
- 改动（核心在 `Agent.vue:applyAiReply`）：
  - 从 `parseAiReply` 中取得：
    - `parsed.parsedAvatarPlan`：解析成功的 `avatarPlan` 数组
    - `parsed.queuedAvatarSteps`：从 `motionTag/motionCommand/[MOTION: xxx]` 转换的动作
    - `parsed.primaryEmotion` 与 `parsed.tags`。
  - 若解析不到 `avatarPlan` 且没有任何动作队列：
    - 根据 `primaryEmotion` 推导一个兜底动作：
      - VRM：
        - angry → `mood_angry`
        - happy → `mood_happy`
        - shy → `friend`
        - dizzy → `shake`
        - tired → `mood_tired`
        - sleepy → `mood_sleepy`
        - confused/thinking → `mood_confused`
      - Live2D：
        - angry → `shake`
        - happy → `happy`
        - shy → `friend`
        - dizzy → `shake`
        - tired → `mood_tired`
        - sleepy → `mood_sleepy`
        - confused/thinking → `tap_body`
      - 若依然无情绪信息，则统一退回 `idle`。
    - 使用 `normalizeMotionName` 将兜底动作映射到实际 motion 名，并追加到 `queuedAvatarSteps`。
    - 记录一条诊断日志 `kind: 'avatarplan_fallback'` 方便在 AgentDebug 中排查模型回复质量。
- 效果：
  - 即使模型回复中完全缺失 `avatarPlan` 或 JSON 格式错误，Agent 也能：
    - 根据情绪做出合理的“傲娇小萝莉”动作
    - 避免“只动嘴不动身体”的僵硬体验。

### 2.3 避免重复解析 `[MOTION: xxx]` 标签

- 问题：
  - `[MOTION: xxx]` 标签既在 `aiReplyParser.ts` 中解析，也在 `Agent.vue:applyAiReply` 中再次解析。
  - 会导致同一个动作被入队两次，表现为动作放大或重复。
- 改动：
  - 保留 `aiReplyParser.ts` 中对 `[MOTION: xxx]` 的处理。
  - 移除 `Agent.vue:applyAiReply` 中对 `[MOTION: xxx]` 的二次解析逻辑，动作只生成一次。
- 效果：
  - 动作执行次数与设计保持一致，避免“莫名其妙多动一下”的情况。

### 2.4 AgentDebug 的 AI Reply 测试支持

- 增强内容：
  - 在 `views/AgentDebug.vue` 中新增“AI Reply 测试”面板，接入 `window.__agentDebug.parseAiReply/applyAiReply`：
    - 可手动粘贴一段模型原始回复（rawResponse），点击“解析”查看 `ParsedAiReply` 的结构。
    - 点击“应用到 Agent”直接驱动当前页面上的 Agent 执行相应动作与文本展示。
  - 内置了若干典型用例便于快速验证：
    - 缺失 `avatarPlan`：仅有文本 + 情绪标签 → 验证兜底动作是否生效。
    - `avatarPlan` 非法 JSON：末尾多逗号等 → 验证容错与兜底逻辑。
    - 多行 `avatarPlan`：`avatarPlan:\n[\n {...}, {...}\n]` → 验证多行解析能力。
    - envelope(JSON) 模式：`{"v":"1","decision":...,"avatarPlan":[...]}` → 验证 envelope 解析与 `envelopeFallback` 文本回退。
- 效果：
  - 不依赖后端与真实模型即可对解析逻辑进行精确测试。
  - 非常适合调试不同大模型（Gemini / SiliconFlow / Qwen）在协议上的稳定性。

### 2.5 质量验证

- 已在 `frontend` 目录下执行：
  - `pnpm -C frontend lint`
  - `pnpm -C frontend type-check`
  - `pnpm -C frontend build`
- 当前构建通过，无 ESLint/TS 错误，打包成功。
- 已通过 `pnpm -C frontend dev` + `/agent-debug` 页面进行手动联调与快照观察。

## 3. 典型问题清单与当前状态

### 3.1 已解决/已缓解的问题

1. AI 输出协议解析分散、难以维护  
   - 表现：不同触发路径（chat/idle/task）对同一条 AI 回复解析不一致，增加了提示词调试难度。  
   - 状态：已通过 `aiReplyParser.ts` + `Agent.vue:applyAiReply` 的集中抽象基本解决。

2. avatarPlan 缺失时 Agent 无动作  
   - 表现：模型只返回文本或情绪标签时，Agent 站桩不动，违背“每次回复都要有肢体反馈”的目标。  
   - 状态：已在 `applyAiReply` 中增加严格的兜底逻辑，保证至少有一条动作执行。

3. `[MOTION: xxx]` 标签触发动作重复  
   - 表现：同一回复中包含 `[MOTION: tap_body]` 时，Agent 会多次执行相同动作。  
   - 状态：移除重复解析后问题已解决。

4. 调试成本高、难以重现模型问题  
   - 表现：无法在前端快速模拟模型各种异常回复（坏 JSON、缺字段等）。  
   - 状态：AgentDebug 新增 AI Reply 测试面板后，可直接在浏览器中重现与分析问题。

### 3.2 仍然存在或需要注意的问题

1. MCP（Model Context Protocol）尚未实现  
   - 当前代码库中未找到任何与 MCP client/server、tool calling 或协议适配相关的实现，仅有概念层面的规划。  
   - 影响：无法真正通过 MCP 工具链去调用外部系统（如浏览网页、访问数据库等），只能在前端/后端自定义 `plan` 与 DOM 操作。  
   - 建议后续在后端增加 MCP client，并在 `buildChatPrompt` 中为特定 intent 打通 tool 调用，再在前端适配工具结果。

2. 任务续航（TaskContinue）对 envelope-only `plan` 的识别  
   - 目前 `requestNextTaskChunk` 中，以 `/\\bplan\\s*:\\s*\\[/i` 正则检测 AI 回复是否仍然包含 `plan:`。  
   - 如果未来将 TaskContinue 回复统一改为只使用 envelope JSON（`{ v: "1", plan: [...] }`）而不再输出 `plan:` 文本标签，需要同步调整这一判断逻辑（例如借助 `parseAiReply` 的 `parsedPlan` 结果）。

3. 长期记忆与 Token 控制（已做第一轮收敛）  
  - 当前长期记忆基于本地 JSON 文件，尚未引入向量数据库与更精细的截断策略。  
  - 已在后端 `/api/chat` 对“用户输入 + 最近历史对话”增加统一截断，降低超长上下文触发 LLM prompt 超限的风险：  
    - 当前用户输入在进入 LLM 前限制长度（约 4000 字符）。  
    - 最近 12 条历史对话逐条截断（每条约 1600 字符），并同时应用于 Gemini 与 SiliconFlow fallback 的消息构造。  
    - 写入 `chats.json` 与用户记忆时也会对 Agent 回复做截断，避免历史不断膨胀导致后续请求变慢或超限。  
  - 后续仍建议继续做分层存储（短期窗口 + 长期摘要），以及“偏好/边界/人设信息”的结构化抽取，进一步降低 token 开销。

4. VRM/Live2D 动作与表情映射的精细度  
   - 目前 `normalizeMotionName` + `ALLOWED_MOTIONS/ALLOWED_EXPRESSIONS` 只做了基础映射。  
   - 不同 VRM 模型之间的动作集并不完全一致，一些动作可能映射到“最接近”的默认动作，导致表现不完全贴合人设文档。  
   - 后续可以为每个 VRM 增加专属 motion 映射表，并在提示词中告知模型“推荐动作列表”。

5. 明文 API Key 文件  
   - `doc/other/api` 中存在明文模型 API key，仅用于本地说明。  
   - 建议后续：
     - 将 key 移出仓库，改用 `.env` 与环境变量管理。  
     - 在文档中保留接口示例，但用占位符代替真实 key。

## 4. 未来工作方向建议

1. MCP 与 Tool 调用集成  
   - 在后端增加 MCP client 或统一的 tool 调用层，用于：
     - 页面内容抓取与结构化（辅助 RAG 与导航）。  
     - 与第三方服务（日历、待办、文档）联动。  
   - 在 `buildChatPrompt` 中将 tool 能力显式告知模型，配合 function calling 或 MCP 协议使用。

2. 更完整的“傲娇小萝莉”人格体系  
   - 结合 `/doc/modeDoc` 下的人设文档，继续打磨：
     - 对不同触发（被夸、被骂、教不会用户、被疯狂点击）的本地预设反应。  
     - 将这些本地规则与 AI 输出结合：本地负责“快反”，AI 负责“补强与人设润色”，保持实时性与个性化。

3. 记忆系统升级  
   - 引入向量数据库与事实抽取管线，为用户构建结构化画像（偏好、禁区、习惯）。  
   - 将 `useLocalMemory` 与后端记忆 API 打通，形成统一记忆层，减少重复与遗漏。

4. 任务与页面操作的鲁棒性  
   - 扩展 `TaskStep` 类型（例如条件判断、分支、多步表单填写）。  
   - 增加对 DOM 变化的自适应能力（更稳健的 selector 策略、回退方案）。  
   - 与 MCP/工具调用协同：当纯前端 DOM 操作无法完成时，回退到后端工具执行。

5. AgentDebug 的自动化测试脚本  
   - 基于当前的 `window.__agentDebug` 能力，后续可以加入一组自动化回归用例：
     - 通过脚本批量注入不同 AI 回复，断言 `ParsedAiReply` 与 avatarPlan 执行结果。  
     - 记录与对比帧率、长帧数、内存占用等指标，为性能优化提供数据支持。

---

本次改动重点在于：  
- 让 AI 输出协议与前端解析逻辑更加统一、可调试；  
- 在 avatarPlan 缺失或异常时保证 Agent 依然“有生命力”；  
- 通过统一截断与记忆收敛降低 LLM 超限风险；  
- 为后续接入 MCP 与更复杂任务逻辑打下基础。  

后续在继续增强人设、记忆与任务能力时，建议始终围绕 `parseAiReply → applyAiReply → AgentDebug` 这一链路进行迭代和验证。


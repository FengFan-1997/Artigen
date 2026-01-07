# Agent：任务失败续航错误链路 + Idle微反应桥接（2026-01-05）

## 本次完成

### 1) 任务失败原因可被“续航”看到（失败→续航提示链路补齐）

- `TaskPlan` 增加了 `errorMessage` 字段，用于持久化最近一次任务失败的简短原因。
- `useTaskExecutor` 在执行失败时会把错误信息写入 `plan.errorMessage`，并随计划一起存进 LocalStorage，页面刷新后仍能看到失败原因。
- `Agent.vue` 的 `requestNextTaskChunk` 现在支持携带失败上下文（失败原因 + 失败步骤描述/类型 + target），并把它拼进 `[TaskContinue]` 的 systemEvent 文本里，让 AI 下一段 plan 能基于“为什么失败”给出修复/替代步骤。

相关代码：
- [task.ts](file:///g:/AvuePro/newPro/frontend/src/agent/types/task.ts)
- [useTaskExecutor.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts)
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)
- [useTaskContinue.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskContinue.ts)

### 2) 任务失败不再直接关闭 taskSession（让续航能继续）

- 之前逻辑：`setPlan(...)` 执行失败时会把 `taskSession.active = false`，导致后续 `requestNextTaskChunk('failed')` 直接短路，任务无法“续航修复”。
- 现在逻辑：失败只记录诊断，不关闭 taskSession；失败后的 watcher 会触发 `requestNextTaskChunk('failed', failureContext)`，允许 AI 基于失败原因继续推进。

相关代码：
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

### 3) Idle 微反应扩展到 Live2D（胶水桥接）

- 情绪引擎推荐的 `idle_*` 动作名更多面向 VRM（VRM 里有 proceduralMotion 支持很多 `idle_*`）。
- Live2D 侧很多 `idle_*` 不存在，为避免“触发了但没动作”，在 `Agent.vue` 增加了一个 Live2D motionCommand 归一化层：
  - `idle_yawn` → `yawn`
  - `idle_*` → `idle/evening/mood_confused/mood_tired/activity/stretch/play_hair`（按关键词粗映射）
- 同时把微反应触发从 “仅 VRM” 放开为 “VRM + Live2D 都可触发”，仍然受 microBusy/节流/锁定时间约束。

相关代码：
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

---

## 下一步（2-5 个模块）

### 模块 A：任务失败“可修复化”协议（核心逻辑）

目标：让 AI 能稳定给出“修复策略”，而不是重复失败。

- plan 执行失败时，把更多结构化上下文送进续航提示：当前 route、已完成步数、失败步 index、失败 step 的 selector、页面可见关键文本摘要（可复用现有 DOM signal 机制）。
- 引入 “失败重试策略” 约束（只在续航 prompt 里约束即可，不在前端写复杂状态机）：
  - selector 失败 → 优先换 selector（更稳的 attributes/role/text 组合）；
  - input/click 失败 → 先 highlight + wait，再 click；
  - navigate 失败 → 明确改用 router path 或 URL。

验收：
- 在常见“元素找不到/路由没到/按钮被 disabled”场景下，续航能在 1-2 次内产出不同的 plan，而不是重复同一步。

### 模块 B：任务 plan 的“可观测性”增强（核心逻辑）

目标：失败时能更快定位原因，也能给 AI 更干净的上下文。

- 失败时记录：最后一次失败 step 的快照（type/target/description/ts）。
- 把失败原因显示为更友好的短提示（已做基础版，后续做更可读的映射：元素不存在/超时/跳转失败/输入失败）。

验收：
- Debug 快照里能直接看到 “失败在哪一步、因为什么失败”。

### 模块 C：Idle 行为库分层（表现层）

目标：把 “情绪引擎微反应” 和 “AI Idle” 做出分工，稳定且不吵。

- 本地快轨（情绪引擎微反应）：频率高、动作轻、最多一句气泡。
- AI Idle（慢轨）：频率低、人设强、必须极短（1-4 步 avatarPlan）。
- 统一 idle 冲突策略：任何时候只允许一个 idle 通道占用（microLock + idleAiCooldown 已有，后续只做更明确的优先级：任务/说话 > 交互 > micro > idleAi）。

验收：
- 长时间放置页面，角色会自然“活着”，但不会频繁打断用户。

---

## PRD（下一大步）精简版

### 1) 产品目标

- 目标 1：Agent 能在网页上完成可持续任务（plan 分段续航），失败时能自修复继续推进。
- 目标 2：Agent 长时间在线时具备“生命感”（本地快轨微反应 + AI 慢轨 idle），不同人设差异明显。

### 2) 核心用户故事

- 任务类：
  - 作为用户，我希望输入“帮我生成营养配料表”，Agent 能分段操作网页直到完成。
  - 作为用户，当网页结构变化导致失败时，Agent 不会直接停摆，而是解释失败并尝试替代步骤继续完成。
- 陪伴类：
  - 作为用户，我希望我不操作时，她会有自然的闲置动作/小台词，但不会打扰我工作。

### 3) 范围边界（这阶段不做）

- 不做：把浏览器自动化升级为 Playwright/Selenium 级别（当前仍以 DOM + 事件模拟为主）。
- 不做：完整的多账号系统与数据库（后续独立模块推进）。

### 4) 成功指标（可验证）

- 任务续航成功率：在指定 Demo 页面上，10 次任务里 ≥ 7 次能完成或进入“可继续”的下一段。
- 失败自修复：失败后 2 次续航内给出不同 plan 的比例 ≥ 80%。
- Idle 干扰度：用户在打字/拖拽/任务执行时，Idle 行为触发率接近 0（microBusy 约束）。

---

## 需要但当前做不到/缺少的东西

- 如果希望任务执行更稳，需要明确的“业务页面可操作锚点规范”（例如关键按钮给 data-testid / role/aria-label），否则纯 CSS selector 在页面频繁改版时天然不稳定。


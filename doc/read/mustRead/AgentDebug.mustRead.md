# mustRead：frontend/src/views/AgentDebug.vue（调试与反馈包导出）

## 1. 你要先记住的一句话
[AgentDebug.vue](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue) 的核心价值不是“调参”，而是：**把 Agent 运行时状态（snapshot）+ 诊断采集（diagnostics）+ AI service 状态汇总成可导出的反馈包**，用于复现、排障、对齐协议与提示词。

它依赖两个基础能力：
- Agent 在页面中实际渲染，并暴露 `window.__agentDebug`（见 [Agent.vue:L3960-L4219](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L3960-L4219)）
- Agent runtime 内置 diagnostics/aiService 状态查询（由调试页调用/展示）

## 2. 当前实现做到了什么（现状）

### 2.1 连接与采集控制
- 检测 `window.__agentDebug` 是否存在，用于判断“是否已连接”
- 支持切换 diagnostics 采集开关、清空采集、切换是否采集 console info
  - UI 段落在：[AgentDebug.vue:L15-L58](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue#L15-L58)

### 2.2 参数面板（通过 setParam 写回 Agent）
- 调试页维护一批参数（漫游、idle、lerp、偏移、chat 自动关闭、动态缩放等）
- 点击“应用”调用 `__agentDebug.setParam(key, value)`
  - Agent 侧实现：[Agent.vue:L4067-L4201](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L4067-L4201)

### 2.3 行为面板（通过 action 触发 Agent 行为）
- open/close chat、cancel AI、reload memory、task next/stop、clear local memory 等
  - Agent 侧实现：[Agent.vue:L4203-L4219](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L4203-L4219)

### 2.4 数据视图：快照/聊天/任务/记忆/facts
- 通过 `__agentDebug.getSnapshot()` 获取完整运行态快照（perf/agent/chat/memory/task/params）
  - 快照结构：[Agent.vue:L3964-L4051](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L3964-L4051)

### 2.5 反馈包：导出、复制、保存历史
- 反馈包包含：
  - 当前 URL、原因文本
  - agentSnapshot（运行时快照）
  - aiService 状态
  - diagnostics（事件/日志/AI 请求追踪）
  - backend health 与 hf 测试结果
- 构建与导出逻辑：
  - [AgentDebug.vue:L2128-L2174](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue#L2128-L2174)

### 2.6 自动测试与压测（面向稳定性回归）
- 自动测试：定时执行 snapshot/diagnostics/health/usage/chat 等检查，保留记录并支持导出
- 压测：支持定时 burst、多并发 in-flight、消息组等
  - 主逻辑都在同文件内（靠 localStorage 存状态与历史）

## 3. 关键代码路径（理解调试页必须掌握）

### 3.1 refresh：同步三类状态
- snapshot：来自 `__agentDebug.getSnapshot()`
- aiState：来自 agent aiService 的运行态查询（调试页内部直接调用）
- diagState：来自 `__agentDebug.getDiagnosticsSnapshot()` 或对应桥接

入口位置：
- [AgentDebug.vue](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue)

### 3.2 downloadFeedbackPack：本地落盘 + 历史保存
- `refresh()` 先拉最新数据
- `buildFeedbackPack()` 拼装 payload
- `saveFeedbackPackToLocal(pack)` 把历史写入 localStorage（用于“最近一次/数量”预览）
- `downloadJson()` 触发浏览器下载

核心片段：
- [AgentDebug.vue:L2128-L2147](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue#L2128-L2147)

## 4. 对照现有文档的差距（Gap Analysis）

对照基线文档：
- 统一说明书（含调试页）：[allnew.md](file:///g:/AvuePro/newPro/doc/read/agent/allnew.md)
- 商业化交付要求（可追溯/回放/导出）：[prd.md](file:///g:/AvuePro/newPro/doc/read/agent/prd.md)
- room 协议与调参方向： [prd2.MD](file:///g:/AvuePro/newPro/doc/read/agent/prd2.MD)

已对齐的点：
- “导出反馈包用于复现/排障”的闭环已经存在：调试页可以一键导出 JSON
- diagnostics + AI 请求追踪已被集中呈现，并可复制摘要，符合“可追溯”的方向
- room 已复用部分调参能力（动态缩放/取消 AI/重载记忆）说明调试桥可复用

仍存在的差距/偏差：
- prd.md 强调的“回放（每步 plan、每次触发）”调试页目前偏“快照+日志”，缺少可视化回放与结构化失败码
- 反馈包字段缺少“统一 requestId/sessionId/projectId 的贯通”，跨端对账/追溯仍不够硬
- 调试页强依赖 `window.__agentDebug`：一旦 Agent 未渲染或在其他页面，调试体验会断裂；正式交付需要更可控的连接策略

## 5. 已知缺陷/风险（当前项目缺陷）

高优先级：
- 调试页存在 clipboard API 与 download 行为：在部分浏览器/权限策略下会失败，需要更明确的失败提示（目前是 silent false）
- 全局调试桥 `window.__agentDebug`：能力强但容易被滥用，需要“只在 debug 环境启用”的策略

中优先级：
- AgentDebug.vue 文件体积大：参数面板、诊断视图、自动测试、压测、反馈包全在一个组件里，维护成本较高
- 本地持久化 key 较多（auto test、feedback history、load test）：缺少统一版本迁移策略

## 6. 后续开发建议（2–5 模块节奏的候选）
- 把反馈包结构版本化：`v`、字段白名单、并在 UI 显示“schema version”
- 引入结构化回放最小闭环：至少把 plan steps（命中元素摘要/耗时/失败码）串起来展示
- 将自动测试/压测拆成 composables：降低单文件复杂度、便于复用到 CI 或隐藏入口
- 调试桥加“启用条件”：仅在 `uiMode=debug` 或显式 query 开关下挂载 `window.__agentDebug`

## 7. 企业级代码风格差距（面向代码审计）
- 单文件过大：建议按“参数/诊断/反馈包/自动测试/压测”拆分
- 缺少强类型：调试页大量 `any`，企业级会把 snapshot/diag/pack schema 明确为 TS 类型并做 runtime 校验
- UI/逻辑耦合偏重：业务逻辑（pack 构建、记录裁剪）应抽离以便单测与复用

## 8. 算法与逻辑深度评估（按难度）
- 中：反馈包构建、裁剪、近似体积估算、摘要提取
- 中：自动测试/压测调度（并发上限、定时器、in-flight 统计）
- 中-高：可观测体系产品化（结构化字段贯通、回放、失败归因）


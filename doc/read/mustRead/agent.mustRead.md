# mustRead：frontend/src/agent（Agent Runtime）

## 1. 你要先记住的一句话
`frontend/src/agent` 是整套“拟人化 Agent Runtime”的底座：**本地快轨（0 延迟反馈）+ AI 慢轨（输出文本/动作脚本/任务计划）+ 记忆分层（summary/facts/items）+ 可观测与调试导出**。

这套 Runtime 被：
- 主页/普通页面的悬浮 Agent 直接使用（[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)）
- `/room` 沉浸式聊天室复用（[RoomPage.vue](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)）
- `/agent-debug` 调试页连接并导出反馈包（[AgentDebug.vue](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue)）

## 2. 当前实现做到了什么（现状）

### 2.1 对外“可执行协议”已经成型
- **表现层协议：avatarPlan**（动作/表情/气泡/说话/移动/等待）
  - 类型定义：[avatarPlan.ts](file:///g:/AvuePro/newPro/frontend/src/agent/types/avatarPlan.ts)
  - 执行器：[useAvatarPlanRunner.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useAvatarPlanRunner.ts)
- **执行层协议：plan（网页代操作）**（click/input/scroll…）
  - 执行器与安全裁剪：[useTaskExecutor.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts)
- **AI 回复解析器**：同时支持“首选 JSON Envelope”与降级的 `avatarPlan:`/`plan:` 抽取
  - [aiReplyParser.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/aiReplyParser.ts)

### 2.2 “实时反应”链路是本地优先 + AI 补强
- 本地快轨：对可预料行为立即反应（眩晕/晕倒/生气/嘟嘴等），先让用户看到“她懂了”
- AI 慢轨：对复杂组合行为补台词、补编排、补记忆（或继续任务 chunk）
- 用户行为语义化：将鼠标轨迹/点击等采样汇总成语义标签与摘要
  - [semanticEvents.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/semanticEvents.ts)

### 2.3 记忆分层存在且可用（但仍在产品化路上）
- 本地短期/中期存储 + 压缩写入： [useLocalMemory.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useLocalMemory.ts)
- facts（事实型记忆）已经在快照里独立展示，并支持导出反馈包带走（见调试页）

### 2.4 可观测与调试接口已经打通
- 诊断/事件/AI 请求记录： [diagnostics.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/diagnostics.ts)
- 对外调试桥 `window.__agentDebug`：提供 snapshot、参数注入、动作触发、清理诊断等
  - 暴露位置：[Agent.vue:L3960-L4219](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L3960-L4219)

### 2.5 room 复用与“设置通道”已建立
- 通过自定义事件 `agent_settings_request/update/state` 与房间页设置面板联动（Agent 作为状态源）
  - 事件处理与 state 广播：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)
  - 设置面板消费：[RoomPage.vue](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)

## 3. 关键代码路径（理解系统必须掌握）

### 3.1 一次聊天（chat）从输入到动作执行
1) UI 输入（ChatWindow / room 输入框）触发 `sendChat`
2) AI 请求（带 persona、constraints、memory、recent events 等上下文）走 AI Service
   - [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)
3) AI 回复由 `parseAiReply` 解析出：
   - cleanResponse（文本）
   - queuedAvatarSteps（avatarPlan steps）
   - plan steps（可选）
4) avatarPlan 交给 runner 播放；plan（若允许）交给 task executor
   - `applyAiReply` 主入口：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

### 3.2 “交互事件 -> 语义 -> 可能触发 AI”
- 采样：鼠标移动/点击等生成 InteractionSample（节流 + hitTest）
- 汇总：metrics + semantic tags + summary 文本
- 判定：`shouldAskAiForInteraction` 决定是否走慢轨
  - 相关逻辑：[semanticEvents.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/semanticEvents.ts)

### 3.3 任务续航（plan chunk）与系统反应（DOM/BOM）
- 续航：计划完成/失败/页面跳转时，继续向 AI 要下一段 plan+avatarPlan（避免“一段就停”）
- 背景反应：MutationObserver 捕获 toast/alert 等，合并后触发反应请求（默认不污染记忆）
  - 相关实现核心位于：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)
  - 文档对照基线：[agent文档2.md](file:///g:/AvuePro/newPro/doc/read/agent/agent%E6%96%87%E6%A1%A32.md)

## 4. 对照现有文档的差距（Gap Analysis）

对照基线文档：
- [agent.md](file:///g:/AvuePro/newPro/doc/read/agent/agent.md)
- [allnew.md](file:///g:/AvuePro/newPro/doc/read/agent/allnew.md)
- [prd.md](file:///g:/AvuePro/newPro/doc/read/agent/prd.md)
- [prd2.MD](file:///g:/AvuePro/newPro/doc/read/agent/prd2.MD)
- [agent文档1.md](file:///g:/AvuePro/newPro/doc/read/agent/agent%E6%96%87%E6%A1%A31.md)
- [agent文档2.md](file:///g:/AvuePro/newPro/doc/read/agent/agent%E6%96%87%E6%A1%A32.md)

已对齐的点（文档目标 → 代码落地）：
- “本地快轨 + AI 慢轨”策略：实现存在且被 room/调试页复用（见 Agent.vue 与 RoomPage.vue）
- “输出协议（avatarPlan/plan）”：类型、解析器、执行器齐全
- “记忆分层 + facts”：已经有结构与导出入口
- “调试与反馈包”：AgentDebug 可直接导出（依赖 `window.__agentDebug` + diagnostics）

仍存在的差距/偏差（文档期待 → 现实风险）：
- 企业级“多租户/Project/域名白名单/审计”在 Runtime 侧没有闭环交付面（prd.md 提到，但当前 runtime 更偏单站点/开发态）
- “RAG 引用来源与评估闭环”在 agent runtime 内没有标准字段贯通（prd.md 强调可追溯）
- `agent.md` 的早期“模块拆解”与当前代码结构大体一致，但很多验收项与边界要求仍停留在叙述层，缺少统一的自动化验收脚本/指标输出

## 5. 已知缺陷/风险（当前项目缺陷）

高优先级（会影响交付或稳定性）：
- 解析器对“混合文本 + 半截 JSON + 代码块”的容错仍可能导致“只说不动/乱动”，需要更强的输出约束或兜底 avatarPlan（详见 [allnew.md](file:///g:/AvuePro/newPro/doc/read/agent/allnew.md) 对解析风险段落）
- plan 代操作虽然有安全裁剪，但仍属于高风险能力：需要进一步产品化的确认/白名单策略与审计字段贯通（prd.md 交付边界要求）
- `window.__agentDebug` 是全局 hook：调试方便，但在正式交付要明确开启条件/隔离策略（避免第三方脚本调用）

中优先级（体验或维护成本）：
- Agent.vue 体积很大，虽然已拆出多个 composables，但仍有“汇聚过多语义”的趋势（状态机、输入采样、AI、记忆、任务、调试桥都在一个组件里）

## 6. 后续开发建议（2–5 模块节奏的候选）
- 统一“AI 输出 Envelope”强制规则与兜底策略：解析失败时本地 fallback avatarPlan，保证永远有动作
- 为 plan 引入“高风险步骤二次确认 + 审计字段贯通”：每一步记录 target 摘要/失败码/耗时
- 强化记忆闭环：facts 写入策略、去重策略、与后端 memory 的一致性（避免 token 爆炸/污染）
- 把调试桥能力拆分为可控开关：仅在 debug route 或显式配置下暴露

## 7. 企业级代码风格差距（面向代码审计）
- 单文件复杂度：Agent.vue 的职责面过宽，建议继续下沉“任务续航/背景反应/调试桥/交互采样”到更小的 composables 并明确输入输出
- 运行态与配置的边界：目前既有 localStorage 参数又有 runtime state，建议抽象为“可序列化 settings 层”并统一校验与默认值策略
- 全局副作用：window 事件监听与 `window.__agentDebug` 属于强副作用点，建议建立统一的生命周期注册/销毁与权限开关

## 8. 算法与逻辑深度评估（按难度）
- 中：交互采样节流 + 命中区域 hitTest + 语义化汇总（工程算法+阈值调参）
- 中-高：动作/表情仲裁（多通道、打断、优先级、去抖）、avatarPlan 执行调度
- 高：plan 代操作鲁棒性（selector 漂移、自修复、二阶段验证、失败归因）
- 高：记忆分层与 token 预算（摘要/事实提炼、污染控制、持久化一致性）


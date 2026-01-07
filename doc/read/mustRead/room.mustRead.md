# mustRead：frontend/src/room（RoomPage 复用 Agent Runtime）

## 1. 你要先记住的一句话
`frontend/src/room` 不是“另起炉灶的新 Agent”，而是一个沉浸式 UI：**把现有 Agent Runtime（avatarPlan/plan/记忆/调试）搬进三栏聊天室舞台**。

当前 room 实现几乎全部集中在单文件：
- [RoomPage.vue](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)

## 2. 当前实现做到了什么（现状）

### 2.1 页面形态：三栏沉浸式聊天室
- 左：消息流 + 输入框（支持 markdown 渲染）
- 中：舞台区渲染 Agent（`layout-mode="relative" ui-mode="room"`）
- 右：设置栏（模型类型、VRM 选择、鼠标跟随、动态缩放、AI 通道、操作按钮）

对应实现：
- 模板结构：[RoomPage.vue](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)

### 2.2 复用 Agent 的聊天链路（不是自己发请求）
- room 通过 `ref` 调用 Agent 的 `defineExpose` API：
  - `sendChat(text)`
  - `getChatMessages()`
  - `isChatLoading()`
  - `clearChatMessages()`
- 定义点在 Agent：
  - [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

### 2.3 AI 通道切换：共享 agent aiService 的 override
- room 的“通道 direct/proxy”实际上在调用：
  - `getAiTransportOverride / setAiTransportOverride`
  - [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)

### 2.4 设置栏与 Agent 的对接：事件通道 + 调试桥
- room 发事件更新设置（`agent_settings_update`），Agent 接收并应用
- room 发事件请求状态（`agent_settings_request`），Agent 发送回 `agent_settings_state`
- room 的“动态缩放/取消 AI/重载记忆/清空记忆”走 `window.__agentDebug`
  - 由 Agent 在 mounted 时暴露：[Agent.vue:L3960-L4219](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L3960-L4219)

## 3. 关键代码路径（理解 room 必须掌握）

### 3.1 发送消息
1) room 输入框触发 `send()`
2) 通过 `agentRef` 调用 `sendChat(text)`
3) room 用 `getChatMessages()` 渲染消息流，并滚动到底部
4) 加载状态用 `isChatLoading()` 控制占位 `...`

入口函数：
- [RoomPage.vue:send](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)

### 3.2 获取/应用 Agent 设置
- room 通过 `requestAgentSettings()` 触发 Agent 广播 state
- 监听 `agent_settings_state` 更新右侧 UI 显示
- 通过 `agent_settings_update` 把用户选择回写给 Agent（切模型/开关跟随等）

入口函数：
- [RoomPage.vue:requestAgentSettings/applyAgentSettingsUpdate](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue)
- Agent 的事件处理与 state 发送逻辑在：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

### 3.3 使用调试桥做“强操作”
- 动态缩放：`__agentDebug.setParam('dynamicScale', v)`
- 取消 AI：`__agentDebug.action('cancelAi')`
- 重载记忆：`__agentDebug.action('reloadMemory')`
- 清空本地记忆：`__agentDebug.action('clearLocalMemory')`

## 4. 对照现有文档的差距（Gap Analysis）

主要对照基线：
- room 设计与协议：[prd2.MD](file:///g:/AvuePro/newPro/doc/read/agent/prd2.MD)
- agent 最新综合说明：[allnew.md](file:///g:/AvuePro/newPro/doc/read/agent/allnew.md)

已对齐的点：
- “room 必须复用 Agent Runtime”已落实：room 不直接实现 AI/解析/记忆/动作执行
- “三栏布局 + 设置栏”已落地：且设置栏不跳转 debug 页（prd2.MD 里的方向）
- “实时反应原则”在 room 侧通过复用 Agent 本地快轨继承（room 不重写）

仍存在的差距/偏差：
- prd2.MD 里强调“room 默认不允许 plan 代操作”：当前 room UI 没有显式开关与风险提示；虽然 room 本身不发 plan，但 Agent runtime 仍可能在某些调用路径允许 plan，需要在 room 模式下做硬约束
- prd2.MD 的“状态条（情绪/疲劳/锁定倒计时）”没有在 room UI 呈现，目前只能通过 debug 快照侧看
- prd2.MD 的“多存档/多角色”还没有数据结构与 UI

## 5. 已知缺陷/风险（当前项目缺陷）

高优先级：
- room 依赖 `window.__agentDebug` 完成部分功能：正式交付要考虑“调试桥开关”和“权限隔离”，否则第三方脚本可调用
- room 通过 `marked` 渲染消息并 `v-html` 输出：若消息来源包含不可信 HTML，存在 XSS 风险；当前消息主要来自本地与 AI 输出，需要明确 sanitize 策略

中优先级：
- 设置面板与 Agent 通过自定义事件通信：可用但缺少强类型协议与版本号，后续扩展容易“字段漂移”

## 6. 后续开发建议（2–5 模块节奏的候选）
- Room 模式下强制禁用 plan：在 Agent 的上下文 builder 或 applyAiReply 阶段引入 “uiMode=room => allowPlan=false” 的硬限制
- 增加 Room 状态条：直接用 `__agentDebug.getSnapshot()` 展示锁定/情绪/疲劳等核心指标
- 收敛 Room <-> Agent 设置协议：为 `agent_settings_*` 增加 `v` 与字段白名单校验
- 为消息渲染补齐安全策略：至少限制允许的 markdown/HTML，或统一 sanitize

## 7. 企业级代码风格差距（面向代码审计）
- room 当前基本是“页面脚本 + UI + 通信”都在一个文件里，企业级会进一步拆出：
  - room store（会话/角色/设置持久化）
  - room 与 agent 的 adapter（事件协议、调试桥能力探测）
  - room UI 组件（消息列表、输入框、设置面板）

## 8. 算法与逻辑深度评估（按难度）
- 低：三栏布局与 UI 状态管理
- 中：与 Agent 的跨组件通信（事件 + expose + 调试桥）
- 中-高：安全/隔离（Room 模式禁用 plan、消息渲染 XSS 防护、调试桥权限）


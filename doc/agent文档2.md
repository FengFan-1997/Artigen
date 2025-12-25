# agent文档2：任务续航与页面变化反应（DOM/BOM 信号）

## 1. 目标

让 Agent 在“任务执行（plan）”过程中具备两种连续性能力：

- 任务动作队列执行完/失败后，自动再次请求 AI 拉取下一段 `plan` + `avatarPlan`
- 页面发生变化（跳转、错误提示、成功提示、toast/alert 等）时，后台触发一次“角色反应”AI 调用（不污染记忆）

## 2. 任务续航（TaskContinue）

### 2.1 会话状态

`frontend/src/agent/components/Agent.vue` 持久化一份任务会话：

- `taskSession.active`：是否处于任务续航模式
- `taskSession.goal`：任务目标（来自用户对话中提取或沿用）
- `taskSession.autoContinueCount`：自动续航次数（用于限流）
- `taskSession.lastContinueAt`：上次续航时间戳（用于冷却）

存储位置：`localStorage`，key 为 `agent_task_session`。

### 2.2 续航请求

核心函数：`Agent.vue:requestNextTaskChunk(reason)`。

输入：

- `reason: 'completed' | 'failed' | 'manual'`

行为：

- 组装续航提示词（包含原因、目标、当前路由）
- 调用 AI（`sendMessageToAI`），并强制要求输出：
  - 可选：`plan:` 严格 JSON 数组（1–8 步）
  - 必选：`avatarPlan:` 严格 JSON 数组（1–4 步）
- 回包统一走 `Agent.vue:applyAiReply` 解析与执行（`plan` 交给 `useTaskExecutor`，`avatarPlan` 交给 avatarAdapter）
- `suppressMemorySave = true`，避免任务循环内容污染本地记忆

### 2.3 触发点

- 计划完成/失败：
  - 监听 `plan.value?.status`
  - `completed` → `requestNextTaskChunk('completed')`
  - `failed` → `requestNextTaskChunk('failed')`
- 页面跳转：
  - 监听 `router.currentRoute.value.fullPath`
  - 若 `taskSession.active`，触发一次 `requestNextTaskChunk('manual')` 以便在新页面继续任务
- 页面刷新/初始化：
  - `onMounted` 时 `loadTaskSession()`
  - 若存在活跃 session 且当前无执行中的 plan，延迟触发 `requestNextTaskChunk('manual')`

## 3. 页面变化反应（DOM 信号 → 背景反应）

### 3.1 DOM 监测

`Agent.vue:startDomObserver()` 使用 `MutationObserver` 监听：

- `childList`：新增节点
- `characterData`：文本变更
- `attributes`：class/role/aria-live 等变更

筛选策略（降低噪声）：

- 优先捕获 `role="alert"` / `aria-live` / toast/notification/snackbar 等容器
- 对文本做关键词分类：
  - error：错误/失败/exception/500/404/403 等
  - success：成功/完成/已生成/done/success 等

### 3.2 触发背景反应

DOM 信号不会直接插入聊天窗口，而是进入后台反应队列：

- 通过 `Agent.vue:reactToSystemEvent` 入队
- 由 `flushBackgroundReaction` 合并批量事件并调用 `requestAgentReaction`
- `suppressMemorySave = true`，避免 DOM 噪声写入记忆

## 4. 验收方式（最小闭环）

- 执行一个会产生多段页面操作的任务（AI 返回 `plan`）
- 当 `plan.status` 变为 `completed/failed` 时，应自动继续请求 AI 获取下一段任务
- 页面出现 toast/alert 或明显错误/成功提示时，Agent 应在后台做出符合人设的简短反应（可说话/可旁白动作）


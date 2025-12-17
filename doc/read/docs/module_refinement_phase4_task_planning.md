# 模块深化：任务规划与自动化 (Phase 4: Task Planning)

## 1. 概览
本阶段重点实现了 Agent 的核心高级功能——**任务规划 (Task Planning)**。允许 Agent 接收复杂的用户指令（如“帮我登录”），将其拆解为一系列可执行的步骤（导航、高亮、点击、输入），并自动执行。同时优化了聊天窗口的交互体验（5秒自动关闭）。

## 2. 新增功能

### 2.1 任务规划系统 (Task Planning System)
- **后端 (LLM Brain)**:
  - 更新了 System Prompt，增加了 `plan:` 工具。
  - LLM 现在可以返回 JSON 格式的任务计划：
    ```json
    plan: [
      {"type": "navigate", "target": "/auth"},
      {"type": "input", "target": "#username", "value": "guest"},
      {"type": "click", "target": "#login-btn"}
    ]
    ```
- **前端 (Execution Engine)**:
  - **Types**: 定义了 `TaskPlan` 和 `TaskStep` 接口。
  - **Composable (`useTaskExecutor`)**: 
    - 解析后端返回的 JSON 计划。
    - 管理任务状态 (`pending`, `running`, `completed`, `failed`).
    - 逐步执行任务：支持 `navigate`, `click`, `input`, `highlight`, `wait` 指令。
    - 实现了执行时的错误处理和延时（模拟真实操作感）。
  - **UI (`TaskDisplay`)**:
    - 在 Agent 旁显示当前任务面板。
    - 实时显示步骤进度（打钩、加载中动画）。

### 2.2 聊天窗口优化
- **自动关闭**: 实现了 5 秒无操作自动关闭聊天窗口的功能。
  - 逻辑：监听 `mousemove`, `click`, `keydown` 事件重置计时器。
  - 智能防误触：如果用户正在输入或 Agent 正在思考 (`isLoading`)，不会自动关闭。

## 3. 技术细节
- **Regex Parsing**: 在 `Agent.vue` 中增加了对 `plan: [...]` 模式的正则匹配和 JSON 解析。
- **Reactive State**: 使用 Vue 3 `ref` 和 `watch` 精确控制任务执行流。
- **DOM Automation**: 使用原生 DOM API (`querySelector`, `click()`, `dispatchEvent`) 模拟用户操作。

## 4. 下一步计划
- **UI 深度美化**: 任务面板目前是基础样式，后续可以结合 Q 版风格进行优化。
- **路由集成**: 目前 `navigate` 使用 `window.location.href`，后续应集成 `vue-router` 以实现无刷新跳转。
- **错误恢复**: 如果某一步失败，Agent 应该能向用户报告并请求帮助。

## 5. 文件变更
- Modified: `backend/server.js` (Prompt update)
- Modified: `frontend/src/agent/components/Agent.vue` (Integration)
- Modified: `frontend/src/agent/components/ChatWindow.vue` (Auto-close)
- Created: `frontend/src/agent/composables/useTaskExecutor.ts`
- Created: `frontend/src/agent/components/TaskDisplay.vue`
- Created: `frontend/src/agent/types/task.ts`

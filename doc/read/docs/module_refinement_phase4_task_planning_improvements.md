# 模块深化：任务规划增强与系统修复 (Phase 4: Task Planning Improvements)

## 1. 概览
本阶段重点优化了 **任务规划 (Task Planning)** 的执行体验，使其更加符合单页应用 (SPA) 的交互模式，并增强了视觉反馈。同时修复了项目构建和部署流程中的关键问题。

## 2. 核心改进

### 2.1 任务执行引擎升级 (`useTaskExecutor`)
- **Vue Router 集成**: 
  - 之前的实现使用 `window.location.href` 进行页面跳转，会导致整个应用刷新，丢失状态。
  - **新实现**: 引入 `vue-router`，对于内部路由（以 `/` 开头）使用 `router.push()` 进行无刷新跳转。这大大提升了任务执行的连贯性。
  - **智能等待**: 在导航指令执行后，代码现在会正确等待路由跳转完成 (`await`) 再继续下一步。
  
- **视觉高亮优化 (`highlight`)**:
  - 之前的实现仅使用红色描边 (`outline`)。
  - **新实现**: 
    - 增加全局 CSS 类 `.agent-highlight-target`，实现粉色呼吸灯脉冲效果 (`box-shadow` 动画)。
    - 自动滚动: 使用 `scrollIntoView` 确保高亮元素平滑滚动到屏幕中央。
    - 视觉层级: 确保高亮效果位于 Agent 之下但其他内容之上。

### 2.2 自动关闭功能确认
- 确认 `ChatWindow.vue` 中已包含 5 秒无操作自动关闭的逻辑。
- 逻辑：监听鼠标移动和点击，闲置 5 秒且无正在输入内容时触发 `close` 事件。

### 2.3 工程化修复
- **依赖修复**: 修复了 `marked` 库的类型定义缺失导致构建失败的问题。
- **Husky & Lint**: 
  - 重新配置了 `.husky/pre-commit` 钩子。
  - 降级 `lint-staged` 以适配当前的 Node.js 环境。
  - 增加了 `type-check` (vue-tsc) 到提交前检查，防止类型错误被提交。

## 3. 文件变更
- Modified: `frontend/src/agent/composables/useTaskExecutor.ts` (Router & Highlight logic)
- Modified: `frontend/src/style.css` (Added highlight animations)
- Modified: `frontend/package.json` (Dependency fixes)
- Modified: `.husky/pre-commit` (Hook fixes)

## 4. 下一步计划
- **UI 深度定制**: 为 Agent 的对话框和任务面板设计更符合 "Q版" 风格的皮肤。
- **错误恢复机制**: 当任务某一步失败（如元素未找到）时，允许用户手动干预或 Agent 自动重试。
- **语音交互**: 虽然目前暂缓，但可以预留 TTS/STT 的接口结构。

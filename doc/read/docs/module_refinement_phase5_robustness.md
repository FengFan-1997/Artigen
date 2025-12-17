# 模块深化：任务执行鲁棒性与 UI 优化 (Phase 5: Robustness & UI Polish)

## 1. 概览
本阶段重点提升 Agent 任务执行的稳定性（Robustness）和 UI 的精致度。目前的任务执行器 (`useTaskExecutor`) 在面对动态加载的内容时较为脆弱，容易因找不到元素而失败。同时，UI 需要进一步 "Q版化" 以符合整体风格。

## 2. 核心改进计划

### 2.1 任务执行器增强 (`useTaskExecutor.ts`)
- **智能重试机制 (Smart Retry)**:
  - 遇到 `querySelector` 失败时，不要立即报错。
  - 引入 `waitForElement` 逻辑，每隔 500ms 重试一次，最多重试 3-5 秒。
  - 解决 SPA 页面切换后 DOM 尚未完全渲染导致的任务中断问题。
- **新增指令支持**:
  - 支持 `scroll` 指令（Backend Prompt 中已有，但前端未实现）。
- **错误处理**:
  - 当任务彻底失败时，提供更友好的 UI 反馈，而不是仅仅 console error。

### 2.2 UI 风格化 (`TaskDisplay.vue` & `Agent.vue`)
- **Q版风格升级**:
  - 增加圆角、阴影和弹跳动画。
  - 任务进度的视觉反馈更加生动（如进度条动画）。
- **状态反馈**:
  - 当 Agent 正在执行任务时，头部显示 "Working..." 或相应的图标状态。

## 3. 预期文件变更
- `frontend/src/agent/composables/useTaskExecutor.ts`: 添加重试逻辑和 scroll 支持。
- `frontend/src/agent/components/TaskDisplay.vue`: CSS 样式优化。
- `frontend/src/agent/types/task.ts`: 更新类型定义。

## 4. 时间表
- [ ] Step 1: 升级 `useTaskExecutor` (Retry & Scroll).
- [ ] Step 2: 优化 `TaskDisplay` UI.
- [ ] Step 3: 验证测试.

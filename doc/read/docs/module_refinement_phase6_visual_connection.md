# 模块深化：视觉连接线与操作反馈 (Phase 6: Visual Connection & Feedback)

## 1. 概览
根据 `agent.md` 模块四的要求，为了增强 Agent "帮助用户操作" 的感知，我们需要在 Agent 与目标元素之间建立更强的视觉联系。目前仅有目标元素的高亮，缺少 Agent 指向目标的连接线。

## 2. 核心改进计划

### 2.1 视觉连接线 (Connection Line)
- **需求**: 当 Agent 指引用户 (`highlight`) 或正在操作 (`click`, `input`) 某个元素时，在 Agent 中心与目标元素中心之间绘制一条动态连接线。
- **样式**: 
  - Q版风格，可以是虚线或带有流动光点的线条。
  - 颜色需与 Agent 主色调协调 (Blue/Cyan)。
  - 动态更新：当 Agent 移动或页面滚动时，线条需实时更新。

### 2.2 任务执行中的视线锁定
- **需求**: 在执行多步任务时，Agent 的视线应始终跟随当前步骤的目标元素。
- **实现**: 
  - `useTaskExecutor` 需要暴露当前正在操作的 DOM 元素或其位置信息。
  - `Agent.vue` 监听此信息并更新眼球朝向。

## 3. 技术实现方案

### 3.1 新增组件 `ConnectionLine.vue`
- 使用 SVG `<line>` 或 `<path>` 绘制连接。
- 接收 `start: {x, y}` 和 `end: {x, y}` props。
- 使用 CSS `stroke-dasharray` 和 `animation` 实现流动效果。

### 3.2 状态同步
- 在 `Agent.vue` 中计算 `start` (Agent Center) 和 `end` (Guide Target Center)。
- 确保 `useTaskExecutor` 在执行步骤时，能将 `guideTarget` 传递给 `Agent.vue` (或通过共享状态)。

## 4. 变更文件
- Created: `frontend/src/agent/components/ConnectionLine.vue`
- Modified: `frontend/src/agent/components/Agent.vue`
- Modified: `frontend/src/agent/composables/useTaskExecutor.ts` (Optional: expose current element)

## 5. 时间表
- [x] 文档编写
- [ ] 创建 ConnectionLine 组件
- [ ] 集成至 Agent.vue
- [ ] 优化多步任务时的视觉反馈

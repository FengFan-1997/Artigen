# 模块深化：UI升级与智能增强 (Module 6: UI Upgrade & Intelligence)

## 1. 概览
本阶段重点提升了 **Agent 的视觉体验** 和 **智能交互能力**。
我们重构了聊天窗口的 UI，使其更具现代感（Glassmorphism 风格），并解决了窗口遮挡页面的问题。同时，后端能力大幅增强，支持更复杂的指令（如滚动、输入）。

## 2. 核心改进

### 2.1 UI 视觉升级 (ChatWindow Refactor)
- **Glassmorphism 设计**:
  - 采用磨砂玻璃效果 (`backdrop-filter: blur`)，背景半透明，更具科技感。
  - 添加了细腻的阴影和边框高光，提升层次感。
- **动画优化**:
  - 聊天消息增加了 `slideUp` 进场动画。
  - 视图切换（聊天 <-> 个人中心）增加了平滑的 `fade` 过渡。
  - 按钮增加了悬停缩放效果。
- **布局优化**:
  - 聊天窗口高度增加至 500px，宽度增加至 340px，提供更大的阅读空间。
  - 优化了滚动条样式，使其更隐蔽美观。

### 2.2 智能定位系统 (Smart Positioning)
- **边界检测**:
  - Agent 现在会实时检测自身位置。
  - 如果 Agent 靠近屏幕右边缘，聊天窗口会自动弹出在**左侧**，避免溢出屏幕。
  - 如果 Agent 靠近屏幕左边缘，聊天窗口会自动弹出在**右侧**。
  - 默认情况下，聊天窗口居中显示在 Agent 上方或下方。

### 2.3 智能能力增强 (Backend Intelligence)
- **Prompt 升级**:
  - 更新了 System Prompt，教导 LLM 识别更多用户意图。
- **新增工具 (Tools)**:
  - **Scroll**: 支持 "向下滚动" (`scroll: down`)、"滚到底部" (`scroll: bottom`)、"滚动到特定元素" (`scroll: #features`)。
  - **Input**: 支持 "帮我输入" (`input: .search-box | hello`)，Agent 可以模拟键盘输入并触发事件。
- **前端执行器升级**:
  - `Agent.vue` 中增加了对 `scroll:` 和 `input:` 指令的解析和执行逻辑。

## 3. 文件变更
- **Modified**:
  - `frontend/src/agent/components/ChatWindow.vue` (UI Styles, Positioning Logic)
  - `frontend/src/agent/components/Agent.vue` (Prop passing, Executor logic)
  - `backend/server.js` (System Prompt update)

## 4. 下一步计划
- **RAG 知识库扩充**: 目前仅支持基础问答，需要导入更多项目文档。
- **语音交互 (TTS/STT)**: 让 Agent 能听会说。
- **更复杂的任务链**: 测试 Agent 是否能完成 "去设置页修改名字" 这样的多步操作。

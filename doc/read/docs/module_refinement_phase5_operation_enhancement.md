# 模块深化：操作增强与文本定位 (Phase 5: Operation Enhancement & Text Location)

## 1. 概览
本阶段致力于解决 Agent 在 "听指令帮助用户操作" 这一核心功能上的痛点。目前 Agent 依赖 LLM 猜测 CSS 选择器，这在实际网页中非常脆弱。我们将引入 **基于文本的元素定位 (Text-Based Location)** 机制，并增强操作的丰富度（如 Hover）。

## 2. 核心改进计划

### 2.1 引入 "按文本查找" (`text:`)
- **问题**: LLM 无法看到页面源码，难以猜对 `#submit-btn-v2` 这样的 ID。
- **解决方案**: 允许 LLM 输出 `click: text:登录` 或 `highlight: text:价格`。
- **技术实现**: 
  - 前端实现 `findByText(text)` 函数，使用 XPath 或遍历 DOM 寻找包含特定文本的可见元素。
  - 优先匹配 按钮、链接、输入框标签。

### 2.2 增加 `hover` (悬停) 操作
- **需求**: 很多菜单需要鼠标悬停才能展开。
- **实现**: 模拟 `mouseover` 和 `mouseenter` 事件。

### 2.3 增加 `press` (按键) 操作
- **需求**: 很多搜索框或表单需要按 Enter 提交，而不是点击按钮。
- **实现**: 模拟 `keydown`, `keypress`, `keyup` 事件。

### 2.4 视觉反馈增强
- **Agent 视线**: 在执行任务时，让 Agent 的眼睛一直盯着当前的目标元素。
- **连接线**: (可选) 在 Agent 和目标元素之间绘制一条临时的指示线。

## 3. 变更文件
- Modified: `backend/server.js` (Prompt Update)
- Modified: `frontend/src/agent/types/task.ts` (Type Definition)
- Modified: `frontend/src/agent/composables/useTaskExecutor.ts` (Implementation)
- Modified: `frontend/src/agent/components/Agent.vue` (Single Command Support)
- Created: `frontend/src/agent/utils/dom.ts` (DOM Utilities)

## 4. 时间表
- [x] 文档编写
- [x] Backend Prompt 更新 (支持 `text:`, `hover`, `press`)
- [x] Frontend Executor 升级 (集成 `dom.ts`)
- [x] Agent.vue 单指令支持升级
- [x] 验证与测试

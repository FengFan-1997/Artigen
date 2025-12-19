# Phase15：modeDoc 人设注入 + 语义事件流（实时反应深化）

时间：2025-12-18

## 本次做了什么

### 1) 后端：modeDoc 人设读取更稳健

- 扩展 `backend/server.js` 的 modeDoc 索引构建逻辑：除了按文件名匹配，也会按“相对路径/去扩展名相对路径”一起建立 key。
- 目的：当模型名称/路径包含目录层级（例如 `bilan/aijier_3_hx`）时，也能正确命中对应的 `doc/modeDoc/modeldoc/**.md`，从而把人设内容注入到 `/api/chat` 的 systemPrompt 里。

### 2) 前端：语义化交互指标接入 AI 反应（更像“实时反应系统”）

- 在 `frontend/src/agent/components/Agent.vue` 接入 `frontend/src/agent/utils/semanticEvents.ts`：
  - 采样用户交互（鼠标移动/点击）形成 `InteractionSample` 序列（含速度、相对位置、可选命中区域）。
  - 交互片段结束时生成结构化摘要文本（中/英文）作为 `[System Event]` 输入。
  - 用统一的 `shouldAskAiForInteraction(metrics)` 决定是否触发 AI（减少无意义请求，保留高价值互动）。
- 同时把当前 Live2D 模型信息（`modelName`/`modelPath`）注入到 `agentContext.runtime`，让后端更容易根据当前模型定位 modeDoc 人设。

## 验证

- `pnpm --dir frontend run type-check`
- `pnpm --dir frontend run lint`

## 下一步准备做什么

- 把 “AI 返回的 emotionTag / motionTag” 更严格地落到 Live2D 的动作与表情（含冲突处理、冷却与优先级）。
- 让 modeDoc 的“动作/语音风格”影响本地快速反应（不等 AI 也能先做一段微动作），AI 仅做补强与纠偏。


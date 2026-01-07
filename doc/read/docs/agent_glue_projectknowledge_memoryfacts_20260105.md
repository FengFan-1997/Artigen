# Agent 胶水核心补齐：ProjectKnowledge 注入 & memoryFacts 协议（2026-01-05）

## 本次做了什么（2 个模块）

### 1) 后端 Proxy 调用补齐 ProjectKnowledge 注入

- 前端走 `/api/chat`（proxy）时，会额外携带 `projectKnowledge`（站点知识与操作手册），让后端在需要时注入提示词并驱动 RAG/引导逻辑。
- 关联代码：
  - [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)
  - [projectKnowledge.ts](file:///g:/AvuePro/newPro/frontend/src/agent/data/projectKnowledge.ts)

### 2) memoryFacts（事实型记忆）显式协议 + 落库

- 支持 AI 回复中显式输出：
  - `memoryFacts: ["...","..."]` 或 `facts: ["...","..."]`
- 前端解析后会写入 `memoryFacts`（LocalStorage），但在 `suppressMemorySave` 的场景（任务续航/后台 reaction）会跳过写入，避免噪声污染。
- 关联代码：
  - [aiReplyParser.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/aiReplyParser.ts)
  - [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)
  - [useLocalMemory.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useLocalMemory.ts)

## 更新了哪些文档

- 在综合需求文档中补齐：
  - `projectKnowledge` 的 proxy 注入说明
  - `memoryFacts:` 协议说明
- 关联文档：
  - [allnew.md](file:///g:/AvuePro/newPro/doc/read/agent/allnew.md)

## 现在你能怎么用（调试建议）

- 在 `AgentDebug` 的 AI Reply 测试框里粘贴：
  - `memoryFacts: ["用户喜欢用中文","用户喜欢傲娇语气"]`
  - 再点击“应用到 Agent”，观察本地 `memoryFacts` 是否增长（非 suppressMemorySave 场景）。

## 下一步准备做什么（下一轮建议 2–5 模块）

### 下一大部（PRD 草案）：知识/记忆闭环 + 可观测

1) 前端把“本地 Facts + 后端 core_memory”统一展示与可编辑（AgentDebug 面板）
2) 给后端增加 `GET /api/memory/profile`（返回 core_memory + summary + meta），前端定期拉取并融合
3) 完成 RAG 的增量化：从 `doc/read/docs` 分块入库 + embedding（已有 vectors.json 框架，补齐生成与更新触发）
4) AI 输出协议收紧：为 `avatarPlan / plan / memoryFacts` 定义更严格的 envelope 版本（v=2），失败时前端降级策略固定

## 时间戳

- 2026-01-05


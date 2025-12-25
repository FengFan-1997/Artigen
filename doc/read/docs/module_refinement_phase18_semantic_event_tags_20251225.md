# 模块阶段 18：交互语义标签增强（2025-12-25）

## 本次完成

- 增强了交互片段（鼠标移动/点击/绕圈）的语义化输出：将命中区域名称归一化到更稳定的语义目标（如 `eyes/cheek/hair/accessory/body`），并生成可供 AI 理解的语义标签（如 `USER_STARING_EYES`、`USER_TOUCHES_ACCESSORY`、`USER_MAKING_ME_DIZZY`）。
- 在交互片段触发 AI 反应时，除了原始 `metrics` 外，额外上报 `semantic`（`primaryTargets` + `tags`），方便后续做“本地快反馈 + AI 慢反应”的分层决策与记忆抽取。

## 影响范围

- `frontend/src/agent/utils/semanticEvents.ts`：新增 `buildSemanticInteractionContext`，并将语义目标/语义标签拼入交互摘要文本；同时更新 AI 触发条件，使眼睛/脸颊/饰品/手部等更“有特殊性”的交互更容易触发 AI 反应。
- `frontend/src/agent/components/Agent.vue`：在 `interaction_session` 的 payload 中补充 `semantic` 字段。

## 下一步计划

- 把 `semantic.tags` 作为“情绪状态机”的输入：例如 `USER_RAPID_TAPS` 叠加愤怒值、`USER_STARING_EYES` 叠加害羞值，并实现衰减与冷却。
- 把 `semantic` 写入后端 `memory/` 的长期记忆条目：将高频特殊行为（如“总爱摸发卡/盯眼睛”）沉淀为 `core_memory`，短期 buffer 超限后再压缩总结。

## 时间戳

- 2025-12-25 23:11


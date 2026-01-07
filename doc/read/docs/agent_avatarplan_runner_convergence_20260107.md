# Agent AvatarPlan 执行收敛与解析补强（2026-01-07）

## 本轮时间

- 2026-01-07

## 我做了什么

- 收敛 AvatarPlan 执行器：把 [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue) 内部的 AvatarPlan 队列/执行/节奏/中断实现移除，统一改为使用 [useAvatarPlanRunner.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useAvatarPlanRunner.ts) 作为唯一执行来源，避免“双执行器”长期漂移。
- 保持仲裁边界：AvatarPlan 通道依然通过 motion/expression 仲裁层以 `avatarPlan` channel 清理，确保 soft/hard interrupt 能稳定生效。
- 解析侧确认：AI 回复解析已支持把 `tempo/gap/interrupt` 透传进 AvatarPlan step（Envelope / avatarPlan JSON 自带字段透传，`motionTag` 解析补齐 tempo/gap/interrupt 字段）。
- 校验通过：`pnpm run type-check` 与 `pnpm run lint` 均通过。

## 下一步准备做什么

- 把 `aiService` 的提示词里对 `tempo/gap/interrupt` 的可用性显式化（只在需要节奏化时使用，避免模型滥用）。
- 在 AgentDebug 增加解析器/AvatarPlan runner 的最小可观测：最近一次 avatarPlan 的 sanitize 结果与被丢弃原因统计，便于快速自检协议偏差。


# Agent AvatarPlan 表情仲裁统一与动作通道扩展（2026-01-05）

## 本次完成

- AvatarPlan 相关表情统一走表情仲裁入口，避免绕过优先级规则
  - Agent.vue 的 avatarAdapter.setEmotion 改为通过 requestExpression 触发（带 avatarPlan 优先级）
  - useAvatarPlanRunner.ts 增加可选 requestExpression 注入，执行步骤时优先走仲裁；未注入时保持旧行为
- 动作仲裁新增 channel 参数，默认 channel=default，保持旧调用兼容
  - 同一 channel 内按 until+priority 进行仲裁
  - 不同 channel 的仲裁状态独立存储，为后续“动作分层/节奏层”预留扩展点

## 影响面

- 不改变既有 requestMotion / requestExpression 的现有调用方式与默认行为
- 仅在主动使用 channel 或注入 requestExpression 时启用新增能力

## 下一步

- 在 Agent 的动作触发点按语义补全 channel（例如：talk/gesture/idle/move）
- 收敛 Agent.vue 内 avatarPlan 执行器与 useAvatarPlanRunner 的重复实现，保留单一权威入口


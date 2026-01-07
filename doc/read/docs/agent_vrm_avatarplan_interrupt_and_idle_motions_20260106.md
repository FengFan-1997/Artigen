# Agent VRM：AvatarPlan 可打断执行 + Idle 微动作打通（2026-01-06）

## 本次做了什么

### 1) AvatarPlan 执行变为“可打断”
- 新增了 AvatarPlan 的取消机制：当用户发生明确交互（点击/拖拽）或 AI 新回复到来时，会立即取消正在执行的 AvatarPlan，并清空其动作/表情占用通道。
- AvatarPlan 步骤内部的等待改为“可提前结束”的等待：取消后不会继续把剩余步骤跑完，避免动作/表情与用户意图对冲。

相关实现：
- Agent 侧取消逻辑与可中断等待：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)
- 仲裁层新增清理通道能力：[useMotionArbitration.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useMotionArbitration.ts)、[useExpressionArbitration.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useExpressionArbitration.ts)

### 2) 修复“情绪微动作推荐”在 VRM 上不生效的问题
- `emotionEngine.recommendMicroReaction()` 会产出大量 `idle_*` 细分动作（如 `idle_touch_face`/`idle_fidget_hands` 等）。
- 之前 Agent 的 `ALLOWED_MOTIONS` 不包含这些动作，导致 motion 被归一化回退为 `tap_body`，VRM 侧只能做很单一的微动作。
- 现在补齐了这些 `idle_*` 动作到允许列表，VRM 微动作调度能真正跑出差异化表现。

相关实现：
- VRM 支持的 procedural motion 集合在：[VrmWidget.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/VrmWidget.vue)
- Agent 允许与归一化名单在：[Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

### 3) AvatarPlan 的“动作风格化序列”对 idle 细分动作做了保真
- 之前只要 motion 以 `idle` 开头，就会被替换成通用 idle 序列（look_around/think/sway…），导致 AI 若输出 `idle_rub_neck` 等细分动作会被“抹平”。
- 现在：若 motion 是 `idle_*` 细分动作，会保持原动作，不再被替换。

## 验证
- 通过编辑器诊断检查（TypeScript/Vue 语言服务）确认无新增报错。
- 未运行 `frontend` 的 lint/typecheck（按 mustRead 要求）。

## 下一步建议（2-5 个模块内）
1) 让 AvatarPlan 支持“软打断策略”：不是立刻取消，而是允许当前 step 收尾后退出（适合长语音/长动作）。
2) VRM 的 idle 动作池按 personaTraits 做权重映射：把“傲娇/高冷/懒散”等稳定映射到更一致的 idle 风格。
3) 给 AvatarPlan 增加“节奏层”参数（beat/tempo），让同一动作在不同情绪下快慢不同，而不是只改 duration。


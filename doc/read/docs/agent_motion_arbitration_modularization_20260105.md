# Agent 动作/表情仲裁模块化（2026-01-05）

## 本次做了什么

- 把 `Agent.vue` 里的“动作优先级仲裁（motion）”与“表情优先级仲裁（expression）”从组件中抽离为可复用模块，降低单文件复杂度，便于后续把“动作驱动核心”进一步组件化/服务化。

## 变更点（代码）

- 新增 [useMotionArbitration.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useMotionArbitration.ts)：统一管理 `motionCommand` 的抢占/锁定/过期清理，保留原有 `MOTION_PRIORITY` 语义与行为。
- 新增 [useExpressionArbitration.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useExpressionArbitration.ts)：统一管理表情请求的抢占规则，并通过注入回调复用 `Agent.vue` 现有的视觉状态切换逻辑。
- 调整 [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)：用 composable 替代原本内联的仲裁实现，调用点保持不变（例如 `requestMotion(...)`、`requestExpression(...)`）。

## 为什么要这样做

- “动作驱动核心”在企业级落地时通常会不断扩展：更多动作通道、更复杂的抢占策略、并行/串行编排、节奏层（beat）、冷却与预算等。如果继续把仲裁逻辑堆在 `Agent.vue`，后续维护成本会快速上升。
- 先把“仲裁”抽出来，后续可以在不影响 UI 组件的情况下迭代策略（例如：支持分通道仲裁、同优先级打断规则、按情绪调整优先级等）。

## 下一步准备做什么

- 在现有仲裁基础上，增加“动作通道”概念（例如：body/face/look/gesture），让 `avatarPlan` 的 parallel 能更真实地并行执行（同一通道仍按优先级仲裁）。
- 在 VRM 侧把“程序化动作”和“动画 clip”统一到同一套驱动接口上，避免两套体系互相抢控制权导致僵硬或突变。


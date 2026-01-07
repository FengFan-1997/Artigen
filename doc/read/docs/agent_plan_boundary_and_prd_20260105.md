# Agent 开发简报：plan 执行边界硬隔离 + PRD 下一大部（2026-01-05）

时间：2026-01-05

## 本次做了什么（2-3 个模块）

### 模块 A：修复 applyAiReply 的 allowPlan 逻辑（核心稳定性）

- 现象：Idle AI / Background Reaction / TaskContinue 这些“非主聊天流程”的调用方虽然传了 `allowPlan: false`，但 `Agent.vue:applyAiReply` 之前会无条件解析并执行 `plan`，存在误触发页面操作的风险。
- 改动：
  - `Agent.vue:applyAiReply` 新增 `allowPlan?: boolean`，并把它真正用于 `parseAiReply` 与 plan 执行分支
  - 当 `allowPlan=false` 时：
    - 不解析/不执行 `plan`
    - 不执行 legacy 的 `highlight/navigate/click/hover/scroll/input/press` 文本指令
  - 当回复中存在 `plan` 时，即使 `allowPlan=true` 也会跳过 legacy 文本指令，避免“双通道重复操作”

### 模块 B：背景反应明确禁止 plan（核心安全边界）

- 改动：
  - `Agent.vue:flushBackgroundReaction` 调用 `applyAiReply` 时显式传入 `allowPlan: false`
  - `Agent.vue:maybeTriggerIdleAi` 调用 `applyAiReply` 时显式传入 `allowPlan: false`
- 结果：
  - DOM/系统事件只会驱动动作与短旁白，不会误触发网页操作

### 模块 C：补齐下一大部 PRD（Phase 20）

- 改动：
  - `doc/read/agent/allnew.md` 追加 “十一、下一大部：产品 PRD（Phase 20｜补齐逻辑层与稳定性闭环）”
  - 明确了：
    - Chat/TaskContinue/Background/Idle 四条链路的执行边界
    - 统一协议、容错兜底、安全边界、验收标准与里程碑建议

## 影响的文件

- `frontend/src/agent/components/Agent.vue`
- `doc/read/agent/allnew.md`

## 下一步准备做什么（候选 2-5 个模块）

1) 统一 Agent 内部的 BackgroundReaction 实现：优先复用 `useBackgroundReactions.ts`，避免重复逻辑与分叉行为  
2) 为高风险 task step 增加前端“硬拦截/二次确认”白名单（提交/删除/下载等）  
3) 完善 TaskContinue 的失败上下文：把“当前页面关键状态摘要”（遮挡弹窗/登录过期/关键元素缺失）一起回传给 AI  

## 目前仍做不到但确实需要的东西（留痕）

- 真正可控的“跨站 DOM 操作鲁棒性”：需要站点级 selector 策略与可维护的目标库（否则纯 AI selector 容易漂移）

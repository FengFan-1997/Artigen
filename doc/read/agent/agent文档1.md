# agent文档1：VRM 人设接入与 `avatarPlan` 指令协议

## 1. 目标

让 VRM 模型在页面左下角常驻，并能基于 `/doc/modeDoc` 的人设文档，在两类场景下生成并执行动作/表情/气泡/语音：

- 用户对话触发（chat）
- 用户长时间无操作触发（idle）

## 2. 人设来源与绑定

- VRM 模型列表来自前端 Vite 虚拟模块 `virtual:vrm-models`（由 `frontend/vite.config.ts` 生成）。
- 该模块会扫描 `/doc/modeDoc/modeldoc/genshin/**` 下的人设文档，解析出每个 VRM 对应的人设提示词文本，并导出 `vrmPersonaTextByModelName`。
- `Agent.vue` 会根据当前选中的 VRM 名称做一次 key 归一化，取得对应人设文本并注入到 AI 请求上下文中。

关键接入点：

- `frontend/vite.config.ts`：生成 `vrmPersonaTextByModelName`
- `frontend/src/agent/components/Agent.vue:getPersonaRulesForAi`：读取并选择当前人设文本（优先 localStorage，其次内置映射）
- `frontend/src/agent/components/Agent.vue:buildAgentContext`：把 `persona.rules`、`constraints.allowedMotions/allowedExpressions`、`runtime.agentType` 等上下文发送到后端

## 3. AI 指令协议：`avatarPlan`

AI 回复允许包含自然语言文本（用于气泡显示）并附带一个可选或必选的动作脚本：

```
avatarPlan: [ ...JSON 数组... ]
```

### 3.1 支持的 step 类型

以 `frontend/src/agent/types/avatarPlan.ts` 为准，常用如下：

- `{"type":"motion","motion":"wave","duration":1200}`
- `{"type":"expression","expression":"happy","duration":2000}`
- `{"type":"pose","motion":"mood_happy","expression":"happy","duration":1800}`
- `{"type":"speak","text":"……","motion":"talking","expression":"happy","bubble":true,"duration":2200}`
- `{"type":"bubble","text":"……","duration":2000}`
- `{"type":"move","x":"70%","y":"80%","duration":1600}`
- `{"type":"wait","duration":800}`

### 3.2 约束

前端会把允许的 motions/expressions 作为约束传给 AI，并在执行时做归一化：

- `motion` 必须来自 `Agent.vue:ALLOWED_MOTIONS`
- `expression` 必须来自 `Agent.vue:ALLOWED_EXPRESSIONS`

不在允许列表中的 `motion` 会被归一化成最接近的可用动作（例如 “squat” → `crouch`）。

## 4. 执行链路

### 4.1 对话（chat）

- UI 调用 `Agent.vue:handleSendMessage`
- 组装 `agentContext`（包含人设、约束、运行态、近期记忆等）并调用 `/api/chat`
- AI 回复经 `Agent.vue:applyAiReply` 解析：
  - 提取 `avatarPlan:` 后的 JSON 数组
  - 放入队列并由 `runAvatarPlanSteps` 逐步执行（motion / expression / speak / bubble / move 等）

### 4.2 闲置（idle）

- `Agent.vue:startIdleTalk` 周期检查用户空闲时长
- 达到阈值后触发 `Agent.vue:maybeTriggerIdleAi`
- idle 请求强制要求 AI 输出 `avatarPlan`（1–4 步，偏轻量 idle/mood）
- 该请求会设置 `suppressMemorySave`，避免闲置内容污染记忆/聊天记录

## 5. 本地可预料承接（示例：懒散/慵懒）

当人设包含“懒散/慵懒/lazy/sleepy/tired”等关键词时，前端会在本地做部分可预料承接：

- 闲置久了会触发疲惫态与 `mood_tired`，并出现“我先蹲一会儿…”的短气泡
- 任务移动（`move`）会变慢（按人设与疲惫状态放大 duration）
- 用户催促“快点”时，会触发傲娇/懒散的本地回怼（例如 “baka！这已经很快啦！”）并配合动作

## 6. 验收方式（最小闭环）

- 切换到 VRM 模式，选择带人设文档的模型（例如 YaeMiko）
- 对话一句（例如“打个招呼”），AI 回复应包含 `avatarPlan:` 且模型有动作/表情
- 静置 65 秒以上，偶发触发 idle AI，模型应执行轻量 idle 行为脚本


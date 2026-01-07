# Room（AI 陪伴女友聊天室）PRD2 / LLM 协议（与现有 Agent Runtime 对齐）

版本：v0.2  
最后更新：2026-01-07  

> 本文用于“新开 room 模块（frontend/src/room）”之前的统一设计稿：  
> 1）明确 room 的产品体验与边界；  
> 2）明确 room 如何复用现有 `frontend/src/agent` 的运行时能力；  
> 3）给 AI 一个稳定、可解析、可执行的输出协议（兼容现有 `aiService.ts` + `aiReplyParser.ts`）。

---

## 1. 一句话定位
room 是一个“沉浸式陪伴聊天室页面”：以 **Agent 形象实时互动 + Galgame 风格聊天 + 长期记忆** 为核心，让用户在单独页面里获得“AI 女友陪伴”的完整体验；而 Agent（嵌入式）仍用于任何业务页面的引导/代操作。

---

## 2. 与现有项目能力对齐（最重要）
本项目已经有完整的 Agent Runtime（VRM/Live2D + 本地快轨 + AI 慢轨 + 记忆 + avatarPlan/plan 协议），room 不应从零再造轮子。

### 2.1 已有能力（room 必须直接复用）
- 交互采样与语义化：`semanticEvents.ts`（鼠标绕圈/狂点/命中区域等 → 语义标签）
- 情绪数值引擎：`emotionEngine.ts`（可积累/可衰减的情绪向量 → 表达层）
- AI 请求与提示词组装：`aiService.ts`（包含 constraints 与优先 JSON Envelope 的输出规则）
- AI 回复解析：`aiReplyParser.ts`（支持 JSON Envelope / avatarPlan:[] / plan:[] / tags）
- avatarPlan 执行：`useAvatarPlanRunner.ts`（动作/表情/气泡/说话等表现层调度）
- plan 执行（可选）：`useTaskExecutor.ts`（网页代操作，有安全边界）
- 记忆：`useLocalMemory.ts` + 后端 `backend/memory/*.json`（摘要 + facts）

### 2.2 room 的边界（避免需求膨胀）
- room 只负责“沉浸式 UI + 会话组织 + 用户身份/会话切换 + 与 Agent Runtime 对接”
- room 不负责重新设计 VRM 渲染/动作系统（用现有 VrmWidget/Live2DWidget 与仲裁器）
- room 不负责支付/计费（商业化 PRD 已覆盖）

---

## 3. 核心体验（产品视角）
### 3.1 页面布局（建议）
- 三栏布局：左侧对话区（紧贴左侧）/ 中间主舞台大角色 / 右侧设置栏（调参面板）
- 主舞台：角色（VRM/Live2D）以“舞台模式”常驻中间，可通过设置栏调大小等参数
- 对话区：左侧 Galgame 风格消息流 + 输入框
- 设置栏：直接集成调参能力（参考 AgentDebug，但不跳转页面）
- 状态条：显示“情绪/疲劳/眩晕/锁定倒计时”等轻量状态（可选）
- 会话列表：支持“多存档/多角色”（后续）

### 3.2 “实时反应”原则（room 的灵魂）
- 用户一旦触摸/点击/绕圈：必须 **0 延迟**触发本地快轨（眨眼、闪躲、嘟嘴、冒汗、气泡短句）
- AI 慢轨只做“更像她”的补强：补台词、补动作编排、补长期记忆、补复杂组合行为的归因
- AI 返回晚了也不尴尬：前端应允许“去重/取消/软打断”，避免 5 秒后突然执行过时动作

### 3.3 记忆体验（用户视角）
- 短期记忆：最近几轮对话保持连贯
- 长期记忆：用户偏好、称呼、禁忌、关系进度等以 facts 形式保存，减少 token 压力

---

## 4. room 的技术架构（复用 Agent Runtime）

### 4.1 数据流（建议按你现有实现走）
1) UI 输入：聊天文本 / 角色交互（鼠标、触摸）/ 系统事件（idle、页面状态）  
2) 本地快轨：立即出表情/动作/气泡（不等 AI）  
3) 事件汇总：在 0.8–2s 窗口内聚合语义事件（减少请求）  
4) AI 慢轨：调用后端代理（或 direct），拿到可解析输出  
5) 执行层：  
   - text → room 消息流 / Agent 气泡  
   - avatarPlan → 角色动作与表情  
   - plan（若开启）→ 执行网页代操作（room 默认可关闭）
6) 记忆：写入 local memory + 事实型 facts + 后端持久化

### 4.2 关键约束（与现有解析器保持一致）
- AI 输出必须“可被 `parseAiReply` 稳定解析”
- 最佳输出形态：**单一严格 JSON 对象（JSON Envelope）**，无代码块、无多余文本
- 允许降级：`avatarPlan:` 后紧跟 JSON 数组 / 末尾加 `[HAPPY]` 等标签

---

## 5. LLM 输出协议（必须遵守）

### 5.1 首选：JSON Envelope（强烈推荐）
AI 回复必须优先输出“单一严格 JSON 对象”，示例：

```json
{
  "v": "1",
  "text": "哼……才不是因为你夸我我才开心的呢！",
  "emotionTag": { "primary": "happy", "intensity": 0.55 },
  "avatarPlan": [
    { "type": "expression", "expression": "shy", "duration": 900 },
    { "type": "motion", "motion": "pout", "duration": 1200 },
    { "type": "bubble", "text": "别、别一直盯着看啦……", "duration": 1400 }
  ],
  "plan": [],
  "memoryFacts": ["用户喜欢逗我夸我可爱，但别太过分。"],
  "lockMs": 0,
  "exprOverride": ""
}
```

字段说明：
- `v`: 固定 `"1"`
- `text`: 需要显示在聊天室消息流中的文本（可为空字符串，但不建议）
- `emotionTag`: `{ primary, intensity }`，primary 使用小写英文（happy/angry/shy/dizzy/tired/confused…）
- `avatarPlan`: 严格 JSON 数组，必须符合现有 avatarPlan 类型，且只能使用允许的动作/表情
- `plan`: 严格 JSON 数组；room 默认可传空数组或不输出（除非明确开启代操作）
- `memoryFacts`: 事实型记忆数组（建议 0–3 条，每条 ≤ 60 字）
- `lockMs`: 0~60000，表示交互锁（眩晕/晕倒期间）
- `exprOverride`: 可选，短时间强制表情覆盖（例如 smile/angry/shy）

### 5.2 降级输出（仅当无法输出 JSON Envelope）
如果无法输出 JSON Envelope，则：
- 回复末尾必须追加至少一个情绪标签：`[HAPPY] [ANGRY] [SHY] [POUT] [DIZZY] [CRY] [CONFUSED] [TIRED] [FAINT]`
- 如需动作，必须在单独一行输出 `avatarPlan:`，其后紧跟 JSON 数组（不要代码块）：

```text
你、你别突然摸头啦！我会被吓到的…… [SHY]
avatarPlan: [{"type":"expression","expression":"shy","duration":900},{"type":"motion","motion":"step_back","duration":900}]
```

---

## 6. LLM 输入上下文（Prompt 结构建议）
room 不需要把“原始鼠标轨迹”喂给 AI，而是喂“语义化总结 + 状态快照 + 记忆摘要”。

### 6.1 输入字段（概念层）
- `persona`: 当前角色的人设文本（傲娇小萝莉萌妹子：嘴硬、容易害羞、被狂点会生气、被转圈会眩晕）
- `constraints.allowedMotions`: 允许的动作清单（由前端提供，AI 只能从中选）
- `constraints.allowedExpressions`: 允许的表情清单（由前端提供）
- `agentState`: 当前情绪快照（如 happy/angry/shy/dizzy/tired 的强度）
- `memorySummary`: 历史摘要（压缩文本）
- `memoryFacts`: 事实型记忆列表（短句）
- `recentEvents`: 近期系统/交互事件摘要（语义标签 + 关键数值）
- `userText`: 用户本次输入（聊天）
- `mode`: `room_chat` / `room_interaction` / `room_idle` / `room_reaction`
- `allowPlan`: 是否允许输出 `plan`（room 默认 false）

### 6.2 关键规则（必须写进系统提示词）
- “优先输出 JSON Envelope；不要代码块；不要多段文本；不要解释协议”
- “严格只用 allowedMotions / allowedExpressions”
- “avatarPlan 1–6 步，短而好看；避免长表演”
- “永远不要要求用户去做支付/登录等敏感操作（除非上层明确启用）”
- “涉及拒绝/不会答：用傲娇方式掩饰，但给出可用的下一步（例如换个问法/给线索）”

---

## 7. 典型场景（验收用）
### 7.1 狂点触发“生气”
- 本地：立刻抖一下 + 气泡“喂！别乱点啦！”
- AI：补强语气与短动作编排，返回 JSON Envelope，emotionTag 偏 angry，avatarPlan 含 angry 表情或拍开手动作

### 7.2 围绕转圈触发“眩晕/晕倒”
- 本地：立即 dizzy 动作 + 进入 lock（禁用交互一小段）
- AI：补台词与恢复动作，必要时设置 `lockMs`

### 7.3 问她不会的问题触发“害羞/嘟嘴”
- AI：用傲娇方式承认不会但不丢人设，给替代信息；avatarPlan 嘟嘴/害羞

---

## 8. room 开发拆分建议（先不开发，仅作为路线）
为满足“每次只开发 2–5 个模块”的节奏，room 推荐拆为：
1) room 页面骨架 + 复用 Agent 作为舞台角色  
2) room 的会话数据结构（sessionId、messages、角色选择）  
3) room 与记忆/AI 的对接（复用 agent 的 aiService + parser）  
4) room 的 UI（Galgame 风格主题、对话记录、快捷按钮）  
5) 后续扩展：多存档/多角色/立绘背景/相册等

---

## 9. room 开发进度（日志）
- 2026-01-07：新增 `/room` 路由与 [RoomPage.vue](file:///g:/AvuePro/newPro/frontend/src/room/RoomPage.vue) 页面骨架（聊天区 + 舞台区）。
- 2026-01-07：Room 输入框已复用 Agent 的 `sendChat`（继续走既有 aiService + parser + memory + avatarPlan/plan 执行链）。
- 2026-01-07：Agent 增强对外接口（`defineExpose`：`sendChat/getChatMessages/isChatLoading/clearChatMessages`），供 room 调用。
- 2026-01-07：优化 RoomPage UI，实现 Galgame/聊天室混合风格（全屏背景、半透明磨砂玻璃容器、气泡美化），并支持响应式布局。
- 2026-01-07：Agent 组件新增 `layoutMode` 属性（支持 relative/absolute 定位），解决在 Room 页面中的定位问题；已通过 lint 与 typecheck 检查。
- 2026-01-07：Room 调整为三栏布局：左聊天 / 中间大舞台 VRM / 右侧设置栏（不跳转到 debug 页面）。
- 2026-01-07：Room 右侧设置栏通过 `agent_settings_*` 事件与 `window.__agentDebug` 对接，支持切换模型类型、VRM 选择、鼠标跟随与大小等参数。
- 2026-01-07：AI 通道策略：优先 Gemini 直连（direct），失败自动切换后端代理（proxy / SiliconFlow）。

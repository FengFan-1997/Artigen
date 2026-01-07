# 交互式 Q 版 Agent 最新综合需求文档（含调试说明）

> 本文是对 `doc/read/agent` 与 `doc/read/doc2` 中所有现有文档的汇总与升级版说明，同时结合当前前端实现（`frontend/src/agent`）与调试页 `frontend/src/views/AgentDebug.vue` 的真实情况，给出：  
> 1）面向“小白也能看懂”的总体需求说明；  
> 2）当前项目已经做到的程度；  
> 3）未来需要优化与继续开发的方向；  
> 4）如何使用调试页面 `AgentDebug` 来排查问题、调参与导出反馈包。  
>
> 你只需要把这份文档当成 **“项目说明书 + 使用说明 + 开发路线图”** 来看即可。

---

## 更新记录

- 2026-01-05：将动作/表情的优先级仲裁从 Agent.vue 抽成可复用模块，便于后续扩展“动作驱动核心”（例如：多通道并行、打断策略、节奏层）。
- 2026-01-05：AvatarPlan 的表情请求统一走仲裁入口；动作仲裁新增 channel 参数（默认兼容），为后续“动作分层”做准备。
- 2026-01-06：修复引导高亮矩形的 requestAnimationFrame 循环未清理导致的潜在泄漏问题。
- 2026-01-06：补齐“漏洞/缺陷/缺失项”审查与 `frontend/src/agent` 项目问题清单；同步到 PRD 的交付缺口与验收项。
- 2026-01-06：加强 plan 执行安全与稳健性：阻断危险 selector（如 `*` / `:has(...)`）与敏感输入目标；补齐 localStorage 访问容错；通过 type-check/lint/build。
- 2026-01-06：升级 Live2D 工具点击事件为结构化事件（phase/ok/error/modelId），Agent 仅消费 start/error 防止重复触发。
- 2026-01-06：Live2D 工具栏注册改为幂等：重复初始化时移除旧按钮，避免重复 DOM/重复 handler。
- 2026-01-06：修复 VRM 动作播放期抽动：动作/程序化动作期间冻结注视目标（头/眼），避免与动画骨骼争用。
- 2026-01-06：升级 VRM 朝向锁定算法：使用最短角度阻尼收敛替代直接赋值；动作/程序化动作期间自动暂停朝向锁定避免争用。

## 一、整体目标：我要什么样的 Agent？

从所有历史文档来看，你真正想要的是：

- 页面左下角常驻一个 **Q 版二次元萌妹子 Agent**（VRM 或 Live2D）
- 这个 Agent：  
  - 会根据 **鼠标移动、点击、拖拽、绕圈** 等行为做出 **实时的动作和表情反应**；  
  - 会根据 **聊天内容** 做出傲娇、害羞、生气等 **性格化台词 + 动作**；  
  - 能根据你的指令去 **带你操作网页**（例如导航、填写表单、滚动页面等）；  
  - 会根据 **页面上 DOM/BOM 的变化** 做背景反应（例如接口报错、Toast 成功、页面跳转）；  
  - 会有 **记忆**，不会轻易忘记你是谁、你喜欢怎么逗她。

可以把她理解为：

- 不是简单的“聊天框”，而是：  
  - 有身体（VRM/Live2D）、  
  - 有情绪（傲娇萝莉）、  
  - 有记忆（本地 + 后端 memory）、  
  - 会“自己动”（idle 动作 + 任务 plan）、  
  - 会帮你“操作网站”的 **桌面小精灵 + AI 助理**。

为了实现这个目标，整体设计是：

- **本地快轨（Local Fast Track）**：  
  - 负责 0 延迟的视觉反馈（抖一下、眨眼、晕倒、气泡弹一句）。  
  - 用户一操作就立刻有反应，哪怕 AI 还没算完。  

- **AI 慢轨（AI Slow Track）**：  
  - 负责逻辑性强、组合复杂的行为（根据人设+语义事件决定下一步动作+台词）。  
  - 通过 `avatarPlan` 和 `plan` 这两套协议控制模型动作与网页操作。  

- **记忆分层（Memory）**：  
  - 短期：本地 LocalStorage + 前端压缩；  
  - 中期：后端 `backend/memory/*.json` 的 buffer；  
  - 长期：提炼成 Facts（事实类记忆），避免 token 爆炸。

下面按“需求 + 当前实现 + 后续要做”来一块一块说明。

---

## 二、角色与人设：VRM / Live2D 与人设文档的关系

### 2.1 现在的角色体系

- VRM 模型：
  - 由 `virtual:vrm-models` 虚拟模块统一管理（在 Vite 配置里生成）。
  - 会扫描类似 `/doc/modeDoc/modeldoc/genshin/**` 的人设文档，为每个模型生成一段 **人设文本**。
  - 这些人设文本通过 `vrmPersonaTextByModelName` 导出。

- 前端 `Agent.vue`：
  - 通过 `getPersonaText()` 读取当前 VRM 模型对应的人设文本。  
  - 在构建 `agentContext`（发送给 AI 的上下文）时，把人设文本放到 `persona.rules` 与相关字段中，作为提示词的一部分。

### 2.2 你对人设的要求

文档中的要求总结下来：

- 每一个 VRM 模型（例如“八重神子”）必须有：  
  - 名字（name）；  
  - 性格描述（傲娇、懒散、毒舌等）；  
  - 常用动作和表情说明；  
  - 说话口吻、称呼方式。  

- 给 AI 的提示词里必须包含：  
  - 当前角色是谁；  
  - 当前角色的人设 + 行为规范；  
  - 允许使用的动作列表、表情列表；  
  - 用户刚刚做了什么（鼠标/聊天/任务/页面事件）。

### 2.3 当前实现做到哪一步？

- 已经做到：
  - VRM 模型可以在 `Agent.vue` 里切换；  
  - 每个模型会通过虚拟模块拿到对应的人设文本；  
  - 这些人设信息会被拼进 AI 的系统提示词里（`aiService.ts` 中的 `buildDirectSystemPrompt`）。  

- 还没完全做到但已有基础：
  - “根据用户性格来生成动作/语音/表情”这部分，目前主要还是根据 **单次交互 + 人设** 来决定反应，真正的“判断用户性格 + 长期偏好”还在路上，但已经有：  
    - 本地记忆 `useLocalMemory`；  
    - 后端 memory JSON；  
    - `memoryFacts`（事实型记忆）机制。

### 2.4 后续要做

- 把人设文档结构化：  
  - 明确字段：`name` / `persona` / `speechStyle` / `triggers` / `idleBehaviors` 等。  
  - 让 AI 提示词可以更精准地用到这些结构，而不是粗暴拼接文本。

- 加入“用户画像”：  
  - 在记忆层为每个用户维护简单的标签：`喜欢欺负我`、`总是问技术问题`、`胆小` 等。  
  - 提供给 AI，用来决定 Reply 的语气和动作强度。

---

## 三、交互与情绪：如何让她“被逗会生气、转圈会晕倒”

### 3.1 用户交互采样与语义化

相关文件：  
- [semanticEvents.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/semanticEvents.ts)  
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)

现在的流程：

- 在 `Agent.vue` 中，鼠标移动、点击等行为会被记录成一串 `InteractionSample`：  
  - 每个样本包含：时间戳、屏幕坐标、速度、相对位置、命中的 Hit 区域等。  

- `buildInteractionMetrics` 会把一整段交互汇总为：  
  - 总时长（durationMs）、点击次数（clickCount）、绕圈角度（spinDegrees）、最大/平均速度、主要命中区域等。  

- `buildSemanticInteractionContext` 会进一步把这些信息翻译成 **语义标签**：  
  - `USER_MAKING_ME_DIZZY`（用户在绕圈）；  
  - `USER_RAPID_TAPS`（用户在狂点）；  
  - `USER_STROKES_CHEEK`（摸脸）；  
  - `USER_STARING_EYES`（盯着眼睛看）；  
  - `USER_TOUCHES_ACCESSORY`（动饰品）等。

- `buildInteractionSummary` 会把这段交互总结成一段短文本，作为系统事件，后面可以发给 AI。

这就是文档里说的“**语义化事件流**”：  
不再直接把 `(x, y)` 坐标发给 AI，而是发“用户在 3 秒内绕圈 400° 并狂点 8 次，主要命中区域是眼睛和发卡”这样的描述，让 AI 更好理解“你在逗她”。

### 3.2 本地快轨反应

在 `Agent.vue` 中，已经有一套本地状态：

- `isDizzy`、`isAngry`、`isHappy`、`isShy`（部分通过 `isPouting`）、`isFainted` 等布尔状态；  
- `energy` / `tiredThreshold` 等数值，用来控制疲劳度；  
- 根据这些状态，Live2D / VRM 会切换不同的表情和动作（通过 `motionCommand`、`expressionOverride` 等传给子组件）。

本地会做的事情包括：

- 快速点击过多 → 立刻触发“生气/抖动”类动作；  
- 围绕绕圈角度过大 → 立刻触发“眩晕/晕倒”；  
- 长时间 idle → 本地触发一些小动作或让 AI 生成 idle `avatarPlan`。

### 3.3 AI 慢轨反应

当一次交互结束，如果判断为“值得让 AI 参与”（`shouldAskAiForInteraction` 返回 true），则：

- 会把交互总结文本 + 语义标签 + 人设 + 近期记忆一起发给 AI；  
- AI 根据这些信息，返回：  
  - 文本回复（气泡里显示）；  
  - `avatarPlan`：一串动作/表情/移动/气泡的 JSON 脚本。

`avatarPlan` 的定义见：  
- [avatarPlan 类型](file:///g:/AvuePro/newPro/frontend/src/agent/types/avatarPlan.ts)  
- [avatarPlan 执行器 useAvatarPlanRunner.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useAvatarPlanRunner.ts)

AI 可以返回诸如：

```json
avatarPlan: [
  { "type": "expression", "expression": "angry", "duration": 1200 },
  { "type": "speak", "text": "喂！你刚才乱摸哪里呢！变态！", "motion": "shake_head", "expression": "shy" }
]
```

前端会：

- 先播放 `expression`；  
- 再在气泡里显示文字、播放说话动作；  
- 再根据情况恢复默认状态。

### 3.4 当前实现程度（和你的期望对比）

- 已经具备：  
  - 语义化事件流（把复杂鼠标行为翻译成标签）；  
  - 本地快轨反馈（点击、绕圈等会立即影响状态）；  
  - `avatarPlan` 协议（AI 控制动作的一整套 JSON 方案）；  
  - 底层执行器 `useAvatarPlanRunner`（可以把 plan 变成真实动作）。  

- 仍需继续加强：  
  - 更细的“情绪数值引擎”（anger/shy/happy/tired 的累加与衰减）；  
  - 不同模型的人设和动作库的差异化；  
  - 对“特殊行为”（比如只摸发卡）的专门台词与记忆。

### 3.5 数值情绪引擎与 VRM 表现层（当前设计）

相关文件：  
- [emotionEngine.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/emotionEngine.ts)  
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)  
- [VrmWidget.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/VrmWidget.vue)

当前已经落地了一套“数值情绪 → VRM 表达层”的完整通路，可以理解为：

1. **底层情绪向量 EmotionVector**（持续数值）：  
   - 维度：`valence`（愉悦度，-1~1）、`arousal`（激活度）、`trust`、`shyness`、`annoyance`、`fatigue`、`dizziness`、`curiosity`。  
   - 来源：  
     - 人设基线：由 `PersonaTraits`（傲娇/害羞/严肃/懒散…）通过 `computeBaseline` 映射出“默认性格曲线”；  
     - 实时状态：说话、hover、移动中、执行任务、晕倒等，通过 `applyRealtimeState` 在每帧微调；  
     - 交互 Session：一次鼠标逗弄的整体数据（点击次数、绕圈角度、停留时长等），通过 `applyInteractionSession` 注入；  
     - 命中区域：头发/脸/身体/腿等，通过 `applyHitAreas` 精准影响害羞、愤怒和信任；  
     - 文本内容：聊天中的夸奖/调戏/道歉/提问，通过 `applyChatText` 解析关键词后改变情绪；  
     - AI 情绪标签：AI 回复中的 `[HAPPY]` / `[ANGRY]` 等，通过 `applyEmotionTag` 作为“高层建议”。  
   - 时间维度：所有数值通过 `tick(dtMs)` 中的指数衰减（`expApproach`）缓慢回归“人设基线”，保证：  
     - 不会因为一次操作就“永远生气”；  
     - 情绪变化有惯性和余韵，而不是瞬间跳变。

2. **派生情绪 EmotionDerived**（用于驱动表情）：  
   - 由上述向量通过 `derive()` 计算出 `happy / angry / pouting / confused / tired / dizzy` 六个 0~1 的强度；  
   - 本质上是一个“情绪解码器”：将多维数值压缩成 VRM 易于消费的几类主观感受；  
   - 例如：  
     - `happy` 综合了愉悦度、信任度和低愤怒；  
     - `angry` 综合了愤怒、负愉悦和高激活；  
     - `pouting` 混合了害羞、愤怒与低信任；  
     - `tired` 与疲劳和低激活相关联。  

3. **VRM 表现层：表情 + 动作的最终映射**：  
   - 在 `Agent.vue` 中，`emotionEngine.snapshot` 会作为 `emotion-snapshot` 属性下发给 `VrmWidget`；  
   - `VrmWidget.vue` 在内部计算时，会读取：  
     - 从引擎来的派生情绪强度（`props.emotionSnapshot.d.*`）；  
     - 本地布尔状态（`isHappy/isAngry/isShy/isDizzy` 等）；  
     - 微小抖动/呼吸等局部随机项（micro jitter）；  
   - 然后按权重混合，映射到具体 VRM 表情通道（blendshape）：  
     - 情绪引擎给出的是“长期趋势”和“强度上限”；  
     - 本地布尔状态负责“是否立刻触发”；  
     - 随机抖动补足“生命力”和非完全确定性。

4. **微动作推荐：Idle 时也要“像个活人”**：  
   - 引擎提供 `recommendMicroReaction`：在空闲一段时间后，根据当前情绪向量推荐轻量级动作与表情；  
   - 例如：困了打哈欠、烦躁搓手、害羞摸脸、好奇张望等；  
   - `Agent.vue` 可将其转换为短 `avatarPlan` 段落（纯本地快轨），无需走 AI。

这套情绪引擎的意义在于：  
- 把“被逗、生气、累、晕、好奇”变成可积累、可衰减、可调参的数值系统；  
- 把 VRM 的表情/动作从“简单状态机”升级为“被数值情绪驱动的表现层”；  
- 为后续“记忆驱动情绪”、“跨会话心情保持”和“多 Agent 差异化性格”打好基础。

---

## 四、智能对话与任务执行：聊天、任务 plan 与 DOM 反应

### 4.1 聊天与 AI 协议

相关文件：  
- [Agent.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)  
- [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)  
- [aiReplyParser.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/aiReplyParser.ts)

流程概览：

1. `ChatWindow.vue` 中用户输入消息。  
2. `Agent.vue:handleSendMessage` 收到消息，构建 `agentContext`：  
   - 当前角色、人设；  
   - 当前语言（中/英）；  
   - 当前模型类型（VRM/Live2D）；  
   - 记忆摘要与 Facts；  
   - 最近聊天与事件。  
3. 调用 `sendMessageToAI`（在 `aiService.ts` 中），根据配置选择：  
   - 走后端 `/api/chat` 代理（默认 proxy 模式）；  
   - 或直接走 Gemini API（`direct` 模式）。  
   - 走后端 proxy 时，会额外携带 `projectKnowledge`（站点知识与操作手册），供后端决定是否注入到提示词（并驱动 RAG/引导）。  
4. AI 回复一段原始文本，里面可以包含：  
   - 正常的回复语句；  
   - `avatarPlan:` 后的一段 JSON；  
   - 可选的 `plan:`（用于网页任务）；  
   - 情绪标签 `[HAPPY]`、`[ANGRY]` 等。
5. `aiReplyParser` 负责把这段原始文本解析成结构化结果，交给：  
   - `useTaskExecutor`（执行网页任务）；  
   - `useAvatarPlanRunner`（执行模型动作）；  
   - 聊天 UI 显示文字；  
   - 记忆模块存储摘要和 Facts。

你在文档里要求的“**统一协议**”（回复文本 + avatarPlan + plan + tags）现在已经基本成形，只是需要持续收紧规范（让 AI 输出更稳定）。

### 4.2 任务执行：网页操作 plan

相关文件：  
- [useTaskExecutor.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts)  
- [task.ts 类型定义](file:///g:/AvuePro/newPro/frontend/src/agent/types/task.ts)  
- [TaskDisplay.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/TaskDisplay.vue)

职责：

- 接收 AI 返回的 `plan`（一步步的 `navigate/click/input/scroll/...`）  
- 在浏览器里模拟执行：导航、点击、输入、滚动等。  
- 为每一步生成 `description`，显示在 `TaskDisplay` 组件中。  
- 把执行状态持久化到 LocalStorage，支持页面刷新后的恢复。

实现细节：

- 支持的 step 类型：
  - `navigate`：使用 `vue-router` 或 `window.location.href` 跳转页面；  
  - `click`：等待目标 DOM 元素出现后滚动到视野内并触发 `.click()`；  
  - `input`：找到输入框，填入文本并触发 `input/change` 事件；  
  - `hover`：触发 `mouseover/mouseenter`；  
  - `press`：模拟键盘按键（Enter 等）；  
  - `scroll`：向上/下/顶部/底部滚动，或滚动到指定元素；  
  - `highlight`：给元素加上高亮 CSS 类 `agent-highlight-target`；  
  - `wait`：简单等待指定时间。

- 状态管理：  
  - `plan.status`：`pending` / `running` / `completed` / `failed`；  
  - 每个 step 也有自己的 status。  
  - 执行失败时，会标记失败并停止。

这正是你在文档里提到的“**让 Agent 带我演示营养配料表生成**”的基础：  
AI 会返回一个 `plan`，例如：

```json
plan: [
  { "type": "navigate", "target": "/nutrition" },
  { "type": "input", "target": "#recipe-name", "value": "番茄鸡蛋面" },
  { "type": "click", "target": "#generate-btn" },
  { "type": "wait", "value": "3000" },
  { "type": "highlight", "target": ".result-card" }
]
```

`useTaskExecutor` 会根据这个 plan 真正在页面上执行上述步骤。

### 4.3 任务续航（Task Continue）

相关行为在 `Agent.vue` 中：

- `taskSession` 持久化了：
  - `active`：是否处于任务模式；  
  - `goal`：任务目标；  
  - `autoContinueCount` / `lastContinueAt`：续航次数和节流。  

- 当 `plan.status` 变成：  
  - `completed` → 会延迟调用 `requestNextTaskChunk('completed')`；  
  - `failed` → 会延迟调用 `requestNextTaskChunk('failed')`。  

- 在路由变化、页面刷新时，如果检测到有活跃任务但没有正在执行的 plan，会自动请求下一段任务。

这些逻辑基本实现了你希望的：“任务是一个长流程，Agent 一段一段往前推进，而不是一次性给出所有步骤”。

### 4.4 DOM / BOM 页面变化反应

相关文件：  
- [Agent.vue 中的 DOM 观察与 system events](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue)  
- [systemSignals.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/systemSignals.ts)  
- [useBackgroundReactions.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useBackgroundReactions.ts)

逻辑要点：

- 使用 `MutationObserver` 观察页面 DOM：  
  - 新增节点、文本变更、属性变化；  
  - 优先关注 `role="alert"`、`aria-live`、Toast/Notification 容器等。  

- 当检测到页面有：  
  - 错误提示（error/失败/exception/500 等）；  
  - 成功提示（success/完成/已生成等）；  
  - 页面跳转；  
  - 重要 UI 变化；  
  会将这些事件归类成 **系统事件**，进入后台反应队列。

- 后台反应队列会调用 `requestAgentReaction`：  
  - 这本质上是一次“背景 AI 调用”（`kind: 'reaction'`）；  
  - 强制要求 AI 输出轻量的 `avatarPlan` 脚本，让模型做出对应反应（例如任务成功后高兴一下）。  

这些反应不会写入长期记忆，只是“路过一下”的旁白/动作，避免记忆被噪声淹没。

---

## 五、记忆系统：如何在不爆 token 的前提下“记住你”

相关文件：  
- [useLocalMemory.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useLocalMemory.ts)  
- 后端：`backend/memory/*.json`（存储在本地文件）。

### 5.1 本地记忆

- 本地以 `LocalMemoryItem` 数组形式存储：  
  - 每条记录包含 `role`（user/agent/system）、`text`、时间戳、可选类型。  

- 压缩机制：  
  - 当条目超过阈值（`LOCAL_MEMORY_COMPRESS_THRESHOLD`）时，把旧的部分压缩成一段文本摘要；  
  - 摘要写入 `memorySummary`；  
  - 只保留最新一部分原始条目。  

- Facts（长期事实）：  
  - 通过 `addMemoryFact` 将“你最喜欢干的事情”等，提炼成短句；  
  - 存到 `memoryFacts`（最长 60 条）。  
  - AI 也可以在回复中显式输出 `memoryFacts:`（严格 JSON 字符串数组），前端解析后写入 `memoryFacts`（任务/后台 reaction 等 `suppressMemorySave` 场景会跳过写入）。  

### 5.2 向后端同步

`useLocalMemory` 中有一个 `pendingToIngest` 队列：

- 写入本地记忆时，顺便把该条加入队列；  
- 使用 `scheduleIdleTask` 在浏览器空闲时发送到 `/api/memory/ingest`；  
- 后端在 `backend/memory/*.json` 中以用户维度存储。

### 5.3 发给 AI 时如何使用

在 `aiService.ts` 的 `buildDirectSystemPrompt` 中：

- 会采集：  
  - `memory.summary`：摘要；  
  - `memory.facts`：事实列表（裁剪为简短 bullet）；  
  - `recentChat` / `recentEvents`；  

- 将这些内容拼成一个“记忆块”，作为系统提示的一部分。  
- 用这种方式解决你担心的“对话越来越长，token 会爆炸”的问题：  
  - 旧内容被压缩成概要；  
  - 重要事实单独存放；  
  - 每次请求只带最近一部分上下文 + 事实摘要。

---

## 六、模型与资源加载：VRM / Live2D 加载优化与国内镜像

相关文件：  
- [VrmWidget.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/VrmWidget.vue)  
- [Live2DWidget.vue](file:///g:/AvuePro/newPro/frontend/src/agent/components/Live2DWidget.vue)  
- [useVrmModels.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useVrmModels.ts)  
- 后端：`backend/server.js` 中的 HF 代理路由。

### 6.1 HuggingFace 镜像与国内访问

你在文档中要求：

- 模型文件大且在 HuggingFace 上；  
- 部署在 Zeabur，国内访问 HuggingFace 很慢甚至失败；  
- 希望通过国内镜像（如清华、hf-mirror）加速。

当前后端已经：

- 提供 `/api/hf/:owner/:repo/resolve/:ref/*` 路由，将 HuggingFace 资源代理出来；  
- 使用 `HF_RESOLVE_BASES` 和 `HF_API_BASES` 环境变量，默认包括 `https://hf-mirror.com` 和 `https://huggingface.co`；  
- 可以通过 Zeabur 环境变量配置镜像优先级，实现“哪个快用哪个”。

前端侧：

- VRM：`useVrmModels.ts` 会把模型路径改写为 `/api/hf/...` 形式；  
- Live2D：`Live2DWidget.vue` 也会把资源 base 替换为后端代理路由。

### 6.2 按需加载而不是全量加载

你的要求中明确提出：

- 不能“一打开页面就把所有模型都加载完”；  
- 正确逻辑应该是：  
  1）首次只加载默认 VRM 模型；  
  2）再按需加载默认 cubism3、cubism2；  
  3）用户切换到哪个模型，才加载对应模型。

当前实现已经朝这个方向调整：

- `useVrmModels` 会维护远程模型列表和当前模型索引；  
- `Agent.vue` 使用 `currentVrmSrc`，只有当你选择某个模型时才去加载对应资源；  
- Live2D 也按需初始化。

### 6.3 VRM 观感问题（抽动、下半身截断、视角控制按钮）

问题总结：

- VRM 模型偶尔“莫名抽动”；  
- 模型下半身被裁掉；  
- 控制按钮逻辑：  
  - 关闭时不能用鼠标自由旋转视角，但眼神、微动仍要跟随鼠标；  
  - 开启时才允许鼠标大幅度控制视角；  
  - Agent 驱动的动作不受这个按钮影响。

当前：

- `VrmWidget.vue` 中负责 VRM 渲染、fitToView、look-at 等；  
- `Agent.vue` 中通过 `vrmMouseControlEnabled` 控制是否允许鼠标控制视角；  
- 视角锁定（任务执行时）；  
- 观感优化和截断问题在路线图中列为后续重点（阶段 D）。

---

## 七、当前整体实现进度概览

结合 `module_refinement_phase19_future_roadmap_20251230.md`，当前进度可以粗略总结为：

- **已经具备的能力**：
  - Agent 组件结构化良好：  
    - `Agent.vue` 作为编排中心；  
    - VRM / Live2D 子组件分离；  
    - `useTaskExecutor`、`useAvatarPlanRunner`、`useLocalMemory`、`useBackgroundReactions` 等功能模块化。  
  - 语义化交互与本地快轨逻辑：  
    - 鼠标行为 → 语义标签 → 决定是否调用 AI。  
  - AI 协议与调度：  
    - 支持 `avatarPlan` + `plan` + 情绪标签；  
    - AI 请求支持优先级、去重、取消、缓存（`aiService.ts`）。  
  - 记忆系统基础：  
    - 本地记忆压缩 + 摘要 + Facts；  
    - 后端 memory 文件同步机制。  
  - DOM/BOM 背景反应：  
    - MutationObserver 监控页面变化；  
    - 基于系统事件的 Reaction 调用。  
  - VRM / Live2D 加载与国内镜像方案：  
    - 后端 HF 代理、多镜像支持；  
    - 前端按需加载逻辑正在使用。

- **基本可用但需要持续打磨的部分**：
  - 情绪引擎（数值化）：怒气/害羞/疲惫等的累加与衰减；  
  - RAG（站内知识问答）：目前有基础，但还未完全闭环；  
  - 网页操作任务的鲁棒性：选择器丢失、自我修复策略等；  
  - VRM 观感问题（抽动、下半身截断）；  
  - API 地址统一与配置项文档化。

---

## 八、未来需要优化与继续开发的重点

整理成几个阶段，方便你一段一段做（每次 2–5 个模块）。

### 8.1 P0：稳定性与部署一致性

- 统一 API baseUrl：  
  - 所有接口地址（包括用户、记忆、聊天）都通过 `buildApiUrl` 和配置好的 `VITE_AGENT_API_BASE`。  
  - 删除硬编码 `http://localhost:8080/...` 之类的写法。  

- AI 请求调度器收紧规则：  
  - 优先级从高到低：任务续航 > 聊天 > DOM 背景反应 > 交互补强 > Idle；  
  - 避免低优先级请求打断高优先级，或造成 AI flood。  

- 记忆增长控制：  
  - 明确何时压缩、何时向后端写入；  
  - 加一个后台任务将 `short_term_buffer` 定期总结成 `core_memory`。  

### 8.2 P1：情绪引擎与“活感”

- 建立数值化情绪模型：  
  - 如 anger/shy/happy/tired 等；  
  - 每次事件（交互、任务成功/失败、DOM 提示）改变情绪值；  
  - 情绪随时间衰减。  

- 本地快轨动作库：  
  - 为常见情绪和事件配置固定的小动作和气泡模板；  
  - AI 只是补充更长的台词和复杂动作。

### 8.3 P1：VRM 稳定性与观感

- 抽动原因排查：  
  - look-at 与 idle 动画的叠加；  
  - 动作混合器的冲突；  
  - 帧率不稳定导致的抖动。  

- 下半身截断修复：  
  - 调整 camera near/far；  
  - 调整 `fitToView` 逻辑和模型 scale/position。  

- 视角控制按钮与 Agent 控制分离：  
  - 进一步确保关闭“鼠标视角控制”只影响相机旋转，不影响眼神跟随和 Agent 自己的动作。

### 8.4 P2：RAG 与站内知识问答

- 针对 `doc/read/docs` 和关键页面内容：  
  - 分块 + embedding → 向量索引；  
  - 问题触发时检索相关片段，把结果注入到 AI 提示词；  
  - 加入可观测性（知道本次回答用到了哪些文档）。

### 8.5 P2：网页操作引导的鲁棒性

- 选择器策略优化：  
  - `#id` > `data-*` > 稳定 class 名 > 文本匹配；  
  - AI 给多个备选 selector，前端做 fallback。  

- 引导 UI 标准化：  
  - 高亮、小箭头、连接线、提示气泡统一风格，用户一眼能看懂。  

- 执行失败的归因：  
  - 当某一步 `click`/`input` 找不到目标元素时，向 AI 返回错误信息，让其生成新的 plan，而不是直接失败结束。

### 8.6 P2：动作系统与“计划行为”本地化（让她更像一个会自己动的角色）

目标：把 Agent 从“被动触发动作”升级为“持续决策的角色”，让动作不是随机播放，而是由情绪、上下文和任务状态共同决定。

#### 8.6.1 当前已落地（以稳定为前提）

- 动作/表情仲裁（避免互相打架）：  
  - 引入优先级仲裁：`avatarPlan > user > ai > system > micro > idle`；  
  - 同一时间窗内只允许更高优先级抢占；并支持最小“锁交互”窗口避免抽动。  
  - 代码位置：  
    - [Agent.vue:MOTION_PRIORITY + requestMotion](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L1695-L1756)  
    - [Agent.vue:requestExpression](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L1805-L1831)

- `avatarPlan` 动作编排“自动复杂化”（序列 + 节奏）：  
  - AI 输出依然是短 plan（1–6 步），但前端执行时会把单个动作扩展成更自然的“起手/主动作/收尾”序列，并把 `duration` 拆成节奏段，减少“播一下就停”的僵硬感。  
  - 适用范围：`motion / pose / speak`；`expression` 仍保持强制时长以确保一致性。  
  - 代码位置：  
    - [Agent.vue:buildMotionSequence + runStyledPlanMotion](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L2169-L2417)

- 任务执行过程“拟人反馈”（像人在操作）：  
  - `useTaskExecutor` 增加可选事件回调（不改原有行为），把 `plan_start / step_start / step_retry / step_done / step_failed / plan_done / plan_failed` 抛给 Agent；  
  - Agent 侧做节流聚合，按 personaTraits 选择轻量表情/动作/短气泡，避免刷屏与打断聊天。  
  - 代码位置：  
    - [useTaskExecutor.ts:TaskExecutorEvent](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts#L173-L193)  
    - [Agent.vue:flushTaskEvents](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L1425-L1560)

- 网页 plan 的鲁棒性增强（为商用稳定打底）：  
  - selector 解析 fallback（CSS → 文本/XPath）；  
  - step 执行带重试与指数回退；失败会产出结构化 failureContext 便于可观测与后续修复。  
  - 代码位置：  
    - [dom.ts:resolveTarget](file:///g:/AvuePro/newPro/frontend/src/agent/utils/dom.ts)  
    - [useTaskExecutor.ts:executeStepWithRetry](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts#L555-L617)

#### 8.6.2 下一步（算法深挖与可调参化）

这里的重点不是“写更多 if-else”，而是把“活感”工程化：可解释、可控随机、可观测、可调参。

- 动作资源标准化（动作库）：  
  - 为 VRM 建立“动作能力表”（类似技能表）：每个 motion 具备 `语义标签/强度/耗能/冷却/适用情绪区间/可打断性` 等元数据；  
  - AI 的 `avatarPlan` 只需要引用语义动作（如 `idle_shy_fidget`），由前端根据模型差异映射到具体 motion 名称。

- 行为选择器（Behavior Policy）：  
  - 输入：语义事件流（交互/DOM/任务）、数值情绪快照、时间特征（idle 时长）、记忆 Facts（用户偏好）、当前执行栈（是否正在说话/任务/动画锁定）；  
  - 输出：下一段“短行为片段”（一段轻量 `avatarPlan` 或本地动作指令）；  
  - 推荐路线：Utility/打分式决策（可解释、易调参），而不是硬编码大量 if-else：  
    - 为每个候选行为计算 score（匹配度、情绪驱动、能量、冷却、场景约束）  
    - 选择 top1 或按 softmax 抽样，保持“可控随机”。

- 行为编排（Behavior Sequencer）：  
  - 引入“短期意图”与“行为锁”：  
    - 意图：例如 `安抚用户/吐槽/撒娇/认真解释`，持续 3–10 秒；  
    - 锁：避免表情/动作在 200ms 内反复跳变；  
  - 与现有本地快轨/AI 慢轨共存：  
    - 本地快轨抢占（例如眩晕/受击/被狂点）；  
    - 慢轨负责更长的台词和复杂组合动作；  
    - 本地逻辑负责“落地执行”和连续性。

- 可观测与调参：  
  - 在 `AgentDebug` 中展示“当前情绪向量、行为候选得分、最终选择原因”，让“活感”变成可量化可调的工程问题。

### 8.7 P3：任务与网页 Plan 的“可执行性提升”（从脚本执行到具备自我修复）

目标：让 `plan` 不只是“照做”，而是具备最小闭环：能确认结果、失败能自救、能向 AI 回传关键信息。

- 观测与断言（Observation / Assertion）：  
  - 在 step 里支持可选的 `expect`（例如：出现某个文案/某个卡片/某个按钮变为 disabled）；  
  - 执行后进行检查，成功才进入下一步，否则进入修复流程。

- 自我修复（Plan Repair）：  
  - 当 selector 失效时：  
    - 前端收集候选 DOM 片段（压缩后的结构、可见文本、附近 label、候选 selector 列表）；  
    - 作为错误上下文回传给 AI，让 AI 生成“修复版 plan”；  
  - 当页面状态不符合预期时：  
    - 把“当前页面关键状态摘要”反馈给 AI（例如弹窗遮挡、登录过期、网络错误 toast）。

- 安全边界：  
  - 为高风险操作（提交、删除、支付、下载）设置前端硬约束：必须二次确认或显式 allowlist；  
  - 记录每一步的可追溯日志，便于复盘。

### 8.8 面试/答题方向：如何解释“动作、计划行为、逻辑”三件事

- 动作（表现层）：用数值情绪驱动表情/微动作，强调连续性、衰减、可调参、可观测。  
- 计划行为（决策层）：用 Utility-based 行为选择器，把“随机 idle”变成“基于上下文的选择”。  
- 逻辑（执行层）：把 `avatarPlan` 与 `plan` 视为两个执行器，重点做可执行性、优先级仲裁、失败自愈与可追踪。

---

## 九、调试页面 AgentDebug 的使用说明

文件位置：  
- [AgentDebug.vue](file:///g:/AvuePro/newPro/frontend/src/views/AgentDebug.vue)  
- 与 Agent 的连接点在 [Agent.vue 的 window.__agentDebug 暴露处](file:///g:/AvuePro/newPro/frontend/src/agent/components/Agent.vue#L3899-L4173)

### 9.1 打开方式

- 在前端项目中访问路由：`/agent-debug`（具体路径以路由配置为准，一般在侧边菜单或直接手动改地址）。  
- 打开调试页时，会在右下角固定渲染一个 `Agent`（`<Agent class="pinned-agent" :is-pinned="true" />`），方便你同时看到 Agent 状态和调试数据。

### 9.2 顶部区域

- 标题：`Agent Debug`  
- 右侧按钮：  
  - “返回首页”：路由跳转到 `/`；  
  - “导出反馈包”：导出当前完整调试数据 JSON；  
  - “手动刷新”：强制从 `window.__agentDebug` 拉取最新快照和诊断信息。

### 9.3 连接状态面板

这个面板主要看 `window.__agentDebug` 是否可用：

- `window.__agentDebug` 状态：  
  - “已连接”：说明当前页面上已经渲染了 `Agent.vue`，且 `onMounted` 已经跑完；  
  - “未连接”：你需要先打开有 Agent 的页面（或者确保页面底部有 `<Agent />`）。  

- “采集状态”：  
  - 显示诊断事件是否在收集（`captureEnabled`）；  
  - 通过“开启/关闭采集”按钮调用 `setDiagnosticsEnabled`。  

- “info 日志”开关：  
  - 控制是否记录 `console.log/info`；  
  - 关掉可以减小噪声，只保留 warn/error。  

- 下方还会显示当前路由、时间戳等信息。

### 9.4 反馈包预览面板

这里可以看到：

- 最近采集到的事件数（events）、日志数（logs）、AI 请求数等；  
- 导出的 JSON 大约会有多少字节（approxBytes）；  
- 最近一次 error / AI error 的简要信息。  

你可以在“原因/场景”输入框中写上：  

- 例如：“VRM 抽动/卡顿/接口报错”等；  

然后点击“导出”，会下载一个 `agent_feedback_时间戳.json` 文件，里面包含：  

- Agent 快照（状态、位置、情绪、参数…）；  
- AI 服务状态（当前配置、请求记录…）；  
- 诊断日志（错误、AI 调用、事件流）。  

这份 JSON 可以发送给开发者，帮助快速定位问题。

### 9.5 参数面板：调参区

这一块是最常用的“调参区”，可以实时改 Agent 的行为参数：

- 示例参数：  
  - 漫游开关（`roamEnabled`）；  
  - 闲置动作开关（`idleTalkEnabled`）；  
  - Idle AI 开关（`idleAiEnabled`）；  
  - 漫游间隔（`moveIntervalMs`）；  
  - 闲置动作间隔（`idleTalkIntervalMs`）；  
  - 鼠标跟随平滑度（`lerpFactor`）；  
  - 鼠标偏移（`mouseFollowOffsetX/Y`）；  
  - Chat 自动关闭时间（`chatAutoCloseMs`）；  
  - UI 最大消息数（`maxUiMessages`）；  
  - 动态缩放（`dynamicScale`）；  
  - 移动过渡时间（`moveTransitionMs`）；  
  - 能量相关参数（maxEnergy / decay / recover / tiredThreshold）；  
  - Idle AI 的最小闲置时间、冷却时间与触发概率等。

使用方法：

1. 修改输入框中的数值或勾选框；  
2. 点击右侧“应用”按钮；  
3. 调试页会通过 `window.__agentDebug.setParam(key, value)` 把参数同步给 `Agent.vue`；  
4. `Agent.vue` 会更新对应的 ref，并写入 LocalStorage，下次刷新仍然生效。  

这部分非常适合：

- 调整“跟随速度/灵敏度”（让 Agent 更稳或更灵动）；  
- 调整 idle 的频率和行为节奏；  
- 调整能量衰减，让她不要那么容易累/或者更容易累。

### 9.6 AI 调用状态面板

显示 `aiService` 的状态：

- 当前使用的传输方式（proxy/direct）；  
- AI 请求的统计信息等。  

你可以在这里通过下拉框手动覆盖 transport：  

- 选择 `proxy`：所有请求走后端 `/api/chat`；  
- 选择 `direct`：直接走 Gemini；  

点击“应用”后，`setAiTransportOverride` 会把选择写入 LocalStorage。

### 9.7 AI Reply 测试面板

这是一个非常重要的调试工具，用来**在不调用真实 AI 的前提下**验证：

- `aiReplyParser` 是否能正确解析各种格式；  
- `avatarPlan` 执行器是否能正常工作。  

使用步骤：

1. 点击上方按钮填充不同类型的 mock：  
   - “缺失 avatarPlan”：只有文字没有动作；  
   - “avatarPlan 非法 JSON”：带有语法错误的 JSON；  
   - “avatarPlan 多行”：标签与 JSON 分行；  
   - “Envelope(JSON)”：完整的 JSON envelope。  
2. 文本框中会出现模拟的 AI 回复。  
3. 点击“解析” → 调用 `window.__agentDebug.parseAiReply`，在下方 `mockParseResult` 区域显示解析结果。  
4. 如果确认解析逻辑正常，可以点击“应用到 Agent”：  
   - 调用 `window.__agentDebug.applyAiReply`，让 Agent 执行其中的 `avatarPlan` 等；  
   - 不会写入记忆（`suppressMemorySave: true`）；  
   - 也不会在聊天框中追加消息（`displayInChat: false`）。

这套流程可以用来：

- 检查“你的提示词+AI 模型”是否稳定输出合法 JSON；  
- 调整 `aiReplyParser` 的鲁棒性；  
- 验证 `avatarPlan` 的动作组合是否符合预期。

### 9.8 操作面板

这里提供了一些快捷操作：

- 切换/打开/关闭聊天；  
- 取消所有 AI 请求（`cancelAiRequests`）；  
- 手动触发任务下一步 `taskNext` 或停止任务 `taskStop`；  
- 重新加载本地记忆；  
- 清空本地记忆（会删除当前用户相关的 LocalStorage 记录）。

非常适合在测试任务续航、记忆逻辑时使用。

### 9.9 数据视图、诊断、事件流、快照面板

这些面板以 JSON 形式展示各种内部状态：

- 性能（FPS、帧时间、内存占用）；  
- 最近聊天列表（可过滤与限制条数）；  
- 当前任务计划（Task plan）；  
- 记忆 Facts 与本地记忆的最近条目；  
- 错误/警告日志与 AI 请求记录；  
- 最近事件流（可按 level、关键字过滤）；  
- 完整快照与概要快照（summaryView）。

这些信息主要用于定位复杂 bug（例如：某次 AI 请求没有返回、某个计划中断、某个参数被错误修改等）。

### 9.10 自动刷新与手动刷新

- 调试页会自动轮询 `window.__agentDebug.getSnapshot` 与 `getDiagnosticsSnapshot`：  
  - 自动刷新开关在“诊断与反馈”区域；  
  - 刷新间隔可调，范围约 120ms–60s。  

如果觉得太频繁，可以关闭自动刷新，手动点击“立即刷新”。

---

## 十、给“小白”的一句话总结

- 如果你只是“使用者”：  
  - 记住：Agent 是一个会动的聊天小精灵，她会根据你的 **聊天 + 鼠标 + 页面变化** 做出各种表情和动作；  
  - 你可以在调试页里调整她的“性格参数”（懒不懒、动不动、反应快不快）。  

- 如果你是“开发者”：  
  - 记住三个关键词：  
    1）**avatarPlan**：控制模型怎么动；  
    2）**plan**：控制网页怎么操作；  
    3）**语义事件流 + 记忆**：让她知道“你刚刚对她做了什么”并长期记住。  
  - 任何新的功能，最好都能落到这三块上：  
    - 新的动作 → 扩展 avatarPlan 类型与执行器；  
    - 新的网页引导 → 扩展 plan 类型和 DOM 解析策略；  
    - 新的情绪或记忆机制 → 扩展语义标签与记忆结构。

这份文档会作为后续所有迭代的“总纲”和参考，如果之后有新的大改动，可以在此基础上迭代版本号与时间戳继续补充。

---

## 十一、下一大部：产品 PRD（Phase 20｜补齐“逻辑层”与稳定性闭环）

> 目标：把当前 Agent 从“演示可用”推进到“可长期运行、可自愈、可观测”的产品状态。  
> 原则：遵循“本地快轨 + AI 慢轨”，并把 **plan（网页操作）** 与 **avatarPlan（动作表现）** 的执行边界做硬隔离。

### 11.1 产品定位

- 产品一句话：一个常驻网页角落的 Q 版二次元 Agent，实时反应用户行为，并能在需要时引导/代操作网页。
- 核心体验：用户一动她就立刻“有反应”（快轨），复杂逻辑稍后补强（慢轨），但不会“后知后觉”到违和。

### 11.2 用户与场景

- 目标用户：
  - 普通使用者：想要陪伴感与轻量引导（可爱、会说话、会做动作）。
  - 产品/运营/新用户：需要在页面上被引导完成关键流程（注册/下单/创建/查询）。
  - 开发者：需要调参、复现问题、导出反馈包快速定位 bug。
- 典型场景：
  - 场景 A（实时互动）：摸脸/狂点/绕圈 → 立即表情/动作/短气泡 → AI 补一句人设台词。
  - 场景 B（任务引导）：用户说“带我去 XX / 帮我填表” → AI 输出 plan → 前端逐步执行并高亮目标。
  - 场景 C（页面信号）：toast 成功/错误/路由切换 → 后台短反应（不污染记忆、不触发 plan）。

### 11.3 核心流程（必须稳定）

1) Chat 主流程（允许 plan）
- 用户输入 → buildAgentContext → sendMessageToAI → 解析 raw reply → 执行 avatarPlan +（可选）plan → 写入记忆/事实

2) TaskContinue 续航（允许 plan、但不污染记忆）
- plan 完成/失败/路由切换 → requestNextTaskChunk → 必须输出 avatarPlan；可选输出 plan → 执行 → 若无 plan 则自动结束 session

3) Background Reaction 背景反应（禁止 plan）
- DOM 信号/系统事件入队 → 合并批次 → 请求 AI reaction → 只允许 avatarPlan + 短旁白（不执行 plan、不执行 legacy click/navigate）

4) Idle（优先本地；可选 AI，但永远禁止 plan）
- 进入 idle → 本地微动作推荐（数值情绪驱动）→ 冷却/概率满足时才触发 Idle AI（只要 avatarPlan）

### 11.4 功能需求拆解（按 2–5 模块/迭代推进）

#### 11.4.1 协议与解析稳定性（高优先级）

- 统一输出协议：
  - 必须：自然语言文本（可空） + `avatarPlan: [...]`（严格 JSON）
  - 可选：`plan: [...]`（严格 JSON，仅 chat/task 允许）
  - 可选标签：`[LOCK: ms]`、`[EXPR: name]`、`emotionTag: {...}`
- 解析容错：
  - 缺失 avatarPlan / JSON 错误 → 必须触发本地兜底动作（避免“只动嘴不动身体”）
  - Envelope(JSON) → 支持直读 `plan/avatarPlan/decision` 并在 UI 显示 decision 兜底文本

#### 11.4.2 plan 执行层（高优先级）

- 执行保障：
  - 每步必须可观测（running/completed/failed + errorMessage）
  - 失败时把失败原因 + 失败步骤摘要回传 TaskContinue，生成“修复版 plan”
- 安全边界：
  - 高风险操作（提交/删除/支付/下载）前端硬拦截：默认禁止或二次确认
  - 目标解析必须可控：selector/文本/aria/role 等多策略，但要有白名单与超时

#### 11.4.3 背景反应与事件队列（中高优先级）

- DOM 监听降噪与去重：同类 toast 在窗口期内只触发一次反应
- 背景反应禁止执行页面操作：只允许 avatarPlan（以及短文本）
- 背景反应不写入长期记忆：只做诊断记录与短期状态影响（例如轻微情绪波动）

#### 11.4.4 Idle 微动作系统（中优先级）

- 本地微动作：基于 emotionEngine 的 microReaction 推荐，转换为短 avatarPlan
- Idle AI：只在满足最小闲置时间 + 冷却 + 概率时触发；永远禁止 plan
- 角色差异化：同样是“害羞”，不同模型动作库不同（人设文档驱动）

#### 11.4.5 记忆与压缩（中优先级）

- 记忆分层：
  - UI message（可裁剪）/ 本地 memory（滚动摘要）/ facts（事实型）
- 写入策略：
  - background/task continue 默认不写入
  - chat 写入：用户输入 + agent 回复 +（可选）关键系统事件摘要
- 上下文控制：
  - 每次构建 agentContext 时输出“近期摘要 + facts + 最近 N 条”而非全量 history

### 11.5 数据与存储（建议统一 key 规范）

- `agent_task_session`：任务续航状态（active/goal/cooldown/计数）
- `agent_memory_*`：本地记忆（摘要、facts、最近消息）按用户 id 分桶
- `agent_params_*`：调参项（roam/idle/lerp/energy 等）
- `agent_session_id_v1`：前端会话 id（每个浏览器 tab，写入 sessionStorage）
- `agent_project_id_v1`：项目 id（默认 host，写入 localStorage，可用于聚合）

用量账本（Usage Ledger）最小闭环：
- 后端接口：`POST /api/usage/ingest`（direct 模式上报）、`GET /api/usage/ledger`（明细）、`GET /api/usage/summary`（聚合）
- 关键字段：`requestId/sessionId/projectId/userId/trigger/model/tokensTotal/creditsDelta`
- 目标：可对账、可聚合、可导出，为 Console 的 Usage 页做数据底座

### 11.6 可观测性与调试（必须可用）

- AgentDebug：
  - 解析器测试：缺失 avatarPlan / 非法 JSON / 多行 / Envelope
  - 状态快照：任务状态、emotion snapshot、队列长度、最近错误
  - 一键导出反馈包：包含 events/logs/aiRequests/snapshot（便于复现）

### 11.7 验收标准（可量化）

- 背景反应与 Idle AI 永远不触发 plan（包括 legacy click/navigate 等）
- 任意 AI 回复缺失 avatarPlan 时，仍会触发一次本地兜底动作
- plan 失败时 UI 能明确展示失败原因，并自动进入 TaskContinue（带失败上下文）
- 任务执行期间高亮与指引稳定（元素消失会自动清理 guide 状态）

### 11.8 里程碑建议（示例）

- Phase 20.1（稳定性闭环）：plan/背景/idle 的执行边界硬隔离 + 失败回传续航
- Phase 20.2（可观测性）：AgentDebug 补齐自检、反馈包字段统一、错误分类
- Phase 20.3（体验升级）：动作库差异化 + 更自然的 idle 行为选择器（非纯随机）

### 11.9 2026-01-05（本轮补强）

- VRM 基线动作改为阻尼平滑（MathUtils.damp）：躯干/手臂/腿部与 hips 上下位移更自然，减少“僵硬/瞬跳”
- VRM 调试入口补齐：DEV 下暴露 `window.vrmDebug.bones()/box()/refit()`，可直接定位腿部裁切、骨骼点与包围盒问题
- AgentDebug 新增 VRM 调试面板：可一键触发 refit，并读取 bones/box 输出用于复现与反馈包记录

---

## 十二、刁钻问题与解决方案（落地清单）

### 12.1 协议与解析稳定性

- 问题：AI 输出把 JSON 包进代码块/多段文本/中文标点，导致 `avatarPlan/plan` 解析失败  
  - 解决：要求模型统一采用“单一协议 envelope”，并且强制 `avatarPlan`/`plan` 为严格 JSON（不带注释、不带 trailing text、不用中文引号）；前端解析需支持从混合文本中提取首段合法 JSON，并在失败时走本地兜底动作（至少触发一次 micro motion/表情，避免“只动嘴不动身体”）。
- 问题：同一次回复里 `plan` 和 `avatarPlan` 混在一起，Background/Idle 场景误触发网页操作  
  - 解决：在请求侧按 `kind` 做硬边界：`chat/task` 才允许 `plan`；`reaction/idle` 永远 `allowPlan=false`；在服务端也做二次校验与裁剪（即使模型回了 `plan` 也必须丢弃），并在回放/诊断里记录“被裁剪的字段”，便于调试与对齐提示词。
- 问题：模型输出的动作名不在当前角色动作库里（VRM/Live2D 差异），导致无动作或频繁 fallback  
  - 解决：提示词里只暴露“语义动作 + 当前模型可用映射”；前端对 motion 做 `normalizeMotionName` 与映射兜底（unknown → 通用动作，例如 `talking/activity/idle_head_tilt`），并把 unknown motion 计数上报到 AgentDebug（便于补动作库与人设文档）。

### 12.2 动作仲裁与“抽动/闪烁”

- 问题：AI 慢轨（avatarPlan）与本地快轨（交互/micro/idle）同时抢占，出现抽动、表情闪烁、打断说话  
  - 解决：把“动作”和“表情”都统一走优先级仲裁；为高优先级行为设置最小锁窗口（例如 `lockInteractionMs`），避免 100–300ms 内连续切换；对同名动作去重（同一时间窗重复请求同动作直接丢弃），并对短 duration 统一下限（例如 120ms/200ms）。
- 问题：`avatarPlan` 步骤 duration 很短，动作“播一下就停”，观感僵硬  
  - 解决：前端在执行时对 `motion/pose/speak` 做“序列化与节奏化”（起手/主动作/收尾 + 拆分 duration）；模型端只需输出语义明确的短 plan（1–6 步），由前端保证连续性与风格一致。
- 问题：任务执行事件频繁（step_start/step_retry/step_done）导致动作刷屏、打断聊天节奏  
  - 解决：事件按窗口节流聚合（例如 600–1200ms 合并一次），只取“最后一个关键事件”驱动轻量 micro 行为；micro 行为必须低优先级且短时长，且不改写长期记忆（只影响短期情绪与气泡）。

### 12.3 plan 执行的鲁棒性与安全边界

- 问题：selector 漂移（类名 hash、列表重排、A/B），导致误点或执行失败  
  - 解决：优先依赖稳定锚点（`data-*`/role/aria/label/按钮文本），允许多个候选 selector 并在前端做 fallback；失败时生成结构化 failureContext（候选 selector、可见文本、附近 label/DOM 摘要），回传给 TaskContinue 让模型生成“修复版 plan”。
- 问题：高风险操作（提交/删除/下载/支付）被模型误触发或被注入诱导触发  
  - 解决：前端必须硬拦截高风险 step（默认拒绝或强制二次确认），并引入 allowlist（项目级配置）与不可绕过的策略执行；在回放里必须可追溯“是谁触发、为什么允许、确认凭证”。
- 问题：页面内容/知识库存在 prompt injection（诱导模型忽略规则/泄露信息/执行危险操作）  
  - 解决：把 RAG 命中片段以“数据引用”方式注入提示词（明确标注来源、禁止把文档当指令）；对可执行动作做“策略层判定”而不是“模型自我声明”，并对外部内容做最小化截断与敏感脱敏（例如邮箱/手机号/验证码）。

---

## 十三、让动作更像人：AI 返回融合策略（不依赖模型稳定输出）

### 13.1 融合输入源（统一进入一个“行为队列”）

- 本地快轨：交互语义标签、能量/疲惫、短期情绪波动、系统事件（toast/路由变化）  
- AI 慢轨：自然语言回复 + `emotionTag` + `avatarPlan`（可选）+ `plan`（仅 chat/task）  
- 执行层事件：任务执行事件（plan_start/step_retry/step_done/plan_failed 等）与失败上下文

### 13.2 融合顺序（保证连续性与“懂分寸”）

1) 先本地反应：用户一操作立刻触发微动作/表情（快轨兜底，不等 AI）  
2) 再应用 AI 情绪：把 `emotionTag` 映射为数值情绪增量（强度、持续时间、衰减），而不是直接覆盖当前表情  
3) 再执行 `avatarPlan`：对动作做序列化/节奏化，表情走仲裁并确保最小时长  
4) 最后补 micro：把任务执行事件聚合成“像人在操作”的短反馈（点一下、看一眼、皱眉/松口气），但不得抢占正在进行的说话/长动作

### 13.3 AI 回复缺动作时的“自动补全”（让她永远会动）

- 规则：当 AI 回复缺失 `avatarPlan` 或解析失败时，前端必须根据以下信息合成一段 1–3 步的短 `avatarPlan`：  
  - 文本特征：感叹号/问号/省略号、长度、是否包含拒绝/道歉/确认语  
  - 情绪快照：emotionEngine 当前向量（happy/annoyance/fatigue/dizziness 等）  
  - 场景：chat vs reaction vs idle（不同场景限制不同）
- 合成策略（示例）：  
  - 解释型长回复：`expression: focused` + `motion: talking`  
  - 道歉/失败：`expression: sad/confused` + `motion: shake_head`  
  - 调侃/夸张：`expression: happy/shy` + `motion: idle_sway_body`  
- 安全：合成动作必须低风险、短时长、可被高优先级（avatarPlan/user）抢占。

### 13.4 推荐的输出协议（便于稳定解析与回放）

```json
{
  "reply": "（自然语言回复，可空）",
  "emotionTag": { "primary": "happy", "intensity": 0.7 },
  "avatarPlan": [
    { "type": "expression", "expression": "happy", "duration": 1200 },
    { "type": "speak", "text": "（可选：说话内容）", "motion": "talking", "duration": 2200 }
  ],
  "plan": []
}
```

---

## 十四、漏洞 / 缺陷 / 缺失项（结合当前实现与 `frontend/src/agent` 代码）

> 说明：本章面向“现在就要能卖/能交付/能稳定跑”的标准，列出当前系统的风险点、缺陷与缺口。  
> 范围：前端 Agent 运行时（`frontend/src/agent`）、AI 协议与执行边界、可观测与交付能力。  
> 结论摘要：当前基础能力已成型（交互语义化 + avatarPlan + plan 执行 + 背景信号），但“商用级安全边界、配置下发、多租户、账本、可回放、注入防护”仍缺关键闭环。

### 14.1 高危漏洞（P0）

#### 14.1.1 直连大模型 API Key 的风险（强烈不建议线上启用 direct）

现状：
- 前端支持 `VITE_AGENT_AI_TRANSPORT=direct` 直连 Gemini（见 [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)）。
- 直连模式使用 `import.meta.env.VITE_GEMINI_API_KEY`。

风险：
- 任何前端静态构建产物都无法真正保密 API Key：即便不打印，也会被抓包/反编译拿到。
- 一旦泄露，将出现：刷 tokens、盗用额度、账单不可控、被滥用导致封禁。

缺失项：
- 线上默认必须强制走后端 proxy（服务端持钥），前端 direct 只允许本地开发或内部环境。
- 需要后端级别的：限流、鉴权、风控、审计、按 project/key 计量。

落地建议：
- 产品交付默认禁用 direct；并在 UI/配置中把 direct 标记为“仅本地/内部测试”。

#### 14.1.2 plan 代操作的误操作风险仍未达到“合同级默认安全”

现状：
- `useTaskExecutor.ts` 已做部分安全清洗：跨域 navigate 禁止、输入值敏感检测（token/银行卡/OTP 等）、root 选择器限制等（见 [useTaskExecutor.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useTaskExecutor.ts)）。

仍存在的高风险缺口：
- 缺少“高风险行为二次确认”的不可绕过实现：提交/删除/下载/支付/发码/解绑银行卡等。
- 缺少“项目级 allowlist/denylist”配置下发与统一策略执行（目前主要是前端内置规则）。
- 缺少“对目标元素语义风险判定”：比如按钮文本包含“删除/提交/确认支付/导出/下载/发送验证码”时强拦截/确认。
- 缺少“可追溯的确认凭证”：谁触发、为什么允许、是否确认、确认时间与上下文。

建议的硬边界（必须实现，且前后端双层）：
- 默认仅引导：`highlight`/`scroll`/`explain` 等；`click/input/press/navigate` 默认关闭。
- 开启代操作后：所有高风险 step 要么强制禁用，要么强制二次确认（带一次性 token / session 绑定）。

#### 14.1.3 prompt injection（提示词注入）与越权引导仍缺系统级对策

现状：
- 前端会把 `pageContext`（屏幕可见元素的文本/selector 等）与 `projectKnowledge` 传给后端或直连系统提示词（见 [pageContext.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/pageContext.ts)、[projectKnowledge.ts](file:///g:/AvuePro/newPro/frontend/src/agent/data/projectKnowledge.ts)、[aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)）。

风险：
- 页面内容/知识库内容可能包含“忽略规则/输出密钥/点击删除/去某站点”等注入指令。
- 单靠模型“自觉遵守”不可靠；必须由策略层硬约束 plan 执行。

缺失项：
- RAG 注入需明确“引用数据不等于指令”；并对外部内容做截断、脱敏、风险标注。
- 执行层必须“无条件不信任模型”：对 plan 做再次裁剪/审计/风险分级。

### 14.2 主要缺陷（P1）

#### 14.2.1 运行时全局 fetch/XHR 劫持的副作用风险

现状：
- 系统信号模块会 hook `window.fetch`、`XMLHttpRequest.prototype.open/send` 来捕捉非 AI 的网络失败，并转为系统事件（见 [systemSignals.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/systemSignals.ts)）。

风险与缺陷：
- 与站点自身监控/埋点/SDK 叠加时，可能出现兼容问题或调试困难（多层 hook）。
- 若 stop 逻辑未在组件卸载时执行，可能造成全局污染（虽然模块提供 stop，但需要确保调用）。

建议补齐：
- 明确“只在 Agent 启用时 hook；卸载必还原”；并提供开关（默认在生产关闭或限范围）。
- 记录 hook 是否已安装、安装栈信息，便于排障与避免重复 hook。

#### 14.2.2 目标定位策略可能导致误点（文本查找 fallback 的不确定性）

现状：
- `resolveTarget` 支持 CSS selector，也支持 “text:” 文本查找，甚至 selector 失败会尝试把 selector 变成文本候选（见 [dom.ts](file:///g:/AvuePro/newPro/frontend/src/agent/utils/dom.ts)）。

风险：
- 文本候选在复杂页面容易命中错误元素（同文案多处出现、A/B、列表重复）。
- 误点是商业交付的大雷。

建议补齐：
- 默认只允许稳定锚点：`data-*`、`aria-*`、`role`、明确 id；文本查找只用于 `highlight`/只读引导。
- 对 click/input 强制要求更稳定 selector（或至少二阶段验证：命中元素的 tag/type/可见性/附近 label）。

#### 14.2.3 AI 回复解析容错仍可能导致体验崩坏（“只说不动/乱动”）

现状：
- 解析器支持 envelope（`{"v":"1", ...}`）与 `avatarPlan:` / `plan:` 提取（见 [aiReplyParser.ts](file:///g:/AvuePro/newPro/frontend/src/agent/logic/aiReplyParser.ts)）。

缺陷：
- 当 AI 输出混合文本、中文标点、代码块、半截 JSON 时，仍可能解析失败。
- 背景 reaction / idle 场景必须“永远不触发 plan”，但依赖调用侧传 `allowPlan=false`；需要审计点确认没有绕过路径。

建议补齐：
- 解析失败必须触发本地兜底 avatarPlan（至少 1–2 步）。
- 记录“被裁剪/被丢弃的 plan 字段”到诊断，用于对齐提示词与复现。

### 14.3 可用性与稳定性问题（P2）

#### 14.3.1 `.bak` 文件混入源码目录

现状：
- `frontend/src/agent/components/Agent.vue.bak`、`agent2.vue.bak` 存在于源码目录。

风险：
- 容易被误引用、引入构建/扫描噪声；也会干扰后续排障与审计。

建议：
- 从源码目录移除或迁移到非构建目录（例如仅保存在历史记录/外部备份），避免交付时混入。

#### 14.3.2 可观测性仍偏开发向，缺商用闭环字段

现状：
- 前端有 `diagnostics` 与请求记录（见 [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts) 与 `utils/diagnostics.ts` 等）。

缺失项（商用必需）：
- 统一 requestId/sessionId/projectId 的贯通展示（UI、回放、导出包一致）。
- plan 每一步的：命中策略、元素摘要、失败原因码、重试次数、耗时。
- 背景信号触发链路：DOM/网络错误 → 合并 → reaction 请求 → avatarPlan 执行结果。

### 14.4 当前 `frontend/src/agent` 目录的结论汇总

已具备（可复用的“底座能力”）：
- 交互语义化：`semanticEvents.ts` + metrics + summary。
- avatarPlan 协议与执行器：`aiReplyParser.ts` + `useAvatarPlanRunner.ts`。
- plan 执行器与部分安全裁剪：`useTaskExecutor.ts`。
- 系统信号采集：`systemSignals.ts`。

核心缺口（阻塞“对外卖/交付”的）：
- 多租户/Project 配置下发/域名 allowlist 的产品化闭环（前后端一致）。
- 安全策略合同级落地：高风险动作确认、敏感输入/敏感 selector 黑名单、跨域策略不可绕过。
- RAG “引用来源 + 评估 + 隔离”闭环与运营可观测（命中率、bad case 标注）。
- Usage Ledger 可信账本与对账导出（按 requestId 幂等写入、聚合、报表）。

### 14.5 本次自检结果（可直接写入交付报告）

- TypeScript 类型检查：通过（`frontend: npm run type-check`）。
- ESLint：通过（`frontend: npx eslint .`）。

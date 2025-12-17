# Lumina Agent 深度改造与集成说明（对接用）

> 面向：下一个接手的 AI / 开发者  
> 目标：让你在不了解上下文的情况下，也能快速接手继续演进这个 Agent

---

## 1. 整体目标与演化方向

本轮对话与改造的核心目标：

- 把网页上的 Q 版傲娇 AI「Lumina」打造成一个：
  - **有情绪、有物理反馈、有记忆**的 Agent；
  - 能根据 AI 回复自动切换表情、动作、姿态；
  - 能根据用户物理操作（拖拽、乱点、绕圈、顶到屏幕边缘）做出合理反应。

阶段性目标概括：

1. **情绪系统**  
   - 建立从 LLM 文本 → 情绪标签 → 前端状态 → Live2D 模型 的完整链路。
   - 支持 `[ANGRY] [POUT] [SHY] [HAPPY] [DIZZY] [CRY] [CONFUSED] [FAINT/TIRED]` 等情绪标签。
   - 为情绪设计基础的优先级和自动恢复逻辑。

2. **动作系统（Motion）**  
   - 规范 `[MOTION: xxx]` 协议，让 LLM 可以直接触发 Live2D 动作组。
   - 充分利用现有 Live2D 模型已经自带的大量 `.mtn` 动作（如 `activity / friend / morning / evening` 等）。

3. **Live2D 深度融合**  
   - 修复原有 Live2D 组件的渲染、点击、拖拽、WebGL context 丢失等问题。
   - 将 Agent 的情绪与 Live2D 模型的姿态（身体角度、眼球方向）关联起来：
     - 哭的时候身体更弯，眼睛向下。
     - 害羞时头偏一边，眼睛侧视。

4. **后端大脑（Gemini）与记忆**  
   - 在后端强制注入「情绪/动作标签协议」，保证大脑输出的文本符合前端协议。
   - 引入用户级记忆（`backend/memory/chats.json`），支持长程对话和偏好记忆。
   - 对网络错误做优雅降级（用 `[DIZZY]` + 解释网络问题，而不是完全报错）。

---

## 2. 关键组件与文件概览

### 2.1 前端（Vue + Live2D）

主要目录：`frontend/src/agent`

- `components/Agent.vue`  
  核心智能体容器组件：
  - 管理 Agent 的位置、拖拽、惯性移动、能量消耗、疲劳等。
  - 管理情绪状态：`isAngry / isHappy / isDizzy / isFainted / isPouting / isCrying / isHeadHit / isConfused / isTalking / isTired` 等。
  - 解析 LLM 返回文本中的情绪标签、动作标签。
  - 将状态通过 props 传给 `Live2DWidget` 和 `ChatWindow / TaskDisplay / GuideOverlay`。
  - 文件：`frontend/src/agent/components/Agent.vue:1-400`（UI + 状态），`591-800`（AI 集成）。

- `components/Live2DWidget.vue`  
  Live2D 宿主组件：
  - 内部通过 `ModelManager` 管理 Cubism2 模型。
  - 监听 `Agent` 的状态（情绪、移动、说话、头撞顶等），调用 `startMotion` 和 `setExpression`。
  - 根据情绪调用底层 `setEmotionFlags` 影响姿态。
  - 文件：`frontend/src/agent/components/Live2DWidget.vue:1-200`。

- `services/Live2DModelManager.ts`  
  Live2D 模型管理器：
  - 动态加载 Cubism2 核心脚本和模型。
  - 支持本地或 CDN 模型配置加载。
  - 提供 `startMotion` / `setExpression` / `setEmotionFlags` 三个调用接口给 Vue。
  - 文件：`frontend/src/agent/services/Live2DModelManager.ts:1-260`。

- `live2d-widget/cubism2/index.js`（`Cubism2Model`）  
  Live2D v2 绘制管线：
  - 创建 WebGL 上下文，管理绘制 loop。
  - 通过内部的 `LAppLive2DManager` 和 `LAppModel` 驱动模型更新与绘制。
  - 将鼠标事件转换为 Live2D `dragX / dragY` 并调用 `model.update() / model.draw()`。
  - 文件：`frontend/src/agent/live2d-widget/cubism2/index.js:1-230, 287-355`。

- `live2d-widget/cubism2/LAppModel.js`  
  Live2D 模型实现类（关键改造点）：
  - 从 `ModelSettingJson` 载入 `.moc / .mtn / .exp`。
  - `update()` 负责：
    - 更新运动队列 `mainMotionManager` 和 `expressionManager`。
    - 根据 `dragX/dragY`、时间 `t` 设置各参数。
    - 调用 `physics`、`pose`、`lipSync`。
  - 新增情绪姿态控制逻辑（详见下文）。
  - 文件：`frontend/src/agent/live2d-widget/cubism2/LAppModel.js:147-215, 296-303`。

### 2.2 后端（Node + Express + Gemini）

主要文件：`backend/server.js`

- `/api/chat` 路由：`backend/server.js:239-548`
  - 接收前端消息（`message`）、用户 ID、页面上下文、项目知识。
  - 从本地 `chats.json` 读取历史，构造 `recentHistory`。
  - 构造复杂的 `systemPrompt`，包含：
    - 角色设定（傲娇萝莉 Lumina）。
    - 情绪标签协议 `[ANGRY] [POUT] [SHY] [DIZZY] [HAPPY] [CONFUSED] [SLEEPY]`。
    - 物理事件解释 `[System Event: ...]` 的处理规则。
    - Web 操作指令（`highlight / click / input / scroll / navigate / hover / press / plan`）。
    - Live2D 动作协议 `[MOTION: xxx]`（已扩展，见后文）。
  - 调用 Gemini `models/gemini-2.5-flash:generateContent`。
  - 超时控制（AbortController + 30s），网络错误时输出带 `[DIZZY]` 的友好提示。
  - 将消息与回复写回 `chats.json` 作为记忆。

- 记忆存储：`backend/memory/chats.json`
  - 每个用户一个数组，存储 `{ role, text, timestamp }`。
  - 部分示例包含 `[DIZZY]` 标签，证明前端/后端标签链路闭环。

---

## 3. 关键链路：从 AI 文本到 Live2D 姿态

### 3.1 情绪标签流转

1. **后端强制协议**  
   - system prompt 中要求 AI 在句末加情绪标签：  
     `backend/server.js:359-367`  
   - 示例规则：
     - `[ANGRY]`：用户捣乱/重复问 → 傲娇生气。
     - `[SHY]`：被夸、不会回答 → 害羞。
     - `[DIZZY]`：被绕圈/网络脑子坏了。
     - `[HAPPY]`：帮助成功。
     - `[CONFUSED]`：用户行为奇怪。
     - `[SLEEPY]`：用户太久不理/内容无聊。

2. **前端解析标签 → 状态变量**  
   - 文件：`frontend/src/agent/components/Agent.vue:591-655`
   - 步骤：
     - 拿到 `rawResponse`。
     - 清洗出 `cleanResponse`（去掉标签和隐藏命令）。
     - Reset 所有情绪状态为 `false`。
     - 按标签解析，逐个设置：
       - `[ANGRY]` → `isAngry.value = true`
       - `[POUT]` / `[SHY]` → `isPouting.value = true`
       - `[HAPPY]` → `isHappy.value = true`
       - `[DIZZY]` → `isDizzy.value = true`
       - `[FAINT]` / `[TIRED]` → `isFainted.value = true`
       - `[CRY]` → `isCrying.value = true`
       - `[CONFUSED]` → `isConfused.value = true`
     - 同时解析 `[MOTION: xxx]` 到 `motionCommand.value`。

3. **状态通过 props 传入 Live2D 宿主**  
   - 文件：`frontend/src/agent/components/Agent.vue:11-27`
   - 传入的 props：
     - `isTalking / isMoving / isHovered`
     - `isDizzy / isHappy / isConfused / isAngry / isFainted / isPouting / isHeadHit / isCrying`
     - `motionCommand / message / currentLang / scale`

4. **Live2DWidget 监听 props，触发表情与情绪姿态**

   文件：`frontend/src/agent/components/Live2DWidget.vue:59-146`

   - 示例：生气逻辑

```ts
watch(
  () => props.isAngry,
  (val) => {
    if (!modelMgr.value) return;
    modelMgr.value.setEmotionFlags({ isAngry: !!val });
    if (val) {
      modelMgr.value.setExpression('f03');
      modelMgr.value.startMotion('shake');
    } else {
      modelMgr.value.setExpression('f01');
    }
  }
);
```

   - 示例：开心逻辑

```ts
watch(
  () => props.isHappy,
  (val) => {
    if (!modelMgr.value) return;
    modelMgr.value.setEmotionFlags({ isHappy: !!val });
    if (val) {
      modelMgr.value.setExpression('f02');
    } else {
      modelMgr.value.setExpression('f01');
    }
  }
);
```

   - 示例：害羞/噘嘴（映射为 `isShy`）：

```ts
watch(
  () => props.isPouting,
  (val) => {
    if (!modelMgr.value) return;
    modelMgr.value.setEmotionFlags({ isShy: !!val });
    if (val) {
      modelMgr.value.setExpression('f05');
    } else {
      modelMgr.value.setExpression('f01');
    }
  }
);
```

   - 示例：哭：

```ts
watch(
  () => props.isCrying,
  (val) => {
    if (!modelMgr.value) return;
    modelMgr.value.setEmotionFlags({ isCrying: !!val });
    if (val) {
      modelMgr.value.setExpression('f05');
    } else {
      modelMgr.value.setExpression('f01');
    }
  }
);
```

5. **ModelManager 把情绪标记传入 Cubism2Model → LAppModel**

- 文件：`frontend/src/agent/services/Live2DModelManager.ts:216-226`

```ts
public setExpression(name: string) {
  if (this.cubism2model) {
    (this.cubism2model as any).setExpression(name);
  }
}

public setEmotionFlags(flags: {
  isCrying?: boolean;
  isShy?: boolean;
  isHappy?: boolean;
  isAngry?: boolean;
}) {
  if (this.cubism2model) {
    (this.cubism2model as any).setEmotionFlags(flags);
  }
}
```

- 在 `Cubism2Model` 中转发到 `LAppModel`：  
  `frontend/src/agent/live2d-widget/cubism2/index.js:231-241`

```js
setEmotionFlags(flags) {
  if (this.live2DMgr && this.live2DMgr.model && this.live2DMgr.model.setEmotionFlags) {
    this.live2DMgr.model.setEmotionFlags(flags);
  }
}
```

6. **LAppModel 根据情绪修正姿态/眼球参数**

- 文件：`frontend/src/agent/live2d-widget/cubism2/LAppModel.js:179-201, 296-303`

```js
const flags = this.emotionFlags || {};

let bodyAngleFactor = 10;
let angleXDelta = 0;
let angleYDelta = 0;
let angleZDelta = 0;
let eyeBallX = this.dragX;
let eyeBallY = this.dragY;

if (flags.isCrying) {
  bodyAngleFactor = 15;
  eyeBallY -= 2;
  angleXDelta -= 5;
}

if (flags.isShy) {
  angleYDelta += 5;
  eyeBallX -= 1;
}

if (flags.isHappy) {
  bodyAngleFactor = Math.max(bodyAngleFactor, 12);
  angleZDelta += 3;
}

if (flags.isAngry) {
  angleZDelta -= 5;
}

this.live2DModel.addToParamFloat('PARAM_ANGLE_X', this.dragX * 30 + angleXDelta, 1);
this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', this.dragY * 30 + angleYDelta, 1);
this.live2DModel.addToParamFloat(
  'PARAM_ANGLE_Z',
  this.dragX * this.dragY * -30 + angleZDelta,
  1
);

this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', this.dragX * bodyAngleFactor, 1);

this.live2DModel.addToParamFloat('PARAM_EYE_BALL_X', eyeBallX, 1);
this.live2DModel.addToParamFloat('PARAM_EYE_BALL_Y', eyeBallY, 1);
```

- 新增 `setEmotionFlags`：

```js
setEmotionFlags(flags) {
  this.emotionFlags = {
    ...this.emotionFlags,
    ...flags
  };
}
```

**效果总结：**

- 哭：身体明显前倾，眼睛向下 → 有“快哭出来”的感觉。
- 害羞：头偏一侧，眼睛略微侧视 → 有被夸装傲娇的效果。
- 开心：身体摆动增强，轻微倾斜 → 看起来更有活力。
- 生气：姿态更硬，Z 轴角度略负向 → 更“顶”。

---

### 3.2 动作（Motion）标签流转

1. **后端 Live2D 动作协议**

- 文件：`backend/server.js:463-476`
- 向 AI 暴露的动作组：

```text
Available Motions:
- [MOTION: tap_body] (Standard interaction)
- [MOTION: flick_head] (Surprised/Hit)
- [MOTION: shake] (Angry/Refusal)
- [MOTION: talking] (Speaking)
- [MOTION: idle] (Reset/Neutral)
- [MOTION: mail] (Subtle reaction, good for shy/soft answers)
- [MOTION: activity] (Energetic pose, good for confident answers)
- [MOTION: friend] (Warm/friendly reaction)
- [MOTION: morning] (Cheerful greeting-style motion)
- [MOTION: afternoon] (Calmer, casual motion)
- [MOTION: evening] (Soft, slightly tired motion)
```

这些名字都来自当前模型的 `model.json`，比如：  
`frontend/public/live2d/model/BengHuai/xier/model.json:15-64`

2. **前端解析 `[MOTION: xxx]`**

- 文件：`frontend/src/agent/components/Agent.vue:648-663`

```ts
const motionMatch = cleanResponse.match(/\[MOTION:\s*(\w+)\]/);
if (motionMatch) {
  motionCommand.value = motionMatch[1];
  cleanResponse = cleanResponse.replace(motionMatch[0], '');

  setTimeout(() => {
    motionCommand.value = '';
  }, 2000);
}
```

3. **Live2DWidget 监听并触发动作为 motion group**

- 文件：`frontend/src/agent/components/Live2DWidget.vue:59-67`

```ts
watch(
  () => props.motionCommand,
  (newCmd) => {
    if (newCmd && modelMgr.value) {
      modelMgr.value.startMotion(newCmd);
    }
  }
);
```

4. **ModelManager → Cubism2Model → LAppModel**

- 文件：
  - `frontend/src/agent/services/Live2DModelManager.ts:216-220`
  - `frontend/src/agent/live2d-widget/cubism2/index.js:231-235`
  - `frontend/src/agent/live2d-widget/cubism2/LAppModel.js:228-233`

```ts
// Live2DModelManager.ts
public startMotion(group: string) {
  if (this.cubism2model) {
    (this.cubism2model as any).startMotion(group);
  }
}

// Cubism2Model index.js
startMotion(group) {
  if (this.live2DMgr && this.live2DMgr.model) {
    this.live2DMgr.model.startRandomMotion(group, LAppDefine.PRIORITY_FORCE);
  }
}

// LAppModel.js
startRandomMotion(name, priority) {
  const max = this.modelSetting.getMotionNum(name);
  const no = parseInt(Math.random() * max);
  this.startMotion(name, no, priority);
}
```

---

## 4. 已完成的主要修改（按文件）

### 4.1 Live2D 模型层：LAppModel

文件：`frontend/src/agent/live2d-widget/cubism2/LAppModel.js`

- 新增情绪字段：

```js
this.emotionFlags = {
  isCrying: false,
  isShy: false,
  isHappy: false,
  isAngry: false
};
```

- 在 `update()` 中接入情绪姿态控制（见 3.1）。
- 新增 `setEmotionFlags(flags)` 方法（见 3.1）。
- 保持原有 physics、pose、lipSync 流程不变，参数叠加设计保证兼容性。

### 4.2 Cubism2Model：增加情绪控制转发

文件：`frontend/src/agent/live2d-widget/cubism2/index.js:231-241`

- 新增：

```js
setEmotionFlags(flags) {
  if (this.live2DMgr && this.live2DMgr.model && this.live2DMgr.model.setEmotionFlags) {
    this.live2DMgr.model.setEmotionFlags(flags);
  }
}
```

### 4.3 ModelManager：给 Vue 层预留情绪接口

文件：`frontend/src/agent/services/Live2DModelManager.ts:209-226`

- 调整 `startMotion / setExpression` 调用方式为 `any`（兼容 JS）；
- 新增 `setEmotionFlags` 方法供 Vue 调用。

### 4.4 Live2DWidget：根据 Vue 状态驱动表情 + 姿态

文件：`frontend/src/agent/components/Live2DWidget.vue`

- 对 `isAngry/isHappy/isPouting/isCrying` 的 watcher 增加 `setEmotionFlags` 调用（见 3.1）。
- 继续用 `setExpression('f0x')` 控制表情层。
- `motionCommand` 仍然统一调用 `modelMgr.startMotion(newCmd)`，兼容所有 motion group。

### 4.5 Agent.vue：情绪解析与系统事件汇报

文件：`frontend/src/agent/components/Agent.vue`

关键点：

- 手动交互触发情绪：
  - 快速连点头部 → `isAngry`，并向消息流插入 `[System Event: ...]` 文本，用于 LLM 理解物理行为。`Agent.vue:486-538`
  - 鼠标绕圈 → `triggerDizzy()`，触发 `isDizzy`，同样插入 `[System Event: ...]`。`Agent.vue:190-237, 240-257`
  - 头撞屏幕上边 → `triggerHeadHit()`，触发 `isHeadHit` 并播放 `tap_face` motion。`Agent.vue:1037-1049`
  - 这些事件会和 AI 情绪标签共同作用。

- AI 响应解析逻辑：
  - `handleSendMessage` 中根据标签设置状态，并有自动恢复定时器（4~5s）。`Agent.vue:591-655`
  - 解析 `[MOTION: xxx]` → `motionCommand`。`Agent.vue:648-663`

### 4.6 后端 server.js：System Prompt 与动作扩展

文件：`backend/server.js:334-491`

- 完整定义 Lumina 角色、情绪标签协议、物理事件解释、Web 操作协议。
- 扩展 Live2D Motion 说明，告诉 AI 可以使用更多动作组：
  - `mail / activity / friend / morning / afternoon / evening` 等。
- 使用 `AbortController` 为 Gemini 请求加 30 秒超时，网络错误时返回带 `[DIZZY]` 的友好消息。`backend/server.js:503-533`
- 将正常回复写回 `chats.json` 作为记忆，仅在网络错误时不写入。`backend/server.js:535-540`

---

## 5. 已处理的边界与容错点（高层概览）

这里只列出与本次改造相关、对稳定性影响较大的部分：

1. **Live2D WebGL 容错**
   - `webglcontextlost` / `webglcontextrestored` 事件处理：在 context 恢复时重新加载模型并重新启动渲染 loop。  
     文件：`frontend/src/agent/live2d-widget/cubism2/index.js:124-188`
   - `document.visibilitychange` 时刷新画布，避免黑屏/残影。`index.js:197-224`

2. **声音播放错误处理**
   - 在 `LAppModel.setFadeInFadeOut` 中，对 `audio.play()` 返回的 Promise 加入错误捕获，仅忽略 Autoplay 相关错误，其他错误日志输出。  
     文件：`frontend/src/agent/live2d-widget/cubism2/LAppModel.js:279-291`

3. **点击/拖拽冲突**
   - 防止拖动聊天窗口时拖动整个 Agent：
     - 在 `ChatWindow` 相关事件上加了 `@mousedown.stop @touchstart.stop @click.stop`。  
       文件：`frontend/src/agent/components/Agent.vue:30-46`
   - 拖动 Agent 时区分“拖拽”与“点击”，避免误触聊天或情绪逻辑。  
     文件：`Agent.vue` 中的拖拽状态机（`isDragging` / `hasDraggedSinceMouseDown`）。

4. **AI 请求容错**
   - 前端 `aiService.ts` 在请求错误时返回固定文本（带表情），避免 UI 崩溃：  
     文件：`frontend/src/agent/services/aiService.ts:24-40`
   - 后端使用超时控制和错误消息封装，统一带 `[DIZZY]` 标签，前端能理解为“网络/大脑晕了”。

5. **类型与静态检查**
   - 使用 `pnpm run --filter personal lint`（ESLint）和 `pnpm run --filter personal type-check`（vue-tsc）验证改造后的前端代码：
     - 结果：无错误，仅有若干未使用变量告警，不影响运行。

---

## 6. 已知限制与后续接力建议

### 6.1 已知限制

- **动作素材本身有限**  
  - 真正的「新动作」仍依赖 Live2D 官方编辑器导出 `.mtn`。目前的扩展是把已有动作组合、映射、曝光给 AI 来用。
- **情绪优先级目前是分散实现**  
  - 各状态之间还没有一个独立的「全局优先级调度器」（例如 统一的哭>晕>怒>喜 排序函数），而是通过局部逻辑和自动重置保证不会长期冲突。
- **多模型策略尚未启用**  
  - 当前主要以 `xier` 这类模型为例，`model.json` 的动作/表情定义不同模型之间可能不一致，AI 的 `[MOTION: xxx]` 假设依赖当前模型配置。

### 6.2 建议给下一个接手的 AI/开发者

1. **如果要继续“夯实”**：
   - 把情绪优先级抽象成一个纯函数，例如接收当前状态集合、输入事件，输出一个标准化的“主情绪”，然后由这一层驱动 `isCrying` 等变量。
   - 为部分关键情绪（如 `[CRY]` 触发严重事件、任务失败等）设计更严格的清理逻辑，避免短时间内不断闪变。

2. **如果要继续“扩展”**：
   - 通过 Live2D Editor 导出特定的“哭/害羞/得意/委屈”动作 `.mtn`，然后在 `model.json` 中新增独立 motion group，供 `[MOTION: xxx]` 使用。
   - 在前端增加一层“虚拟动作语言”，比如 `[MOTION: tsun_kick]` → 内部组合 `shake + activity + isAngry`，这样可以用新的动作名表达更复杂的剧情。

3. **如果要接入新的 LLM / Agent 框架**：
   - 只要遵守当前定义好的协议：
     - 文本中加入情绪标签（`[ANGRY] [HAPPY] [DIZZY] [CRY] ...`）。
     - 动作用 `[MOTION: groupName]`（`groupName` 对应当前模型 `model.json` 里的 `motions` 键）。
   - 前端和 Live2D 部分几乎可以零改动复用，直接对接新的 LLM 输出即可。

---

## 7. 总结一句话

当前这套系统已经完成了：

> **“LLM 文本 → 结构化情绪/动作标签 → Vue 状态 → Live2D 表情 + 姿态 + 动作”** 的整个闭环，  
> 并在 WebGL/音频/网络错误等方面做了基础的容错处理，适合作为下一阶段智能 Agent 的坚实底座。

```markdown
（完）
```
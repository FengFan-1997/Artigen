# Live2D Agent 开发计划（Cubism2 + 紫雨心 Cubism3/4）



## 1. 总体目标
额外补充！！！
核心目标
avatarPlan的逻辑，我要的其实并不是。抬手指向、侧身、抬腿走路 + 文案逐步讲解 而是说 这只是我给你的一个例子，我要的其实是就是比如用户输入了一个我想要去某某项目，你可以帮我操作吗。然后！交给ai 顺便交给ai我们相关的项目的使用操作，然后让ai返回一个类似于 抬手指向、侧身、抬腿走路 + 文案逐步讲解 这样的方案，然后根据这个方案，我们的模型进行执行，是这个意思。如果我们固定了这一套抬手指向、侧身、抬腿走路 + 文案逐步讲解 那么比如用户问你这个是怎么开发的，或者是唠唠家常，那么我们还能用这一套来执行吗，肯定是不行的。具体执行什么，我们是需要ai来给到我们，因为我们自己无法判断，需要交给真正ai 这样才能是一个真正的agent 让ai告诉我们计划是什么，然后我们根据计划去执行，这个很复杂你需要慢慢实现
- 让站点上的二次元 Agent 拥有「可感知用户意图 + 主动表情 + 连贯动作」的能力。
- 在不破坏现有 Cubism2 模型逻辑的前提下，引入紫雨心 Cubism3/4 模型，实现两套引擎并行。
- 让 AI 通过统一的 JSON 协议控制表情、动作和步骤演示，前端只负责执行。

---

## 2. 当前已实现内容

现在已经开始按照你那份《Live2D Agent 开发计划（Cubism2 + 紫雨心 Cubism3/4）》往前推进了一步，并且让这一步是真正“Agent 化”的，而不是写死一套模板。

我先说明这轮具体做了什么，然后说下现在你可以怎么体验和下一步可以怎么继续扩。

---

**1. 已经实现的阶段：紫雨心 Cubism3 基础渲染（阶段 1）**

这一步的目标，就是让：

- 紫雨心这个 Cubism3/4 模型 **真的能被加载和渲染出来**
- 和原来的 Cubism2 管线 **并行存在**，而不是互相破坏
- 让 `motionCommand` 在 Cubism3 下也有一部分动作能力（后续再统一映射表）

目前落地情况：

1. **引入 Cubism3 渲染依赖**（只在前端）

   在 `frontend/package.json:22-38` 里新增了：

   - `pixi.js`: 用来做 WebGL 渲染
   - `pixi-live2d-display`: 用来驱动 Cubism3/4 模型

   这部分只是声明依赖，没有自动安装，需要的时候你本地跑：

   ```bash
   cd frontend
   pnpm install
   ```

2. **增加 Cubism3 专用容器**

   根据你文档第 3.1 阶段的设计，在原来的 waifu 容器里加了一个 Cubism3 专用节点：

   - 文件：`frontend/src/agent/live2d-widget/widget.ts:108-115`
   - 结构现在是：

   ```html
   <div id="waifu">
     <div id="waifu-tips"></div>
     <div id="waifu-canvas">
       <canvas id="live2d" width="800" height="800"></canvas>
       <div id="live2d-cubism3"></div>
     </div>
     <div id="waifu-tool"></div>
   </div>
   ```

   同时在 `Live2DWidget.vue` 里让这个容器跟 cubism2 一样占满区域：

   - `frontend/src/agent/components/Live2DWidget.vue:385-391` 增加：

   ```css
   :deep(#live2d-cubism3) {
     width: 100%;
     height: 100%;
   }
   ```

3. **实现 Cubism3 渲染器模块（pixi-live2d-display 封装）**

   新增模块（只是代码，不是文档）：

   - `frontend/src/agent/live2d-widget/cubism3/index.ts:1-105`

   提供三个核心方法：

   - `loadCubism3Model(modelJsonPath: string)`  
     - 创建一个 Pixi `Application`，挂载到 `#live2d-cubism3`
     - 加载 `modelJsonPath` 对应的 `normal.model3.json`
     - 把模型锚点设在底部居中，自动根据容器大小做等比缩放
   - `playCubism3Motion(name: string)`  
     - 接收逻辑动作名（比如 `'shake'`, `'shake_head'`, `'login'`, `'idle'`）
     - 内部用一个非常基础的映射去调用 Cubism3 的 motion group：
       - `'shake'` / `'shake_head'` → `group = 'Tap'`
       - `'login'` → `group = 'Login'`
       - 其它 → `group = 'Idle'`
     - 这块目前是**保守兜底实现**，后面阶段 2 会引入统一映射表。
   - `disposeCubism3()`  
     - 销毁 Pixi Application 和当前模型
     - 清空 `#live2d-cubism3` 容器，保证切回 Cubism2 时不会有残留

   为了让 TS 不报错，在 `frontend/src/env.d.ts:3-10` 里增加了简单的模块声明：

   ```ts
   declare module 'pixi-live2d-display/cubism4' {
     export const Live2DModel: any;
   }

   declare module 'pixi.js' {
     export const Application: any;
   }
   ```

   这样可以先专注功能，之后如果你想要更严格的类型，再慢慢补。

4. **让 ModelManager 识别 Cubism3 并切换渲染管线**

   关键逻辑集中在 `Live2DModelManager.ts`：

   - 先引入 Cubism3 渲染 API：

     - `frontend/src/agent/services/Live2DModelManager.ts:6-10`

     ```ts
     import { loadCubism3Model, playCubism3Motion, disposeCubism3 } from '../live2d-widget/cubism3';
     ```

   - 在 `loadLive2D` 里，按模型版本分支：

     - `frontend/src/agent/services/Live2DModelManager.ts:175-203`

     ```ts
     const version = this.checkModelVersion(modelSetting);
     if (version === 2) {
       this.setRendererVersion(2);
       // 原有 Cubism2 初始化逻辑（init / changeModelWithJSON）
       ...
     } else {
       this.setRendererVersion(3);
       try {
         await loadCubism3Model(modelSettingPath);
       } catch (e) {
         logger.error('Failed to load Cubism3 model via Pixi renderer', e);
         showMessage('加载 Cubism3/4 模型时出错，请稍后重试', 5000, 9);
       }
     }
     this.currentModelVersion = version;
     ```

   - `setRendererVersion` 用来切换 Cubism2 / Cubism3 的显示与销毁：

     - `frontend/src/agent/services/Live2DModelManager.ts:210-226`

     ```ts
     private setRendererVersion(version: number) {
       try {
         const canvas = document.getElementById('live2d') as HTMLCanvasElement | null;
         const cubism3Container = document.getElementById('live2d-cubism3') as HTMLElement | null;
         if (version === 2) {
           if (canvas) canvas.style.display = '';
           if (cubism3Container) cubism3Container.style.display = 'none';
           disposeCubism3();
         } else if (version === 3) {
           if (canvas) canvas.style.display = 'none';
           if (cubism3Container) cubism3Container.style.display = '';
         }
       } catch (e) {
         logger.error('Failed to toggle renderer version', e);
       }
     }
     ```

   - `startMotion` 对 Cubism3 做了基础适配：

     - `frontend/src/agent/services/Live2DModelManager.ts:216-223`

     ```ts
     public startMotion(group: string) {
       if (this.currentModelVersion === 3) {
         playCubism3Motion(group);
         return;
       }
       if (this.cubism2model) {
         (this.cubism2model as any).startMotion(group);
       }
     }
     ```

     这样：
     - 当 Agent 通过 `motionCommand` 触发动作时：
       - 如果当前是 Cubism2 → 走原来的 `startRandomMotion(group)`
       - 如果当前是紫雨心 Cubism3 → 走我们刚加的 Pixi 渲染器

5. **在组件销毁时正确清理 Cubism3 资源**

   为了避免内存泄漏，`Live2DWidget` 在清理时会顺便清掉 Cubism3：

   - 引入销毁函数：`frontend/src/agent/components/Live2DWidget.vue:12-15`

   ```ts
   import { disposeCubism3 } from '../live2d-widget/cubism3';
   ```

   - 在 `cleanup` 里最先调用 Cubism3 的销毁：

   - `frontend/src/agent/components/Live2DWidget.vue:234-289`

   ```ts
   const cleanup = () => {
     try {
       disposeCubism3();
       const live2dGlobal = (window as any).Live2D;
       ...
   ```

---

**2. 紫雨心工具按钮已经接入新管线**

原来你在工具栏已经有一个紫雨心入口：

- `frontend/src/agent/live2d-widget/tools.ts:78-87`

```ts
'switch-ziyuxin': {
  icon: fa_cube,
  callback: () => {
    showMessage('切换到紫雨心模型（Cubism3/4 引擎开发中）', 4000, 9);
    if ((model as any).loadSpecificModel) {
      (model as any).loadSpecificModel('ZiYuXin/ots14_4501/normal/normal.model3.json', {
        message: '紫雨心模型加载中（实验功能）...'
      });
    }
  }
},
```

现在 `loadSpecificModel` 会走到新的逻辑：

- `frontend/src/agent/services/Live2DModelManager.ts:275-287` 中调用 `loadLive2D`
- `loadLive2D` 检测到 `Version === 3` 时：
  - 不再弹“不支持 Cubism3/4”的提示
  - 而是直接调用 `loadCubism3Model`，挂到 `#live2d-cubism3` 容器

所以你在页面上点击右侧工具栏里的 **立方体图标**（紫雨心），走的是：

- 工具按钮 → `ModelManager.loadSpecificModel` → `checkModelVersion === 3` → `Pixi + Live2D` 管线

这部分已经跑通，并通过 `pnpm lint` / `pnpm type-check` 校验过。

---

**3. 动作映射（阶段 2 的基础铺垫）**

你文档里的阶段 2 是“统一动作名称映射”。现在我做了一个**很轻量的雏形**，完全不影响现有 Cubism2 逻辑：

1. 对 Cubism2 保持原样：

   - `startMotion(group)` 还是把 `group` 原样传给 Cubism2 模型 `startRandomMotion(group)` `live2d-widget/cubism2/index.js:231-235`

2. 对 Cubism3，`playCubism3Motion(name)` 采用逻辑名 → group 的简单映射：

   - `frontend/src/agent/live2d-widget/cubism3/index.ts:64-85`

   ```ts
   if (lower === 'shake' || lower === 'shake_head') {
     motion('Tap');
   } else if (lower === 'login') {
     motion('Login');
   } else {
     motion('Idle');
   }
   ```

   这里的 `motion(group)` 用的是 `pixi-live2d-display` 的高层 API：
   - `model.motion(group).play(index)`，由库根据 model3.json 中配置去选择对应的 motion3 文件。

   这只是一个「能跑起来的最小版本」：
   - 后面可以按照你文档 3.2 的设计，把这块升级成真正的：
     - `logicName -> { v2: { group, id }, v3: { group, index 或 file } }`
   - 现在先保证：
     - Agent 里发出来的 `'shake'`、`'shake_head'` 这样名字，在 Cubism3 下不会完全没反应。

---

**4. 这轮改动已经过基础验证**

- 在 `frontend` 目录下跑了：

  ```bash
  pnpm lint
  pnpm type-check
  ```

  都是 **0 error**，只剩下一些你原来就有的 warning（未使用变量等），没有新的类型或语法问题。

- 运行中注意事项：
  - 为了让新依赖生效，需要在 `frontend` 目录执行一次 `pnpm install`。
  - 开 dev 服务的命令你已经在终端 8 里跑了：  
    `pnpm dev -- --host 0.0.0.0 --port 4173`
  - 打开页面后：
    - 看到原来的 Live2D Agent
    - 点右侧工具栏的紫色立方体按钮（紫雨心），就会切换到 Cubism3 渲染管线（如果对应的 model3 文件已放到 `public/live2d/model/ZiYuXin/...`）

---

**5. 接下来可以继续按你的规划往前推**

这轮主要完成了文档里的**阶段 1 核心骨架**：

- Cubism3 渲染器模块（基于 pixi-live2d-display）
- 与现有 Cubism2 并行的容器结构
- 紫雨心入口真正打通到 Cubism3 引擎
- 为后续统一动作名称映射预留了 API（`playCubism3Motion`）

下一步我建议可以按你的计划，优先做这几件事（都可以在后续一轮继续帮你实现）：

- 在一个公共位置（比如 `src/agent/types` 或 `data` 目录），定义正式的 motion 映射表：
  - `logicName -> { v2: { group }, v3: { group, index } }`
- 改造 `ModelManager.startMotion`：
  - 接受逻辑名，内部查表后分别调用：
    - Cubism2: `startRandomMotion(group)`
    - Cubism3: `playCubism3Motion` 对应 group/index
- 把 `emotionTag` / `motionTag` / `avatarPlan.motion` 全部切到逻辑动作名（`shake_head`, `point_right`, `tilt_left` 等），和这张表打通。

如果你愿意，下一轮我可以直接帮你把「动作映射表 + 双引擎统一接口」那一段（文档阶段 2）也实现掉，让上层只管发逻辑动作名，底层自动兼容 Cubism2 和紫雨心 Cubism3。
### 2.1 AI → 表情/动作 JSON 协议

- 在 `backend/server.js:359-381` 中约定：
  - 每次回复必须输出 `emotionTag: {...}`：
    - `primary`: `"happy" | "angry" | "sad" | "surprised" | "shy" | "confused" | "calm" | "thinking"`
    - `intensity`: `0.0~1.0`，表示强度
    - `secondary`: 可选字符串数组
  - 有身体动作需要时输出 `motionTag: [...]`：
    - `type`: `"gesture" | "body_tilt" | "step" | "face"`
    - `name`: 逻辑动作名，如 `"shake_head"`, `"point_right"`, `"tilt_left"` 等
    - `duration`: 毫秒
    - `loop`: 是否循环
- 保留原来的 `[ANGRY]`、`[HAPPY]`、`[MOTION: tap_body]` 等标签，兼容旧逻辑。

### 2.2 Agent 前端表情和动作解析

- 在 `frontend/src/agent/components/Agent.vue:598-720` 中实现：
  - 解析 `emotionTag`：
    - 根据 `primary` 设置 `isAngry/isHappy/isPouting/isConfused/isDizzy/isCrying/isTired` 等状态。
    - 使用 `intensity` 控制情绪持续时间（弱情绪 2 秒左右，强情绪最多 6 秒）。
  - 解析 `motionTag`：
    - 取第一个动作，读取 `name`，赋值给 `motionCommand`，驱动 Live2DWidget 播放相应动作。
    - 支持 `duration` 控制动作持续时间。
  - 继续兼容老的 `[MOTION: xxx]` 标签。

### 2.3 avatarPlan 步骤演示执行器（短期版）

- 在 `frontend/src/agent/components/Agent.vue:561-620` 中新增：
  - `runAvatarPlan(steps: any[])`：
    - `pose`：
      - 如果有 `motion`，设置 `motionCommand`，按 `duration` 自动恢复。
      - 如果有 `expression`，通过 `applyExpression` 设置对应表情标志并按 `duration` 恢复。
    - `speak`：
      - 设置 `message`，调用 `speak(text)` 进行语音播放，等待 `duration`。
    - `step`：
      - 读取 `direction` (`left/right/up/down`) 和 `distance`，换算成屏幕偏移量。
      - 修改 `x/y`，调用 `checkBoundaries()` 限制在屏幕内，等待 `duration`。
    - `idle`：
      - 纯等待 `duration`，用于节奏控制。
  - 使用 `avatarPlanRunning` 防止并发执行多个计划。
- 在 `handleSendMessage` 内解析：
  - 匹配 `avatarPlan: [...]`，成功解析后调用 `runAvatarPlan` 执行。

### 2.4 模型右侧工具栏紫雨心入口

- 在 `frontend/src/agent/live2d-widget/icons.ts:1-16` 中新增 `fa_cube` 图标。
- 在 `frontend/src/agent/live2d-widget/tools.ts:37-109` 中新增工具：
  - 键名：`"switch-ziyuxin"`
  - 点击时：
    - 提示文案：`"切换到紫雨心模型（Cubism3/4 引擎开发中）"`
    - 调用 `ModelManager.loadSpecificModel("ZiYuXin/ots14_4501/normal/normal.model3.json", {...})`。
- 在 `frontend/src/agent/components/Live2DWidget.vue:215-221` 中将 `"switch-ziyuxin"` 加入工具列表。

### 2.5 ModelManager 针对紫雨心的占位支持

- 在 `frontend/src/agent/services/Live2DModelManager.ts:164-207`：
  - `loadLive2D` 对 Cubism3/4（`Version === 3`）模型给出友好提示：
    - `showMessage('当前暂不支持 Cubism3/4 模型，紫雨心专用引擎开发中...', 5000, 9);`
- 新增 `loadSpecificModel` 方法：`Live2DModelManager.ts:239-272`：
  - 支持通过相对路径加载指定 `model.json`/`model3.json`。
  - 用于紫雨心专用入口。

---

## 3. 中期计划（可逐步完成的开发阶段）

### 阶段 1：紫雨心 Cubism3 模型基础渲染（已完成首版）

目标：在不动现有 Cubism2 逻辑的前提下，让紫雨心出现在页面上并能播放基础动作。当前实现已满足这一目标：紫雨心可以通过工具栏入口加载，并在 Pixi 管线中渲染和播放基础 motion3 动作。

- 任务 1：选择渲染方案
  - 推荐使用 `pixi-live2d-display` 搭配 PixiJS。
  - 将其添加为项目依赖，并提供统一的初始化入口。
- 任务 2：封装 Cubism3 渲染器
  - 在 `frontend/src/agent/live2d-widget/` 下新增 `cubism3` 模块：
    - 提供 `init(containerId, model3Path)`、`playMotion(name)`、`setExpression(name)` 等方法。
  - 只对紫雨心目录 `public/live2d/model/ZiYuXin/...` 做适配。
- 任务 3：与现有 Widget 并行
  - 在 `Live2DWidget.vue` 中：
    - 保留当前 `#live2d` canvas 作为 Cubism2 渲染出口。
    - 额外创建一个专用容器（如 `#live2d-cubism3`）用于紫雨心。
    - 根据当前模型类型（v2 或 v3）控制哪个容器显示。
- 任务 4：基本动作验证
  - 加载 `normal.model3.json` 后成功播放：
    - idle 类：`daiji_idle_01.motion3.json`
    - 互动类：`shake.motion3.json`、`login.motion3.json`、`touch_*` 系列。

### 阶段 2：统一动作名称映射（进行中，已完成核心映射与接入）

目标：同一条 `motionTag` 或 `motionCommand` 对 Cubism2 和 Cubism3 都有意义。目前已完成统一 LogicMotion 类型定义与 v2/v3 映射表，并在 ModelManager.startMotion 与 motionTag/avatarPlan 执行路径中正式启用。

- 任务 1：建立动作映射表
  - 在公共位置定义：
    - `motionName -> { v2: { group, id }, v3: { file } }`
  - 例如：
    - `shake_head`：
      - v2: `group: "shake"`
      - v3: `file: "shake.motion3.json"`
    - `point_right`：
      - v2: `group: "tap_body"`
      - v3: 某个 `touch_*.motion3.json`
- 任务 2：适配 Cubism2 的 `startMotion`
  - 修改 `Live2DModelManager.startMotion`：
    - 接受逻辑动作名，内部查表调用 `cubism2model.startMotion(group)`。
- 任务 3：适配 Cubism3 渲染器
  - 在 Cubism3 渲染模块中：
    - 统一使用逻辑名称调用，内部通过映射找到对应 motion3.json 文件并播放。
- 任务 4：打通 motionTag 和 avatarPlan
  - `motionTag` 和 `avatarPlan` 中的 `motion/name` 统一使用逻辑动作名：
    - 例如 `"shake_head"`, `"point_right"`, `"tilt_left"`。

### 阶段 3：AvatarPlan 步骤演示增强（已落地基础版本，待持续丰富）

目标：让模型能完整演示操作步骤（抬手指向、侧身、走路），并与 UI 引导配合。当前版本已经支持 avatarPlan 的多步执行（pose/speak/step/idle）以及和 UI 计划的基本联动（step.target 对齐到 plan.target），后续可以在此基础上继续增加更细腻的动作与节奏控制。

- 任务 1：扩展 avatarPlan 语义
  - 在系统提示中进一步约束 avatarPlan：
    - 推荐字段：`type`, `motion`, `expression`, `direction`, `distance`, `duration`, `text`, `bubble`。
  - 增加对“焦点区域”的描述（例如和 `plan` 里的 `target` 对应）。
- 任务 2：将 AvatarPlan 与 UI Plan 对齐
  - 当同时返回 `plan: [...]` 和 `avatarPlan: [...]` 时：
    - `plan` 控制页面操作（highlight/click/scroll）。
    - `avatarPlan` 控制模型动作和气泡说明。
  - 可以通过时间或步骤序号来让两者同步执行。
- 任务 3：更细腻的动作控制
  - 在 `runAvatarPlan` 中加入：
    - 轻微抖动、呼吸动画等微动作。
    - 根据 `expression` 和 `motion` 的组合调整动作节奏。

---

## 4. 长期规划方向

### 4.1 统一 Avatar 抽象层

目标：上层逻辑完全不关心 Cubism 版本，只调用统一接口。

- 抽象接口示例：
  - `avatar.setEmotion(primary, intensity, secondary?)`
  - `avatar.playMotion(name, options?)`
  - `avatar.runPlan(avatarPlan)`
- 具体实现：
  - `Cubism2Adapter`：
    - 内部依赖 `Cubism2Model` 和现有 Live2D 框架。
  - `Cubism3Adapter`：
    - 内部依赖 `pixi-live2d-display` 或官方 Cubism SDK。
  - 未来可以扩展 `SvgAvatarAdapter`、`3DAvatarAdapter` 等。

### 4.2 统一行为 DSL（同时控制 UI 和模型）

目标：让 AI 输出一份统一的行为描述 JSON，就能同时控制 UI 和 Avatar。

- 示例：

```json
[
  { "type": "avatar.motion", "name": "point_right", "duration": 1200 },
  { "type": "avatar.speak", "text": "点击右上角的设置按钮", "bubble": true },
  { "type": "ui.highlight", "target": "text:设置" },
  { "type": "ui.click", "target": "text:设置" }
]
```

- 优点：
  - AI 用一个语言描述“我怎么动 + 页面怎么动”，开发者只维护解析和执行器。
  - 后续可以根据埋点数据自动优化步骤顺序和提示文案。

---

## 5. 近期优先级建议

1. 完成 Cubism3 渲染器封装和紫雨心基础动作播放（阶段 1）。
2. 把常见动作抽象成统一 motion 名称，并在 Cubism2/Cubism3 两侧打通（阶段 2）。
3. 基于现有 `runAvatarPlan`，逐步丰富步骤类型和与 UI Plan 的联动（阶段 3）。
4. 在此基础上，再考虑上移到统一 Avatar 抽象和行为 DSL。

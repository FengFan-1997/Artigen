时间：2025-12-16

本轮开发内容（Cubism3 命中区域 + 情绪联动增强）：

1. Cubism3 命中区域精确化
- 在 `frontend/src/agent/live2d-widget/cubism3/index.ts` 中修正 `hitTestCubism3` 坐标系：
  - 之前直接把 `event.clientX / clientY` 传给 `model.hitTest`，没有减去容器位置，导致命中区域在页面上“漂移”，点击头部有时不算头。
  - 现在会读取 `#live2d-cubism3` 的 `getBoundingClientRect()`，将屏幕坐标转换为模型本地坐标再调用 `model.hitTest(localX, localY)`，实现真正意义上的像素级命中。
- 影响：紫雨心 Cubism3/4 模型的头部、身体等 HitArea 判定会明显更准，后续所有“点头”“戳身体”逻辑都建立在更可靠的命中结果上。

2. Agent 点击行为与 HitArea 情绪联动
- 在 `frontend/src/agent/components/Agent.vue:488-580` 中增强统一点击处理逻辑：
  - 使用 `live2dWidgetRef.value?.hitTest(x, y)` 获取 Cubism3 HitArea 名称，并统一转为小写做语义判断。
  - 规则拆分：
    - 命中 `head` / `face` / `hair`：视为“摸头杀”。
      - 本地状态：`isHappy = true`，清除 `isAngry / isTired / isFainted`。
      - 能量恢复：`energy` 上升（上限 `MAX_ENERGY`），符合“摸摸头就有精神了”的设定。
      - 动作：触发逻辑动作 `flick_head`（通过 `playMotionInternal` -> `Live2DModelManager.startMotion` -> `MOTION_MAPPING` 映射到 Cubism3 `Tap` 组里对应动画）。
    - 命中 `body` / `chest` / `breast` / `bust` / `torso` 且确认为 Cubism3（`hitAreas.length > 0`）：
      - 本地状态：`isPouting = true`，体现傲娇害羞反应。
      - 文案：随机挑选一条“喂你手往哪儿放呢 / 不要乱戳啦”的傲娇台词。
      - 动作：触发逻辑动作 `mood_angry`，由 `MOTION_MAPPING` 映射为紫雨心 Tap 组中的偏生气/拒绝动作。
      - 上报：向对话历史静默追加一条系统事件，提示大脑“用户对身体区域做了稍微失礼的操作”，方便后续情绪回复更贴合人设。
    - 无命中或非 Cubism3：继续沿用旧的几何判定（顶部 30% 视为头部），保持对 Cubism2 的兼容。
- 这样，Cubism3 不再只是“有/没有被点中”，而是能根据真实 HitArea 做出细腻的傲娇反应。

3. 情绪到表情的统一映射（V2 + V3 共用）
- 在 `frontend/src/agent/components/Live2DWidget.vue:188-205` 中重写 `currentExpression` 计算逻辑：
  - 之前直接返回底层表达式 ID（如 `f02`, `f03`），虽然能工作，但难以从业务层理解，也无法利用 `EXPRESSION_MAPPING` 的 v2/v3 双引擎映射能力。
  - 现在统一返回逻辑表达式名：
    - `isFainted` / `isCrying` -> `sad`
    - `isDizzy` -> `dizzy`
    - `isAngry` -> `angry`
    - `isPouting` -> `shy`
    - `isConfused` -> `confused`
    - `isHappy` -> `happy`
    - 默认 -> `neutral`
  - 通过 `modelMgr.setExpression(exp)` -> `Live2DModelManager.setExpression` -> `EXPRESSION_MAPPING`，分别映射为：
    - Cubism2：`neutral/happy/...` -> `f01/f02/...`（旧模型习惯）。
    - Cubism3：同样的逻辑名 -> 对应 `Expressions` 中的 ID，保证两代模型在“高层语义”上一致。
- 效果：Agent 的布尔情绪状态（`isAngry / isHappy / isPouting / ...`）现在真正驱动了 Cubism3 的表情切换，不再只是动作层面的反馈。

4. 与现有 AvatarPlan / EmotionTag 协议的关系
- Click、本地眩晕检测、AI 返回的 `emotionTag` / `motionTag` 仍然经过 `Agent.vue` 里的状态机与 `avatarAdapter`：
  - `avatarAdapter.playMotion(name)` 始终使用逻辑动作名（如 `tap_body`, `mood_angry`），由 `MOTION_MAPPING` 自动路由到 V2 或 V3。
  - 表情层由本次改动统一走 `setExpression(logicName)`，实现“Cubism3 = 和 Agent 情绪同一套语义”。
- 这意味着：无论是 AI 决定“现在该害羞”、还是用户真实点击了“敏感区域”，最终都会收敛到同一套逻辑情绪 + 动作组合，体验更统一。

下一步可选计划（后续轮次再做）：

1. 读取紫雨心实际 `model3.json` 中的 HitArea 名称，建立更精细的命名映射（如 `HeadFront`、`HairBack`、`Skirt` 等），为更多体感互动预留空间。
2. 基于 Cubism3 的参数（如 `ParamBodyAngleX/Y`, `ParamCheek`）做更深入的“物理 + 心情联动”，让某些情绪不仅仅是表情文件，而是多参数综合驱动。
3. 为不同交互来源（AI 指令 / 用户点击 / 系统事件）设计优先级和冷却时间，避免短时间内频繁切换导致动作堆叠。


时间：2025-12-16

本轮开发内容（Cubism2 + 紫雨心 Cubism3/4 同步）：

1. 动作映射统一与 Cubism3 打通
- 在 `frontend/src/agent/data/motionMapping.ts` 中为 v3 映射补全真实可用的分组名字，区分 `Idle` 与 `Tap` 两类组，并通过 `V3_IDLE_GROUP`、`V3_TAP_GROUP` 常量统一管理。
- 现在所有逻辑动作名（如 `shake_head`、`point_right`、`step_forward` 等）在 Cubism3 下都会映射到对应的 motion group + index，不再出现 group 为空导致紫雨心模型“完全没反应”的情况。
- 在 `frontend/src/agent/services/Live2DModelManager.ts` 中优化 `startMotion`，对于找不到映射或 v3 配置不完整的情况，统一回退到 `playCubism3Motion(name)` 或 Cubism2 原始 `startMotion(name)`，确保兼容旧动作名。
- 这样一来：上层只要发逻辑动作名（来自 emotionTag、motionTag 或 avatarPlan），Cubism2 和 Cubism3 都能获得尽量接近的动作表现，真正做到双引擎共享一套动作语义。

2. avatarPlan 执行器能力增强（情绪与动作更细腻）
- 在 `frontend/src/agent/components/Agent.vue` 中扩展 `runAvatarPlan`：
  - 新增 `type: "motion"` 步骤：只执行 `motion` 字段对应的动作，用于纯动作过场。
  - 新增 `type: "expression"` / `type: "emotion"` 步骤：只执行表情变化，通过 `applyExpression` 驱动傲娇/害羞/生气等状态。
  - 对原有 `type: "speak"` 步骤增加可选字段：
    - `motion`: 说话时附带身体动作（例如边讲解边 `point_right` 指向目标区域）。
    - `expression`: 说话时同时切换表情（例如失败时自动带上 `shy`/`pout` 的傲娇表情）。
- 现有的 `pose`、`step`、`idle` 语义保持不变，上层可以自由组合：
  - 先 `pose`：站好、抬手指向；
  - 再 `speak`：配合 `motion + expression` 输出说明；
  - 穿插 `step`：走近指定 UI 元素或在屏幕上挪位；
  - 使用 `emotion`：在任务成功/失败后强化傲娇小萝莉的反馈。

3. 对整体 Agent 行为的影响
- Cubism2 与 紫雨心 Cubism3/4 现在共享同一套 `LogicMotion` 语义，motionTag 和 avatarPlan 里的动作名只需要关心“做什么”，不用关心底层是哪一套 Live2D 引擎。
- avatarPlan 已经可以描述更细腻的时序：动作 + 表情 + 文案三者同步，让“傲娇小萌妹”在引导用户操作时有更自然的表现力（例如先抬手指向，再一边讲解一边生气地摇头）。

下一步计划（未来轮次再做）：
- 根据紫雨心实际 `model3.json` 的 motion group 和文件配置，进一步精调每一个 LogicMotion 的 `group + index`，做到每个逻辑动作都有最贴合人设的动画。
- 在 avatarPlan 中加入简单的并行动作能力（例如一边走路一边说话），以及基于强度的节奏控制，让 AI 可以通过一个字段控制整段动作的“傲娇程度”和“活跃程度”。
- 将当前 `avatarAdapter` 抽象为统一 Avatar 接口，为后续接入非 Live2D 形象（SVG/3D 等）预留扩展空间。

如果你在体验中发现某些逻辑动作在紫雨心模型下表现不自然（例如动作太弱或完全没有效果），可以优先告诉我这些逻辑名，我可以在下一轮中针对它们优化 v3 映射表。


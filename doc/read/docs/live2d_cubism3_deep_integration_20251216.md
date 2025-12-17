# Cubism 3 深度集成开发报告

**时间**: 2025-12-16
**状态**: 已完成 (Deep Integration Phase 1 & 2)

## 1. 开发内容概览

本轮开发致力于将 Cubism 3 (V3) 模型的支持从“初步 Demo”提升至“深度集成”，重点增强了交互的自然度和动作的丰富性。

### 1.1 全方位头部与身体追踪 (Head & Body Tracking)
- **此前问题**: `setPointOfInterest` 仅设置了眼球参数 (`ParamEyeBallX/Y`)，导致角色只会动眼珠，头部和身体僵硬。
- **改进方案**: 在 `frontend/src/agent/live2d-widget/cubism3/index.ts` 中重写了 `setCubism3PointOfInterest`：
  - **头部转动**: 映射 `ParamAngleX` (左右), `ParamAngleY` (上下)。
  - **头部倾斜**: 自动计算 `ParamAngleZ` (基于 X*Y)，实现自然的头部倾斜效果。
  - **身体转动**: 映射 `ParamBodyAngleX`，让身体跟随鼠标微调。
- **效果**: 当用户移动鼠标时，Agent 会全方位地看向鼠标，表现更加生动自然。

### 1.2 动作组随机播放 (Random Motion Playback)
- **此前问题**: `playCubism3Motion` 如果不指定 index，行为未定义或固定播放第一个，导致交互重复。
- **改进方案**: 增加了逻辑判断，如果调用时未指定具体 index（例如点击身体触发 `TapBody` 组），代码会自动查询该组包含的动作数量，并随机选择一个播放。
- **效果**: 每次点击或交互时，Agent 会随机做出不同的反应（如果模型在该组有多个动作文件），减少重复感。

### 1.3 调试能力增强 (Debugging Capabilities)
- **新增功能**: 暴露了 `getCubism3HitAreas` 和 `getCubism3MotionGroups` 方法。
- **自动日志**: 在 `Live2DWidget` 初始化完成后，会自动在控制台输出当前模型支持的所有 **Hit Area 名称** 和 **Motion Group 名称**。
- **目的**: 这将极大方便后续精细化配置 `motionMapping.ts`，确保我们的逻辑动作名（如 `tap_head`）能准确映射到模型实际存在的组名。

## 2. AvatarPlan 深度开发 (Phase 2)

在初步集成的基础上，我们对 `AvatarPlan` 进行了深度扩展，使其支持更复杂的剧本编排和交互逻辑。

### 2.1 新增步骤类型
- **`BubbleStep`**: 显示气泡但不播放语音，用于“内心独白”或“静音提示”。
- **`EventStep`**: 触发自定义事件 (`agent-event`)，允许 Agent 与宿主应用（如打开页面、触发弹窗）进行双向通信。
- **`ConsoleStep`**: 调试用，在控制台输出信息。

### 2.2 移动与缩放增强 (`MoveStep`)
- **动态缩放**: 支持在 `move` 步骤中指定 `scale`，实现 Agent 的“变大变小”效果（例如表现惊讶或强调）。
- **瞬移支持**: 增加 `immediate: true` 选项，支持无动画的瞬间移动（Teleport），配合 `nextTick` 和过渡控制，实现平滑的“消失-出现”效果。
- **相对坐标**: 支持百分比坐标（如 `x: "50%"`），适配不同屏幕尺寸。

### 2.3 交互状态管理
- **`interactionState`**: 引入了完整的交互状态追踪，记录点击次数、鼠标绕圈角度等。
- **智能反馈**: Agent 现在能感知用户的连续点击或绕圈行为，并将这些“非语言交互”转化为文字描述发送给 AI 大脑，由 AI 决定如何回应（如“别转了，好晕！”）。

### 2.4 开发者工具
- **`window.runAgentPlan`**: 在全局暴露了执行计划的方法，方便开发者在控制台直接测试剧本。
- **测试脚本**: 提供了 `docs/avatar_plan_test.js`，包含多个测试用例。

## 3. 修改文件列表

1.  `frontend/src/agent/live2d-widget/cubism3/index.ts`: 核心逻辑更新 (Tracking, Random Motion, Debug Helpers)。
2.  `frontend/src/agent/services/Live2DModelManager.ts`: 暴露新的调试接口到 Manager 层。
3.  `frontend/src/agent/components/Live2DWidget.vue`: 初始化时调用调试接口并打印日志。
4.  `frontend/src/agent/components/Agent.vue`: 实现了 AvatarPlan 的深度逻辑、交互状态管理及调试接口。
5.  `frontend/src/agent/types/avatarPlan.ts`: 定义了全新的 AvatarPlan 类型系统。

## 4. 下一步计划

1.  **验证与微调**:
    - 观察控制台输出的 Hit Area 和 Motion Group，确认紫雨心模型的实际命名。
    - 根据实际命名优化 `motionMapping.ts`。
2.  **物理效果检查**:
    - 确认 `physics3.json` 是否正确加载并生效（摇动时头发/衣服是否摆动）。
3.  **表情与动作同步**:
    - 进一步测试 `Agent.vue` 中的情绪状态 (`isAngry`, `isShy`) 是否能正确驱动 V3 模型的表情切换。

## 5. 备注

- 请在浏览器控制台查看 `[Live2DWidget] Loaded Model Debug Info` 分组下的日志，以获取当前模型的详细配置信息。
- 使用 `window.runAgentPlan([...])` 测试复杂的动作编排。

# VRM 动作与情绪映射接入（2025-12-19）

## 本次完成

1. VRM 渲染支持“会动”
   - 加入 `THREE.AnimationMixer`：如果 VRM/GLTF 内带 `animations`，自动播放并支持基于 `motionCommand` 选择/切换动画片段。
   - 加入“无动画时也会动”的基础程序化动作：呼吸/轻微摆动/跟随指针看向，避免 VRM 永远静止。

2. Agent 状态与 VRM 表现联动
   - 将现有 Agent 的情绪与状态（`isTalking/isHappy/isAngry/isDizzy/isFainted/...`）透传到 VRM 渲染组件。
   - VRM 端根据状态做不同的表现（例如：说话更明显的上下浮动、开心的弹跳、生气的抖动、眩晕的旋转/摇晃、晕倒的侧躺与下沉）。

3. 工程校验
   - `pnpm run lint` 通过
   - `pnpm run type-check` 通过

## 关键改动文件

- `frontend/src/agent/components/Agent.vue`
- `frontend/src/agent/components/VrmWidget.vue`

## 下一步计划（2-5 个模块内）

1. VRM 的“语义点击区域”接入（Semantic Hit / Target）
   - 让 VRM 也能输出类似 `head/face/hair/accessory/body` 的 target，用于语义事件流与提示词。

2. VRM 表情与更真实的骨骼动作
   - 目前的“会动”以 AnimationMixer + 程序化动作为主；
   - 如果需要对 VRM 做眨眼、嘟嘴、脸红、看向目标、表情混合等更像 Live2D 的细致效果，通常需要引入 VRM 专用运行时（例如 `@pixiv/three-vrm`）来操作 `VRMHumanoid` / `BlendShape`。

3. 与 AI 的慢轨响应更紧密
   - 将 AI 返回的 `motionCommand` 更系统地映射到 VRM clip（名称约定/片段表）。

时间戳：2025-12-19


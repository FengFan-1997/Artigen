# Lumina Agent 运动与模型切换细化记录（Phase 12）

- 时间：2025-12-16
- 关联文件：
  - `frontend/src/agent/components/Agent.vue`
  - `frontend/src/agent/live2d-widget/tools.ts`

## 本次主要改动

1. 鼠标出入屏幕后「瞬移」问题优化  
   - 引入 `hasMouseMoved` 和 `isFollowingMouse` 状态，区分「跟随鼠标」和「自动漫游」两种模式。`frontend/src/agent/components/Agent.vue:93-97, 189-213, 451-468, 1121-1158`
   - 跟随鼠标模式下完全依赖 JS 的 `lerp` 插值移动，禁用容器上的 CSS 长时间过渡动画，避免位置计算和视觉位置不同步导致的瞬移感。`frontend/src/agent/components/Agent.vue:451-468, 1121-1158`

2. 左上方向无法正常跟随的问题修复  
   - 将边界处理拆成两层：  
     - `handleThrowCollisions` 只在拖拽结束时，根据 `lastVelocity` 判断是否算「被扔到边缘」，用于触发撞头和哭泣效果。`frontend/src/agent/components/Agent.vue:950-1049`
     - `checkBoundaries` 仅做简单的 0～max 范围夹紧，不再在正常移动过程中强制把 Y 推回到 60 像素高度，从而允许模型跟随到屏幕最上缘和最左侧。`frontend/src/agent/components/Agent.vue:999-1049`
   - 顶部和侧壁的「撞墙」反馈只会在用户主动拖拽并高速甩到边缘时触发，不会影响日常的鼠标跟随和漫游。

3. 跟随体验和实时反馈优化  
   - 将 `LERP_FACTOR` 从 `0.002` 提升到 `0.02`，显著提高跟随鼠标的响应速度，更接近「实时反应」的感觉。`frontend/src/agent/components/Agent.vue:422-429, 1121-1158`
   - 保留能量衰减与疲劳逻辑，但仅在确实发生位移时才衰减，空闲时会平滑恢复，避免长时间待机后状态异常。`frontend/src/agent/components/Agent.vue:1121-1163`

4. 模型切换体验打磨  
   - 在工具栏的「切换模型」按钮上增加即时反馈：点击后立刻通过 `showMessage('切换模型中...', 2000, 9)` 提示正在切换，减少用户对加载过程的焦虑感。`frontend/src/agent/live2d-widget/tools.ts:71-85`
   - 保持底层 `Live2DModelManager` 的缓存与热切换机制不变，仍然通过 `changeModelWithJSON` 复用 WebGL 上下文，控制切换成本。

## 已知仍然存在或需要后续深化的点

1. 模型切换本身仍然受限于 Live2D 模型体积和纹理加载时间，极端情况下首次加载某些模型时仍会有可见延迟，需要通过素材层面（贴图压缩、减少多余动作）继续优化。
2. 自动漫游目前仍主要依赖定时器触发随机位置跳转，如需更丝滑的「走路」效果，可以在后续版本中改为基于目标点的插值运动，并引入专门的漫游动作组。

## 下一步建议

1. 将「漫游运动」也改为统一的目标点插值运动，并结合 `isMoving` 状态设计更自然的 Live2D 动作组合（例如漫步、停留、观察）。
2. 在窗口尺寸变化和多屏切换场景下，增加一次性的位置重算逻辑，避免在极端分辨率变化后 Agent 偶尔出现在不好看的位置。


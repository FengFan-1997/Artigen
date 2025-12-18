时间：2025-12-18

本次内容（模块：模型切换/布局优化）

1) 修复 Cubism3 模型“上下切换”与“跨引擎切换”逻辑
- 之前的问题：`switch-model` 会在 Cubism2/Cubism3 的混合列表里顺序找下一个可用模型，导致你切到 Cubism3 后继续点“切换模型”可能又跳回 Cubism2（看起来像 Cubism3 切不出来/切不动）。
- 现在的逻辑：
  - 在 Cubism3 状态下：上下切换只会在 Cubism3 模型里找可用项。
  - 在 Cubism2 状态下：上下切换只会在 Cubism2 模型里找可用项。
  - 只有点击“切换类型（立方体 icon）”才会在 Cubism2/Cubism3 之间切换。
- 改动文件：
  - `frontend/src/agent/services/Live2DModelManager.ts`
  - `frontend/src/agent/live2d-widget/tools.ts`
  - `frontend/src/agent/components/Live2DWidget.vue`

2) 兼容 HuggingFace 与本地 `model_backup` 的目录差异 + index 路径差异
- 你的 HuggingFace 仓库根目录是 `model/`，本地是 `model_backup/`；同时 `model_index.json` 里部分 Cubism3 路径带 `shaoqian/` 前缀，而本地目录不带这个前缀。
- 现在的加载策略：
  - 自动在 `model` 与 `model_backup` 两个目录之间 fallback。
  - 自动尝试去掉 `shaoqian/` 前缀再加载一次（避免 404）。
- 改动文件：
  - `frontend/src/agent/services/Live2DModelManager.ts`

3) 优化 Cubism3 大模型显示（不截断）
- 目标：模型再大也不“裁切/截断”，而是优先自适应缩放到容器可视区域内。
- 做法：在原有的布局测量基础上，新增一次“溢出检测 -> 进一步缩放并重新对齐”的兜底逻辑。
- 改动文件：
  - `frontend/src/agent/live2d-widget/cubism3/index.ts`

本次验证
- `pnpm --dir frontend run type-check`：通过
- `pnpm --dir frontend run lint`：通过（仅 warnings，无 errors）
- 本地开发地址：`http://localhost:4000/`

下一步计划（建议）
1) 如果你希望“上下切换”必须严格只在“同一套角色/同一系列”里循环（而不是所有 Cubism3 全局混在一起），建议在 `model_index.json` 增加一个 `group` 字段（或从 path 推导），切换时按 group 过滤。
2) 针对首次切换时大量 404 的等待（因为 index 里有你本地不存在的 Cubism3 模型），可以做一次“可用模型预扫描 + 缓存”，把不可用项标记起来，后续切换就会很快。


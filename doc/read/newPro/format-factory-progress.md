# FormatFactory（格式工厂）当前实现与后续计划

更新时间：2026-01-07  
相关页面：[FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)  
核心状态逻辑：[useFormatFactory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useFormatFactory.ts)  
转换处理器：[processors.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/logic/formatFactory/processors.ts)  
工具清单：[formatFactoryTools.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/data/formatFactoryTools.ts)

## 1. 当前已实现（可用闭环）

### 1.1 页面与基础交互
- 首页入口与导航：页面包含固定顶部导航与工具卡片网格，点击卡片打开弹窗模式操作。
- 输入/输出面板三栏：输入文件、参数、输出与下载。
- 本地处理承诺：页面文案强调“纯前端处理”，不上传文件。
- 统一状态管理：所有工具共享同一套 `sourceFile/sourceUrl/outputBlob/outputUrl/isProcessing/toolError` 状态。

### 1.2 工具列表（8 个 Ready）
工具数据集中在：[formatFactoryTools.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/data/formatFactoryTools.ts)
- webp：WebP/PNG/JPEG 转换（双向）  
- jpeg：JPEG 压缩（质量 + 最长边）  
- watermark：图片去水印（框选 + 模糊/马赛克/纯色覆盖 + 导出）  
- live：视频选帧导出（时间轴 + 格式/质量）  
- pdf：PDF 转图片（单页或拼接长图）  
- img2pdf：图片转 PDF（多选输入，多页 PDF）  
- gif：视频转 GIF（开始/时长/fps/宽度/颜色数）  
- ico：ICO 生成（多尺寸勾选生成 .ico）

### 1.3 文件类型限制（accept）
集中在：[accept.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/logic/formatFactory/accept.ts)
- img2pdf 支持多选提示（“可多选”）
- pdf 提示建议小于 20MB

### 1.4 具体转换实现

#### 图片格式与压缩
- `convertImage`：PNG/JPEG/WEBP 互转（Canvas 导出）
- `convertToJpeg`：JPEG 压缩（支持最长边缩放）
- `generateIco`：生成标准 `.ico`（内部构建 ICO header + PNG 数据块）

#### PDF 转图片（pdfjs-dist）
- `getPdfPageCount`：读取页数（设置 pdf worker）
- `pdfToImage`：
  - mode=page：导出指定页
  - mode=stitch：拼接前 N 页为长图（默认限制 12 页）

#### 图片转 PDF（纯前端写 PDF）
- `imagesToPdf`：将多张图片压缩为 JPEG 并写入 PDF（支持 A4 或跟随图片尺寸、边距、质量）

#### 视频转 GIF（gifenc）
- `videoToGif`：按 fps 抽帧 -> quantize 调色板 -> 写入 GIF
- 内置保护：最大时长 10s、fps 2~24、宽度 120~960、颜色数 16~256

## 2. 本轮补齐/修复点（相对“之前拆分后继续开发”）

### 2.1 打通 PDF / img2pdf / GIF 的 UI 参数与 runTool 分支
- 页面新增三种工具的参数面板（PDF：模式/页码/清晰度/格式/质量；img2pdf：页面尺寸/边距/质量；GIF：开始/时长/fps/宽度/颜色数）
- `img2pdf` 输入支持多选（`<input type="file" multiple>`）
- `useFormatFactory.runTool` 增加 `pdf/img2pdf/gif` 三个分支，输出 blob 统一走下载

对应代码：
- [FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)
- [useFormatFactory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useFormatFactory.ts)
- [processors.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/logic/formatFactory/processors.ts)

### 2.2 统一错误提示（避免直接抛内部错误码）
- 增加 `toUserError` 映射常见错误码（Canvas/Video 加载/seek 等）
- 让用户在 UI 看到更可读的中文错误

### 2.3 类型检查与依赖问题修复
- 由于 `gifenc` 无内置类型声明，补充了模块声明到：[env.d.ts](file:///g:/AvuePro/newPro/frontend/src/env.d.ts)
- 已通过 `vue-tsc -b` 与 `eslint . --fix` 验证（本地环境 husky prepare 会因缺少 .git 报错，不影响运行）

## 3. 距离“理想模板/完整版”还差什么（按优先级）

### P0（影响稳定性/可用性）
- 批量处理统一入口：目前只有 img2pdf 多选，其他工具仍为单文件处理。
- 大文件/长任务进度：PDF 拼接、视频转 GIF 等没有进度条与取消能力。
- 输出预览策略：PDF/IMG2PDF 输出是文件类型（png/pdf），目前只做下载提示；可补预览入口（新标签打开或内嵌）。

### P1（功能完整度）
- PDF 更多能力：
  - 自定义导出页范围（如 1-3,5,8）
  - 单页导出时页码合法性提示（已做 clamp，但 UI 没提示）
  - 长图拼接的背景色/页间间距设置
- GIF 更多能力：
  - 预估输出大小提示（基于 width、fps、duration 粗略估算）
  - 质量/速度预设（fast/balanced/high）
- 去水印升级：
  - 多选区支持
  - 边缘羽化/修复策略更自然（目前是 blur/pixelate/fill）

### P2（产品化/工程化）
- 工具扩展机制：现在 `runTool` 用 if 链分发，后续可抽象成 `toolId -> handler` 映射以便扩展更多工具。
- 统一“文件处理管线”：输入校验、元信息解析、输出命名、错误映射、URL revoke 的通用层。
- 国际化：当前文案都是中文，尚未接入已有语言 store 的多语言资源。

## 4. 推荐的下一步计划（可直接落地）

### 4.1 批量处理（第一阶段）
- 为 webp/jpeg/ico 增加多文件选择模式：
  - 输入支持 `multiple`
  - 输出打包（zip）或逐个下载（队列）
- 增加处理队列 UI：任务列表 + 每项状态（等待/处理中/完成/失败）

### 4.2 进度条与取消
- PDF 拼接：按页渲染更新进度（i / total）
- GIF 生成：按帧写入更新进度（frame / total）
- 为耗时任务增加 AbortController 风格的“取消”按钮（前端逻辑上终止后续循环并清理 URL）

### 4.3 输出体验
- 对 PDF 输出提供：
  - “打开预览”按钮（`URL.createObjectURL(blob)` + `window.open`）
- 对 GIF 输出提供：
  - 输出预览（页面右侧预览区直接 `<img :src="outputUrl">` 已支持）

## 5. 关键文件索引
- 视图：[FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)
- 状态与交互：[useFormatFactory.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/composables/useFormatFactory.ts)
- PDF/GIF/图像处理：[processors.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/logic/formatFactory/processors.ts)
- Accept 与提示：[accept.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/logic/formatFactory/accept.ts)
- 工具数据：[formatFactoryTools.ts](file:///g:/AvuePro/newPro/frontend/src/agentImg/data/formatFactoryTools.ts)
- 三方类型补丁：[env.d.ts](file:///g:/AvuePro/newPro/frontend/src/env.d.ts)


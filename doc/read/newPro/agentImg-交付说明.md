# agentImg 子项目交付说明

## 访问入口

- 主站首页（作品集）：`/`
- agentImg 子项目首页：`/agentimg`
- AI 工坊工具页：`/agentimg/ai`
- 格式工厂：`/agentimg/format-factory`
- 算力商城：`/agentimg/market`
- 法务页面：
  - 服务条款：`/agentimg/legal/terms`
  - 隐私政策：`/agentimg/legal/privacy`
  - 退款政策：`/agentimg/legal/refund`

## 兼容跳转（旧链接仍可用）

以下旧路径会自动跳转到新路径：

- `/agent-img` → `/agentimg/ai`
- `/format-factory` → `/agentimg/format-factory`
- `/aether-market` → `/agentimg/market`
- `/legal/terms` → `/agentimg/legal/terms`
- `/legal/privacy` → `/agentimg/legal/privacy`
- `/legal/refund` → `/agentimg/legal/refund`

## 已完成的功能

### 1) 格式工厂：8 个工具可用（纯前端本地处理）

入口：[FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)

- WebP 转换器（支持多文件批量）
  - 支持输入：PNG / JPEG / WEBP
  - 支持输出：WEBP / JPEG / PNG
  - 可调质量（WEBP/JPEG）
- JPEG 压缩器（支持多文件批量）
  - 支持输入：PNG / JPEG / WEBP
  - 输出：JPEG
  - 可调质量
  - 支持“最长边”缩放（可选）
- ICO 生成器（支持多文件批量）
  - 支持输入：PNG / JPEG / WEBP
  - 输出：ICO（包含多尺寸 PNG 图标）
  - 可选尺寸：16/32/48/64/128/256
- 图片去水印
  - 支持输入：PNG / JPEG / WEBP
  - 手动框选区域，支持模糊/马赛克/纯色覆盖
  - 可选导出格式与质量
- Live Photo 转换器（当前为视频选帧）
  - 支持输入：视频文件（取决于浏览器解码能力）
  - 通过时间轴截取当前帧，导出 PNG/JPEG/WEBP
  - HEIC 相关能力暂未接入
- PDF 转图片
  - 支持单页导出
  - 支持多页拼接长图（默认限制页数，避免过慢）
- 图片转 PDF
  - 支持多选输入，合成多页 PDF
  - 支持 A4 或跟随图片尺寸、边距与质量
- 视频转 GIF
  - 支持开始/时长/fps/宽度/颜色数参数
  - 内置保护：最长 10s，建议文件小于 20MB

使用方式：

1. 进入“格式工厂”，点击工具卡片。
2. 选择文件 → 配置参数 → 点击“开始处理” → “下载”（批量工具可“下载全部”）。

### 2) agentImg 页面风格与导航统一

已在以下页面加入统一的顶部导航（与 agentImg 首页风格一致）：

- [FormatFactory.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/FormatFactory.vue)
- [AetherMarket.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/AetherMarket.vue)
- 法务页面：
  - [TermsOfService.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/legal/TermsOfService.vue)
  - [PrivacyPolicy.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/legal/PrivacyPolicy.vue)
  - [RefundPolicy.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/views/legal/RefundPolicy.vue)

底部法务链接已修正为 `/agentimg/legal/*`：

- [GlobalFooter.vue](file:///g:/AvuePro/newPro/frontend/src/agentImg/components/GlobalFooter.vue)

### 3) 作品集项目入口

作品集“项目”中已确保能进入 agentImg 路径与算力商城：

- [ProjectsSection.vue](file:///g:/AvuePro/newPro/frontend/src/components/ProjectsSection.vue)

## 目前暂未实现/待增强（工程化项）

- 批量下载打包 zip（当前为逐个下载）
- 大任务进度与更细粒度的取消/恢复（PDF 拼接、GIF 生成可继续优化）
- 去水印多选区、羽化/更自然的修复策略

## 校验结果

已通过：

- `pnpm --dir frontend run type-check`
- `pnpm --dir frontend run lint`


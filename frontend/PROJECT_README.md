# Artigen - AI 影像工坊与格式工厂

## 1. 项目简介 (Project Overview)
**Artigen** 是一个集成了 **AI 图像生成**、**纯前端格式工厂** 和 **算力商城** 的一站式影像处理平台。
项目采用现代化的前端架构，强调 **隐私安全（纯前端处理）**、**高性能交互** 与 **赛博朋克风格** 的视觉体验。

## 2. 技术栈 (Tech Stack)

### 核心框架 (Core)
- **Framework:** Vue 3 (Composition API)
- **Build Tool:** Vite 5
- **Language:** TypeScript 5.6
- **State Management:** Pinia (支持持久化/Persistence)
- **Routing:** Vue Router 4 (支持动态 SEO Meta)

### UI 与 交互 (UI & Interaction)
- **Component Library:** Ant Design Vue 4.x
- **Styling:** Custom CSS Variables (Dark/Cyberpunk Theme), Less
- **Animations:** GSAP, CSS Keyframes
- **Icons:** FontAwesome, Ant Design Icons

### 图形与 AI 引擎 (Graphics & AI)
- **3D Rendering:** Three.js (VRM 模型渲染)
- **2D Rendering:** Pixi.js (Live2D 模型渲染)
- **Computer Vision:** MediaPipe (@mediapipe/hands - 手势识别)
- **Visualization:** ECharts 6 (数据可视化)
- **Image Processing:**
  - Native Canvas API (图像缩放、裁剪、水印)
  - `gifenc` (GIF 处理)
  - `pdfjs-dist` / `pptxgenjs` (文档处理)

### 工程化与性能 (Engineering)
- **Linting:** ESLint 9 + Prettier
- **Optimization:**
  - Route Lazy Loading (路由懒加载)
  - `vue3-lazyload` (图片懒加载支持)
  - Client-side Processing (减少服务器带宽，保护隐私)
- **SEO:** Dynamic Meta Tags (Title, Description, Keywords, OG Tags) via Router Guards

## 3. 核心功能模块 (Key Features)

### 3.1 AI 工坊 (AI Workshop)
- **文生图/图生图:** 集成大模型 API（如 SiliconFlow），支持 Prompt 优化。
- **多语言支持:** 界面与提示词全链路中英双语切换。

### 3.2 格式工厂 (Format Factory)
- **隐私安全:** 所有图片转换（WebP/JPEG/PNG）、去水印、尺寸调整均在浏览器本地完成，无需上传服务器。
- **高性能:** 利用 Canvas 与 Blob API 实现毫秒级处理。

### 3.3 算力商城 (Compute Market)
- **虚拟化资源:** 模拟 GPU 算力租赁与点数充值流程。
- **控制台:** 完整的用户管理、账单审计与用量监控 Dashboard。

### 3.4 国际化 (I18n)
- **深度集成:** Pinia 管理语言状态 (`zh`/`en`)，通过 `localStorage` 持久化。
- **全站覆盖:** 路由 Meta、页面文案、动态组件、Canvas 绘图文案均已适配。

## 4. 目录结构 (Directory Structure)
```
frontend/src/
├── agentImg/           # Artigen 核心业务模块
│   ├── components/     # 业务组件 (TitleBar, GlobalFooter)
│   ├── composables/    # 逻辑复用 (useFormatFactory)
│   ├── logic/          # 纯逻辑/算法 (processors, canvas)
│   └── views/          # 页面视图 (LandingPage, FormatFactory)
├── console/            # 后台管理控制台模块
├── stores/             # Pinia 状态管理 (language, user)
├── router/             # 路由配置 (含 SEO 守卫)
└── assets/             # 静态资源
```

## 5. 性能与 SEO 检查报告
- **SEO:** 路由级动态 Meta 标签已配置，支持 Twitter Cards 与 Open Graph。
- **Performance:** 关键组件异步加载，图片懒加载已启用。
- **I18n:** 语言切换无刷新损耗，状态持久化正常。
- **Error Handling:** 全局错误拦截与友好的多语言错误提示。

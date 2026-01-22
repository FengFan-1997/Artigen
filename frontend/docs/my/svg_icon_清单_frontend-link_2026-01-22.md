# frontend-link SVG icon 清单（含用途/含义 + 文件位置）

生成时间：2026-01-22  
范围：`g:\AvuePro\newPro\backend\frontend-link`（仅统计项目源码与 public；不含 node_modules 内海量第三方 SVG）

---

## 1) 本地 SVG 文件（文件本体在仓库里）

### 1.1 src/assets

| 名称 | 含义/用途 | SVG 文件位置 |
|---|---|---|
| Vue Logo | Vue 生态/模板自带 logo（当前未发现被代码引用） | `g:\AvuePro\newPro\backend\frontend-link\src\assets\vue.svg` |

### 1.2 public/backgrounds/ai-bg（AI 背景风格预设）

这些 SVG 作为“背景风格”供 [AiBackgroundPopup.vue](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue) 的 `PRESETS` 选择使用（`src: '/backgrounds/ai-bg/xxx.svg'`）。

| 预设 id | 标题（中文/英文） | 含义/用途 | 代码引用位置 | SVG 文件位置 |
|---|---|---|---|---|
| studio-white | 纯白摄影棚 / White studio | 电商：纯白棚拍背景 | [AiBackgroundPopup.vue#L273-L284](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L273-L284) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\studio-white.svg` |
| studio-dark | 暗色摄影棚 / Dark studio | 电商：暗色棚拍背景 | [AiBackgroundPopup.vue#L285-L295](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L285-L295) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\studio-dark.svg` |
| tabletop-wood | 木质桌面 / Wood tabletop | 电商：木桌台面陈列 | [AiBackgroundPopup.vue#L296-L306](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L296-L306) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\tabletop-wood.svg` |
| indoor-sunlight-shadow | 窗边光影 / Sunlight window | 电商：窗边自然光影 | [AiBackgroundPopup.vue#L307-L317](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L307-L317) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\indoor-sunlight-shadow.svg` |
| indoor-wood-counter | 木质吧台 / Wood counter | 电商：吧台/台面场景 | [AiBackgroundPopup.vue#L318-L328](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L318-L328) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\indoor-wood-counter.svg` |
| nature-podium-cloud | 云端展台 / Cloud podium | 电商：云端展台/漂浮感 | [AiBackgroundPopup.vue#L329-L338](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L329-L338) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\nature-podium-cloud.svg` |
| cafe | 咖啡馆 / Cafe | 日常：咖啡馆氛围背景 | [AiBackgroundPopup.vue#L339-L349](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L339-L349) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\cafe.svg` |
| indoor-table-plant | 居家圆桌 / Living room table | 日常：室内圆桌+植物 | [AiBackgroundPopup.vue#L350-L360](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L350-L360) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\indoor-table-plant.svg` |
| neon-city | 霓虹城市夜景 / Neon city night | 人物：霓虹夜景人像背景 | [AiBackgroundPopup.vue#L361-L371](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L361-L371) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\neon-city.svg` |
| ocean | 海边日落 / Ocean sunset | 风景：海边日落氛围 | [AiBackgroundPopup.vue#L372-L382](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L372-L382) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\ocean.svg` |
| mountains | 群山薄雾 / Misty mountains | 风景：群山薄雾层次 | [AiBackgroundPopup.vue#L383-L393](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L383-L393) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\mountains.svg` |
| forest | 森林光斑 / Forest light | 风景：森林体积光/光斑 | [AiBackgroundPopup.vue#L394-L404](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L394-L404) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\forest.svg` |
| nature-water-surface | 清透水面 / Water ripple | 风景：水面波纹/焦散 | [AiBackgroundPopup.vue#L405-L415](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L405-L415) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\nature-water-surface.svg` |
| nature-beach-soft | 柔和沙滩 / Soft beach | 风景：柔和沙滩海景 | [AiBackgroundPopup.vue#L416-L427](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/AiBackgroundPopup.vue#L416-L427) | `g:\AvuePro\newPro\backend\frontend-link\public\backgrounds\ai-bg\nature-beach-soft.svg` |

---

## 2) 内联 SVG（模板里直接写 <svg>）

| Icon/模块 | 含义/用途 | 代码位置（起始行附近） |
|---|---|---|
| 聊天用户头像（人物轮廓） | Chat UI 中“用户消息”头像 | [index.vue#L155-L164](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/index.vue#L155-L164) |
| 聊天用户头像（人物轮廓，pending 状态） | pending 用户消息头像 | [index.vue#L222-L230](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/index.vue#L222-L230) |
| 轮播上一张（左箭头） | HeroCarousel 上一张按钮 | [HeroCarousel.vue#L32-L47](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/HeroCarousel.vue#L32-L47) |
| 轮播下一张（右箭头） | HeroCarousel 下一张按钮 | [HeroCarousel.vue#L48-L62](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/HeroCarousel.vue#L48-L62) |
| Agent 设置入口（用户形状） | PortfolioHome 顶部“Agent Settings”按钮图标 | [PortfolioHome.vue#L19-L39](file:///g:/AvuePro/newPro/backend/frontend-link/src/views/PortfolioHome.vue#L19-L39) |
| GitHub | 社交链接按钮 | [SocialLinks.vue#L1-L19](file:///g:/AvuePro/newPro/backend/frontend-link/src/components/SocialLinks.vue#L1-L19) |
| Twitter | 社交链接按钮 | [SocialLinks.vue#L20-L36](file:///g:/AvuePro/newPro/backend/frontend-link/src/components/SocialLinks.vue#L20-L36) |
| LinkedIn | 社交链接按钮 | [SocialLinks.vue#L37-L55](file:///g:/AvuePro/newPro/backend/frontend-link/src/components/SocialLinks.vue#L37-L55) |
| Pin/定位（Marker） | “Pin Agent” 固定到左下角的按钮图标 | [SocialLinks.vue#L56-L77](file:///g:/AvuePro/newPro/backend/frontend-link/src/components/SocialLinks.vue#L56-L77) |
| 连接线箭头/发光点 | Agent 指向目标的连接线（箭头 marker + glow filter） | [ConnectionLine.vue#L1-L36](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/components/ConnectionLine.vue#L1-L36) |
| 引导覆盖层箭头 | GuideOverlay 中从 Agent 指向目标的曲线箭头 | [GuideOverlay.vue#L12-L36](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/components/GuideOverlay.vue#L12-L36) |
| 技能圆环进度条 | SkillsSection 的环形进度图（渐变 + glow） | [SkillsSection.vue#L14-L50](file:///g:/AvuePro/newPro/backend/frontend-link/src/components/SkillsSection.vue#L14-L50) |
| 安全评分圆环 | CodeGuardian 的 Security Score 圆环 | [CodeGuardian.vue#L101-L121](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/CodeGuardian.vue#L101-L121) |
| 仪表盘折线/蜡烛图画布 | NexusDashboard 的主图表 SVG 容器 | [NexusDashboard.vue#L83-L110](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/NexusDashboard.vue#L83-L110) |
| 简历匹配评分圆环 | ResumeForge 的 MATCH 分数环形条 | [ResumeForge.vue#L69-L88](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/ResumeForge.vue#L69-L88) |
| Agent 角色头发（后发） | AgentCharacter 角色发型装饰 | [AgentCharacter.vue#L18-L24](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/components/AgentCharacter.vue#L18-L24) |
| Agent 角色头发（前刘海） | AgentCharacter 角色刘海装饰 | [AgentCharacter.vue#L59-L83](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/components/AgentCharacter.vue#L59-L83) |

---

## 3) 字符串形式 SVG（TS 中保存为 SVG 字符串）

### 3.1 Live2D 小工具（waifu-tool）图标

SVG 定义在 [icons.ts](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts)，使用在 [tools.ts](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts) 的 ToolsManager 配置里。

| 变量名 | 含义/用途 | SVG 定义位置 | 使用位置 |
|---|---|---|---|
| fa_comment | Chat（打开聊天/切换聊天窗口） | [icons.ts#L1-L3](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L1-L3) | [tools.ts#L60-L72](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L60-L72) |
| fa_quote_left | Hitokoto（一言） | [icons.ts#L13-L15](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L13-L15) | [tools.ts#L73-L91](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L73-L91) |
| fa_street_view | Switch model（切换模型） | [icons.ts#L4-L6](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L4-L6) | [tools.ts#L92-L98](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L92-L98) |
| fa_arrow_up | Previous model（上一个模型） | [icons.ts#L19-L21](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L19-L21) | [tools.ts#L99-L107](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L99-L107) |
| fa_arrow_down | Next model（下一个模型） | [icons.ts#L22-L24](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L22-L24) | [tools.ts#L108-L114](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L108-L114) |
| fa_cube | Toggle model version/type（切换模型类型/版本） | [icons.ts#L16-L18](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L16-L18) | [tools.ts#L115-L123](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L115-L123) |
| fa_shirt | Switch texture（换装/随机贴图） | [icons.ts#L7-L9](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L7-L9) | [tools.ts#L124-L135](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L124-L135) |
| fa_camera_retro | Photo（截图/保存画布为图片） | [icons.ts#L10-L12](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/icons.ts#L10-L12) | [tools.ts#L136-L154](file:///g:/AvuePro/newPro/backend/frontend-link/src/agent/live2d-widget/tools.ts#L136-L154) |

---

## 4) data URI SVG（CSS 里内嵌的小图标/纹理）

| 模块 | 含义/用途 | 代码位置 |
|---|---|---|
| 下拉框箭头（chevron down） | FormatFactory 里的 `<select>` 右侧箭头 | [FormatFactory.vue#L2194-L2200](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/views/FormatFactory.vue#L2194-L2200) |
| 下拉框箭头（三角） | PortfolioHome 的 agent settings `<select>` 箭头 | [PortfolioHome.vue#L576-L593](file:///g:/AvuePro/newPro/backend/frontend-link/src/views/PortfolioHome.vue#L576-L593) |
| 背景纹理（十字/加号平铺） | AiPptGen 页面背景纹理 | [AiPptGen.vue#L427-L437](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/AiPptGen.vue#L427-L437) |
| 背景噪声（feTurbulence） | TravelPlanner 噪声蒙版 | [TravelPlanner.vue#L219-L230](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/TravelPlanner.vue#L219-L230) |
| 背景噪声（feTurbulence） | StoryTeller 噪声蒙版 | [StoryTeller.vue#L186-L197](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/StoryTeller.vue#L186-L197) |
| 背景噪声（feTurbulence） | ResumeForge 噪声蒙版 | [ResumeForge.vue#L228-L238](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/ResumeForge.vue#L228-L238) |
| 背景噪声（feTurbulence） | CodeGuardian 噪声蒙版 | [CodeGuardian.vue#L275-L283](file:///g:/AvuePro/newPro/backend/frontend-link/src/project/CodeGuardian.vue#L275-L283) |

---

## 5) 动态生成/导出的 SVG（用于生成配料表/标签）

| 模块 | 含义/用途 | 代码位置 |
|---|---|---|
| 配料表 SVG 生成（agentImg 版） | `buildIngredientLabelSvg()` 生成完整 SVG 字符串；`buildIngredientLabelSvgUrl()` 转为 `data:image/svg+xml` | [ingredientLabel.ts#L851-L867](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/logic/formatFactory/ingredientLabel.ts#L851-L867) |
| 配料表 SVG 生成（Ingredient 工具版） | 生成 `finalSvg` 并转 data URL 返回 | [generateImageWithAI.ts#L872-L885](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/utils/generateImageWithAI.ts#L872-L885) |
| 空白占位 SVG（白底黑框） | 初始预览占位（避免空白） | [Ingredient/index.vue#L40-L42](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L40-L42) / [IngredientLabel.vue#L65-L67](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/views/IngredientLabel.vue#L65-L67) |
| 导出文件名 `ingredients.svg` | 下载 SVG 时使用的文件名 | [Ingredient/index.vue#L261-L265](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L261-L265) / [IngredientLabel.vue#L434-L440](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/views/IngredientLabel.vue#L434-L440) |

---

## 6) 外部 SVG（URL 引用，文件不在本仓库）

这些 SVG 通过 `https://cdn.packify.ai/image/... .svg` 引用，实际图形需访问该 URL 才能看到；此处根据“使用场景”给出含义。

| URL（末段） | 含义/用途 | 代码位置 |
|---|---|---|
| 9285df4e-a3b7-4d4c-8e40-537dea15ae08.svg | PNG 下载选项 icon | [Ingredient/index.vue#L308-L323](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L308-L323) / [IngredientLabel.vue#L483-L499](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/views/IngredientLabel.vue#L483-L499) |
| 4243bd45-7dd6-44e5-9176-9887062b197c.svg | SVG 下载选项 icon | 同上 |
| 1263cda7-1751-4833-9064-8b1f12ade129.svg | PDF 下载选项 icon | 同上 |
| 0a0ab795-dc73-476b-8de8-3c7add824da3.svg | Generate 按钮 loading 图标 | [Ingredient/index.vue#L438-L452](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L438-L452) / [IngredientLabel.vue#L705-L718](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/views/IngredientLabel.vue#L705-L718) |
| 9e25c93e-da3f-452e-962f-13e959ff632f.svg | Back 按钮 icon | [Ingredient/index.vue#L484-L496](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L484-L496) |
| 31ffedbf-fd56-4280-a55f-9cc1bc2cf848.svg | Download 按钮 icon | [Ingredient/index.vue#L498-L509](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L498-L509) |
| 704466e6-ea37-4ea5-9821-1014fbb93a75.svg | Modal 关闭（X）icon | [Ingredient/index.vue#L568-L578](file:///g:/AvuePro/newPro/backend/frontend-link/src/Ingredient/index.vue#L568-L578) |
| 8cfedda5-f070-4102-8dfd-33593ac1a29a.svg | 下拉箭头 icon（产品类型选择器） | [IngredientLabelTypeSelect.vue#L62-L74](file:///g:/AvuePro/newPro/backend/frontend-link/src/agentImg/components/IngredientLabelTypeSelect.vue#L62-L74) |


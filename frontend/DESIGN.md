---
name: Artigen Unified Agent Workspace
description: Codex-class three-lane design workspace with Artigen execution signals.
colors:
  dark-background: "#111311"
  dark-sidebar: "#1B1E1B"
  dark-surface: "#232622"
  dark-border: "#3A3F38"
  dark-text: "#F3F4EF"
  muted: "#A1A79B"
  light-background: "#F4F5F1"
  light-sidebar: "#E9ECE6"
  light-surface: "#FFFFFF"
  light-border: "#D8DDD3"
  light-text: "#171A16"
  execution: "#C8FF3D"
  danger: "#FF6B62"
  warning: "#F1BD4F"
  success: "#69D59A"
---

# Artigen Unified Agent Workspace

## Product thesis

Artigen 的 Agent 页面是一套持续任务空间，不是营销 Hero、配置后台或普通聊天软件。用户在左侧管理历史与入口，在中间以可持续阅读的文档流表达目标并协作，在右侧观察真实环境、计划、子 Agent、电脑与文件。`/artigen/create`、`/artigen/agent` 和 `/artigen/agent/runs/:runId` 必须共享这套空间语言、Composer 和交互骨架。

它学习 Codex 的信息架构、上下文持续性和专业操作密度，但不复制 OpenAI 的品牌、组件、文字、资产或像素级样式。Artigen 自己的识别点是低噪声石墨表面与一条酸性绿“执行脊柱”：绿色只意味着当前执行、关键动作、焦点或可验证的健康状态。

## Visual direction

- 默认深色，同时完整支持浅色与系统主题。
- 默认移除装饰性边框，以相邻背景明度、间距、排版和对齐建立层级；焦点、审批、错误、验证与真实屏幕边界仍保留功能性提示。
- 技术事实不删除也不伪装，但模型、Provider、沙箱、Worker、出口、并发、保留期和能力限制默认进入“技术详情”，不主动打扰普通用户。
- 系统工作字体：`-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif`。
- 正文保持 15px，控件 13px，桌面元数据以 12px 为常规下限，主要标题 18–38px。移动输入不小于 16px。
- Inspector 与 Composer 可使用 18–20px 的大圆角来表达持久工具面；普通信息组 8–10px，控制 7–10px。不要把所有内容做成胶囊。
- SVG 是唯一图标语言；不在产品 UI 中使用 Emoji。

## Color system

### Dark

- Background `#111311`
- Sidebar `#1B1E1B`
- Surface `#232622`
- Raised surface `#2A2E29`
- Border `#3A3F38`
- Text `#F3F4EF`
- Muted `#A1A79B`

### Light

- Background `#F4F5F1`
- Sidebar `#E9ECE6`
- Surface `#FFFFFF`
- Raised surface `#F0F2ED`
- Border `#CFD5CA`
- Text `#171A16`
- Muted `#5B6557`

### Execution and semantics

- Execution `#C8FF3D`：运行节点、主动作和焦点。浅色主题中的文本型绿色使用 `#426400`，不能直接用高亮绿写小字。
- Danger：深色 `#FF6B62`，浅色 `#A82D25`；停止、取消、失败。
- Warning：深色 `#F1BD4F`，浅色 `#775100`；审批、接管、预算或用户输入等待。
- Success：深色 `#69D59A`，浅色 `#247344`；验证通过、成功结束。
- Focus：深色 `#C8FF3D`，浅色 `#426400`；键盘焦点与输入描边。主按钮仍使用品牌绿色填充。

状态不能只靠颜色表达；必须同时有文字、结构位置或图标。

## Three-lane layout

```text
56px rail | 280px projects | conversation >= 480px | resources ~52vw (clamped)
```

- 1440px 起显示完整工作空间；项目栏可在 216–340px 拖拽，资源栏至少480px，并为功能栏、项目和会话保留空间。
- 800–1439px：保留功能栏，项目和资源以覆盖层打开。
- 800px 以下：左右栏是全高抽屉；主区始终占满视口，不允许横向滚动。
- 面板宽度、折叠和主题偏好只保存在本机，不写入服务端。
- 空任务默认收起 Inspector，开始对话后按任务展示；用户明确选择的折叠偏好优先。
- 顶栏固定承载标题、必要状态、唯一费用位置和控制；不常驻展示模型副标题或 Runtime 胶囊。
- 区域以相邻背景色区分；资源面板利用完整列宽，不保留旧版悬浮边距和大圆角。8px拖拽命中区在悬停、拖拽或键盘聚焦时明确显示；取消指针或窗口失焦后必须结束拖动。
- 中间输入框在零状态和运行状态中保持同一个心智位置：先表达目标，发送后停靠到底部继续对话。
- 底部 Composer 是三条路由共享的稳定工具台：20px 左右圆角、两行信息层级、圆形发送动作；不能让 Create、Computer Agent 与 Run Detail 各自漂移成不同组件语言。

### Alignment grammar

- 导航、历史、正文、设置、计划、文件列表和零状态主问题统一左对齐；只有图标按钮和 Inspector 页签居中。移动顶栏标题、状态和费用保留文字并左对齐。
- 费用、点数和短数值右对齐并使用 tabular numerals；长值换到标签下方，不用参差的右对齐制造密度。
- 标题、零状态、消息、通知、交付物和 Composer 共用 `760px` 阅读宽度与同一响应式 gutter，左右轴线的几何误差不得超过 1px。
- 图标按钮中的图形中心误差不得超过 0.5px；图标与文字的垂直中心误差不得超过 1px。确有需要的光学校正只能在共享图标注册表中记录，范围为 ±1px。

### Icon and control geometry

- 工作台图标统一使用 `24×24` viewBox、`1.75px` 圆角描边，并固定 `display: block; flex: none`，禁止被 Flex 压缩。
- 导航图标 16px、普通控件 18px、主要动作与移动端 20px；图标按钮显式清除浏览器和全局按钮 padding。
- 桌面图标控件使用固定正方形几何，移动端点击区至少 44×44px；隐藏文字后必须重新以 Grid 居中图标，不能保留文本按钮的 gap 或水平 padding。

## Left lane

- 品牌、新任务、搜索、分组历史、项目/工具/高级生图入口。
- 底部集中点数、主题、设置和账户。
- 历史项优先显示任务目标、状态和更新时间；活动状态有文字与状态点。
- 功能栏固定56px，项目栏可独立隐藏；移动抽屉打开后焦点进入抽屉，Tab循环，Escape关闭并恢复到实际触发按钮。

## Center lane

- `/artigen/create` 零状态只保留一个紧凑问题、主输入框和少量真实建议。附件本地边界放在附件按钮说明中，选中文件或需要云端上传时再展开。
- `/artigen/agent` 直接询问最终交付，不以大型能力表单开场；交付物、能力、站点范围与预算留在 Inspector。
- 运行详情以“你—Agent 关键结论—审批—交付”形成连续对话，不跳到另一套后台。主会话只保留一处可折叠执行记录；工具调用按服务端 callId、runId 与 subagentId 关联，开始/完成回执合为一行。展开后展示调用标识、时间和事件编号，不展示原始参数、命令或私有输出。子 Agent 状态与完整原始审计仍在右栏。
- 用户补充内容、审批和停止都在同一任务上下文中完成。
- 固定输入区必须为最后一条内容保留足够滚动空间，不能遮挡消息或交付物。
- 三条路由使用同一个 Composer：Enter 发送、Shift+Enter 换行、中文输入法确认不触发发送；发送中保留输入能力，回执只清除匹配原稿，失败重试复用同一次请求标识。
- 启动前附件可连续追加、按文件元信息去重并逐个移除；超出数量或执行器限制时明确提示并保留原选择，不截断或替换。报价展示交付物、权限、站点与附件范围，修改范围必须重新报价。上传失败保留引用，创建失败重试复用已上传附件。
- Run 当前输入协议只支持文字与审批；运行中不展示虚假的文件添加入口，并说明新文件需在新任务中添加。附件仅在内存中持有，刷新后需重选。
- 工具成功/失败必须有明确布尔回执；缺失结果标为待确认，不从缺失字段推断失败。阅读旧记录时新事件不能抢走位置，使用明确的回到底部入口。

## Resource workspace

右侧顶层入口为“文件、变更、GitHub、任务”。文件采用多标签、面包屑、预览/源码、状态栏及可独立隐藏的目录；编辑器以文档本身为主，避免重复嵌套卡片。项目、资源、资源内部目录分别隐藏；文件编辑缓存保留，不因切换任务页签而卸载。

任务内保留原环境、计划、子 Agent、电脑及交付验证信息，确保原审批、接管、来源和下载能力仍可用。交付验证暂保留在任务的文件页签，待静态网站包等专用预览迁移到统一文件面板后再删除这一兼容入口。后台事件不能抢走当前页签。

最左侧功能栏56px，项目导航默认280px；1440px起采用完整布局，会话保留至少480px。资源默认约52%窗口宽，内部不足640px时目录与文件视图切换。800–1439px项目/资源使用抽屉，手机为单主区和全屏资源；触控目标至少44px。会话阅读轴最大760px，资源利用其余空间，外层取消悬浮边距和大圆角。

公开过程、最终正文和用户输入来自持久化内容；Markdown不解释原始HTML。工具回执保持可折叠。授权图片与文件可从消息打开资源标签。模型私有分析和工具原始参数不进入公开消息。没有保存的旧正文不补造。

本机目录仅在Chrome授权后按需读取；用户主动加入上下文才上传选中文件。文本候选基于原文件哈希生成真实差异，逐文件确认写回，冲突不覆盖；当前编辑会话保留最近一次应用的撤销。用户编辑的云文件生成新版本，不继承Agent验证标记。

## Execution spine

- 计划节点与子任务状态通过一条稀疏酸性绿轨迹连接，这是 Artigen 的视觉签名。
- 当前节点可用酸性绿；完成用语义成功色；等待保持中性；失败或取消使用危险色。
- 进度变化只使用 `transform`、`opacity` 和颜色，150–220ms。退出快于进入。
- `prefers-reduced-motion` 下去除位移和循环动画；键盘触发不播放位移动画。

## Model and Agent truth

- 对话、规划、验证、父 Agent 和所有子 Agent 只能显示并调用 Cloudflare Workers AI `@cf/openai/gpt-oss-120b`；图片输出只调用 `Kwai-Kolors/Kolors`。
- 所有图片只能显示并调用 `Kwai-Kolors/Kolors`。
- 子 Agent 是真实独立 GPT-OSS-120B 上下文，不是视觉占位符：最多 3 个、深度固定 1、20 步、10 分钟。
- 子 Agent 只能读取授权输入并运行离线 Shell；不获得浏览器、电脑、连接器、Kolors、审批或最终交付权。
- 父 Agent 独占外部能力、审批和最终文件声明。失败或取消单个子 Agent 不应伪装成父任务失败。
- UI 必须如实显示实际执行器、预算、已用点数、排队、审批和验证状态。

## Interaction rules

- `Cmd/Ctrl+K` 打开命令面板，`Cmd/Ctrl+N` 新建任务。
- 命令面板以搜索框承载选项列表；打开时首项默认选中，方向键循环切换，鼠标悬停同步选中，Enter 执行当前项。筛选结果更新后回到首项；无结果时给出明确空状态，Escape 恢复打开前焦点。
- 所有覆盖层都支持 Escape、焦点陷阱和焦点恢复。
- 页签支持左右方向键、Home 和 End。
- 移动触控目标至少 44×44px；桌面密度可以更高，但焦点轮廓必须清晰。
- 主内容前提供跳转链接；动态图使用 `aria-live`，审批与错误使用明确语义。
- 用户当前页签、滚动位置和输入草稿不应被后台事件无故重置。

## Readability and accessibility floor

- 元数据在桌面端不得小于 11px，控件文字不得小于 12px，正文保持 14px；移动端输入文字不得小于 16px、正文不得小于 14px。
- 隐藏的原生文件输入不能进入 Tab 顺序，且仍需提供可访问名称；可见触发按钮负责键盘和焦点反馈。
- 审批、拒绝原因和预算提升等高风险输入必须有持久可见的关联标签，placeholder 不能代替 label。
- 宽度分隔条必须是可聚焦的 `separator`，暴露当前、最小和最大值；方向键调整，Shift 加速，Home/End 跳到边界。
- 移动端主动作、取消、澄清和通知按钮至少 44×44px；焦点指示必须在暗色、浅色和系统主题中保持可辨识。
- reduced motion 下动画与过渡时长必须真实归零，不能使用接近零的非零时长；特别需要在 Chromium、Firefox 和 WebKit 中分别验证。
- 中间消息流只保留澄清、审批、关键总结和交付；后台技术事件进入计划或审计，避免把日志伪装成对话。

## Disclosure matrix

- 默认显示：任务目标、影响行动的当前状态、真实报价或已用点数、待用户处理事项、已选择输出和最终结果。
- 按需显示：执行器、GPT-OSS/Kolors、Provider、Worker、出口、沙箱、并发、保留期、能力边界和原始事件。
- 永不隐藏：冻结/扣费/退款、审批目标与后果、Worker 离线等阻断、失败与恢复、文件来源和验证状态。
- “Ready”“智能路由”“未创建付费任务”等无行动价值的常驻文案默认不出现；状态只有在运行、等待、阻断、失败或需要用户处理时进入顶栏。

## Interaction state matrix

| Surface | Closed / idle | Open / active | Escape or cancel | Focus contract |
| --- | --- | --- | --- | --- |
| Left history panel | Desktop collapsible; mobile hidden and `inert` | Desktop expands in place; mobile drawer opens with scrim | Close button, scrim, or Escape closes | Restore focus to the history opener; collapse control exposes `aria-expanded` and `aria-controls` |
| Right Inspector | Desktop collapsible; mobile hidden and `inert` | Active tab and live state remain visible | Close button, scrim, or Escape closes | Restore focus to the Inspector opener; tabs keep roving focus and `aria-selected` |
| Command palette | Not mounted | Dialog focuses search and traps Tab | Escape closes and returns focus | `role=dialog`, labelled search, no background focus |
| Website preview | Not mounted | Dialog focuses close affordance and traps Tab | Close button or Escape closes | `aria-labelledby`, focus returns to the preview trigger |
| Run controls | Pause, resume, retry, stop reflect the current status | Busy state disables duplicate submissions | Stop requires a second explicit activation | Status and failure text are announced through live regions |
| Reduced motion | — | No looping or positional animation | — | All state changes remain understandable from text and color |

## Do / Don't

Do:

- 先让用户表达结果，再逐步暴露高级配置。
- 始终如实提供模型、执行器、预算、授权范围和文件验证；默认只主动显示用户完成任务所需的信息，技术模型与运行环境可在“技术详情”中查阅。
- 让三条 Agent 路由看起来属于同一个专业桌面产品。
- 让失败、取消、等待接管和预算阻断都提供下一步。

Don't:

- 不恢复明亮营销 Hero 或赛博朋克表单后台。
- 不复制 Codex 的商标、资产、文案或像素级组件。
- 不让酸性绿成为大面积装饰背景。
- 不用层层卡片、永久分隔线、模型口号或 `LOCAL FIRST` 标签制造技术感。
- 不把快速工作流伪装成 Computer Agent，也不把视觉占位符称为子 Agent。
- 不在移动端隐藏费用、安全边界、审批后果或验证状态。

## Dense workspace acceptance

- 以长标题、120条会话、60条混合长消息、12个长文件标签、10个附件、250文件和5000行文本验证；页面无整页横向溢出不代表控件未被祖先裁切，关键动作还需命中与焦点检查。
- 文件标签独立滚动，目录开关不可被挤出；激活、关闭和资源模式切换后保持选中标签可见及键盘焦点。多个路径引用同一资产时优先匹配精确文件ID。
- 会话编辑表单紧邻项目列表顶部，进入时立即聚焦。附件区和长输入分别限高、内部滚动，窄屏Composer不能撑大Grid，短屏顶端内容必须可达。
- Markdown宽表格局部滚动并保持单元格可读宽度；编辑器使用明暗主题语义色，不沿用只适合浅色的默认高亮。
- GitHub列表和记录详情互相切换，返回恢复原记录焦点；刷新使旧请求失效时，当前请求仍必须释放busy状态。
- 命令面板按可用高度滚动；嵌套控件已处理的键盘事件不能再触发Shell，编辑器搜索的第一次Escape仅关闭搜索。
- 触屏规则按pointer:coarse生效，包含平板而不限手机宽度；紧凑子组件不得覆盖44px最小触控尺寸。

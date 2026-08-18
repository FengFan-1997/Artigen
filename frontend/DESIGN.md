---
name: Artigen Digital Prepress Proofing Table
description: A light-first three-lane production workspace built from cool paper, structural ink, cobalt selection, and fluorescent registration marks.
colors:
  paper: "#F4F6F7"
  project-shelf: "#E9EDEF"
  proof-sheet: "#FBFCFC"
  press-bed: "#E3E8EB"
  hairline: "#CDD4D8"
  rule-strong: "#AEB8BD"
  ink: "#17201C"
  ink-muted: "#5F6B65"
  ink-faint: "#56625C"
  cobalt: "#275BFF"
  cobalt-ink: "#FFFFFF"
  register-lime: "#B5ED32"
  register-lime-ink: "#16200F"
  register-lime-text: "#426000"
  dark-table: "#121816"
  dark-shelf: "#171E1B"
  dark-sheet: "#1D2521"
  dark-press-bed: "#26302B"
  dark-hairline: "#35423B"
  dark-rule-strong: "#4A5A52"
  dark-ink: "#F1F4EF"
  dark-ink-muted: "#A3ADA6"
  dark-cobalt: "#6D8EFF"
  dark-focus: "#7796FF"
  dark-register-lime: "#B8F13C"
  danger: "#FF766D"
  warning: "#EFBB52"
  success: "#70D7A0"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(34px, 4.2vw, 58px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.045em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 680
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.4
rounded:
  status: "4px"
  control: "5px"
  field: "8px"
spacing:
  hairline: "4px"
  compact: "8px"
  control: "12px"
  section: "16px"
  lane: "24px"
  major: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cobalt-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
  button-selected:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.cobalt-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  field:
    backgroundColor: "{colors.proof-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px"
---

# Design System: Artigen Digital Prepress Proofing Table

## Overview

**Creative North Star: "The Digital Prepress Proofing Table"**

Artigen 是一张正在工作的数字打样台：冷白纸面承载内容，深墨建立结构，cobalt 标记用户当前选择，acid lime 标记机器正在执行和套准。它不是营销落地页、普通聊天框，也不是由悬浮卡片拼成的后台。

`/artigen/create`、`/artigen/agent` 与 `/artigen/agent/runs/:runId` 共用同一套三栏骨架：左侧项目架、中间主工作稿、右侧生产控制台。标题可以大而有编辑感，但必须服务于任务定位，不得演变为营销 Hero。终审权威来自 concept seed `3c7e566d` 的 candidate `04`。

**Key Characteristics:**

- 默认浅色冷白纸面；深色与系统主题提供完整、等价的状态和对比度。
- 扁平邻接表面、细规则线和明确分区取代卡片墙。
- 十字套准标记是跨路由签名；它表达定位与校准，不是装饰 Logo 拼贴。
- 主动作使用结构色；选择与焦点使用 cobalt；执行与套准才使用 acid lime。
- 信息密度专业但可读，所有生产事实、风险和恢复路径保持可见。

## Colors

浅色主题以 `paper`、`project-shelf`、`proof-sheet` 和 `press-bed` 形成冷白纸张层次，`ink` 负责正文、规则和主动作。深色主题使用对应的 `dark-*` token，并保留相同的语义层级；深色不是默认值。

### Primary

- **Structural Ink** (`ink` / `dark-ink`)：标题、正文、关键结构和主动作。暗色主题中的主动作使用明亮反相墨色，不能借用执行色。

### Secondary

- **Proofing Cobalt** (`cobalt` / `dark-cobalt` / `dark-focus`)：仅用于选中项、活动页签、键盘焦点和可交互定位反馈。

### Tertiary

- **Registration Lime** (`register-lime` / `dark-register-lime`)：仅用于十字套准点、当前执行、活动进度、运行徽标和需要立即辨认的机器状态。小字使用 `register-lime-text`，不得直接使用荧光底色值。

### Neutral

- **Cool Paper Family** (`paper`, `project-shelf`, `proof-sheet`, `press-bed`)：默认主题的相邻工作表面。
- **Rules** (`hairline`, `rule-strong`)：分栏、表格行、输入边界和结构分隔。
- **Muted Ink** (`ink-muted`, `ink-faint`)：辅助说明和元数据，仍须满足对比度。
- **Dark Proof Family** (`dark-table`, `dark-shelf`, `dark-sheet`, `dark-press-bed`)：深色与系统深色模式的等价表面。
- **Semantic States** (`danger`, `warning`, `success`)：失败/取消、审批/等待、验证通过；必须同时配文字或图标，不能只靠颜色。

**The Two-Color Verbs Rule.** Cobalt 意味着“我选中了哪里 / 焦点在哪里”；acid lime 意味着“系统正在做什么 / 套准在哪里”。两者不得互换，acid lime 不得充当默认 CTA、选中态或焦点环。

**The Light-First Rule.** 首次进入使用浅色主题。用户可选浅色、深色或跟随系统，且三种模式必须覆盖所有状态、覆盖层和焦点样式。

## Typography

界面统一使用系统工作字体栈。字重、规则线与留白建立层级，不依赖超小字或全大写制造“专业感”。

### Hierarchy

- **Display**：零状态任务问题可使用 `display`，但只是一句工作指令；不配营销副标题、销售证据或大面积品牌背景。移动端约 32px。
- **Title**：任务名、工作稿标题和控制台分区使用 `title`。
- **Body**：消息、计划说明、审批说明和交付说明使用 `body`；桌面与移动端均不得小于 14px。
- **Control**：按钮、页签、搜索与表单控件不得小于 12px。
- **Metadata**：时间、模型、点数与短状态不得小于 11px；推荐值为 12px。
- **Mobile Input**：输入框和 textarea 不得小于 16px，以避免缩放并保证可读性。
- **Risk Copy**：授权后果、预算提升、取消/删除、失败恢复和隐私说明在移动端不得小于 14px，不能降级为 metadata。

**The No-Microcopy Rule.** 9px 文本在本系统中没有合法用途。任何需要阅读、判断或恢复的内容都必须达到对应字号下限。

## Layout

桌面骨架为 `248px project shelf | minmax(0, 1fr) working proof | 360px production console`。1200px 以上同时显示三栏；左栏可在 216–340px、右栏可在 320–480px 间拖拽。分栏是邻接表面，不包进独立大卡片。

- **左侧项目架**：品牌、新任务、搜索、分组历史、项目/工具/高级生图入口，底部放点数、主题、设置和账户。桌面可折叠为 64px 工具轨，但折叠后必须保留有名称的展开控制，不能形成不可恢复的死路。
- **中间主工作稿**：承载零状态 brief、连续对话、审批、关键总结和交付物。输入框从首条请求位置平滑停靠到底部，仍属于同一工作稿。
- **右侧生产控制台**：页签固定为环境、计划、子 Agent、电脑、文件。后台事件只能更新徽标和 `aria-live`，不得自动切换用户当前页签。
- **顶栏**：固定显示任务标题、执行器、费用、运行状态和控制，不把生产事实塞回消息流底部。

800–1199px 时左右栏改为覆盖层；800px 以下为全高抽屉，主工作稿占满视口且不得横向滚动。抽屉打开后焦点进入面板，Tab 受控，Escape 关闭并恢复触发点。宽度、折叠和主题偏好仅保存在本机。

## Elevation & Depth

系统默认扁平。层级来自表面色差、1px 规则线、栏位邻接和内容密度；列表、计划、文件与检查器区块不使用“每项一张卡”的阴影和圆角。阴影只保留给命令面板、移动抽屉、通知和当前浮动输入区等真正覆盖其他内容的层。

**The Flat Proof Rule.** 静止内容没有漂浮理由就没有阴影；先用分区、线条和色调表达层级。

## Shapes

控件采用克制的小圆角：状态块约 4px，普通控制约 5px，输入与浮层约 8px。长列表、生产区块和相邻面板保持方正或仅轻微收角；不要把按钮、状态、标签和容器全部做成胶囊。

十字套准标记由细水平线、垂直线、圆环与 acid lime 中心点构成，可用于品牌字标、空状态、Agent 标记和工作稿定位。尺寸和线宽可随场景调整，但结构不得改成闪电、星芒或发光球。

## Components

### Primary and selected actions

- 主动作使用深墨实底和反相文字；暗色主题使用等价的明亮反相处理。
- 已选导航、活动页签和焦点反馈使用 cobalt。Hover 只做克制的色调或边界变化，不把“将要执行”伪装成“已选中”。
- Acid lime 只显示当前执行、套准点、进度和运行徽标；停止、拒绝与失败使用 `danger`，审批和等待使用 `warning`。
- 所有状态同时提供文字或图标语义；不能只变色。

### Composer and attachments

- 零状态先问最终交付，保留一个主输入框、附件边界和少量真实建议，不用大型能力表单开场。
- 附件选择后先留在本机。只有路由确定为云端执行器且用户继续执行时才上传；界面在输入区附近持续说明这一边界。
- 隐藏的原生文件输入不得进入 Tab 顺序，必须有可访问名称；可见触发按钮承担键盘和焦点反馈。
- 固定输入区必须为最后一条内容预留滚动空间，不得遮挡消息、风险说明或交付物。

### Production console

- 环境页如实显示模型、沙箱、允许站点、能力和预算；计划、子 Agent、电脑和文件页只显示各自生产事实，不重复中间消息全文。
- 所有文字理解、澄清、规划、父 Agent 与子 Agent 固定为 `Qwen/Qwen3-8B`；所有图片输出固定为 `Kwai-Kolors/Kolors`，单次最多一张参考图。
- 子 Agent 最多 3 个、深度 1、20 步、10 分钟，只能读取授权输入并运行离线 Shell；父 Agent 独占外部能力、审批、Kolors 与最终交付声明。
- 真实执行器、预算、已用点数、排队、审批、验证、失败与恢复状态必须可见；单个子 Agent 失败不得伪装成父任务失败。

### Focus, keyboard, touch, and motion

- `Cmd/Ctrl+K` 打开命令面板，`Cmd/Ctrl+N` 新建任务；页签支持方向键、Home 与 End。
- 所有覆盖层支持 Escape、焦点陷阱与焦点恢复。主内容前提供跳转链接，动态状态使用合适的 `aria-live`。
- 每个交互图标必须有明确名称；纯装饰 SVG 使用 `aria-hidden`。图标统一使用 SVG，不使用 Emoji。
- 分栏拖拽控制是可聚焦的 `separator`，暴露当前、最小和最大值；方向键调整，Shift 加速，Home/End 到边界。
- 移动触控目标至少 44×44px。用户当前页签、滚动位置和输入草稿不得被后台事件无故重置。
- 动效只使用 `transform`、`opacity` 与颜色，通常为 150–220ms，退出快于进入。`prefers-reduced-motion` 下过渡和动画时长真实归零，不保留循环或位移。

## Do's and Don'ts

### Do:

- **Do** 让三条 Agent 路由看起来属于同一张数字打样台，并保留左项目架、中主工作稿、右生产控制台的职责。
- **Do** 以冷白纸面、深墨结构和十字套准标记建立 Artigen 识别度。
- **Do** 清楚区分选择/焦点的 cobalt 与执行/套准的 acid lime。
- **Do** 让失败、取消、等待接管、预算阻断和权限拒绝都给出下一步。
- **Do** 在浅色、深色和系统主题中验证对比度、焦点、键盘、触控与 reduced motion。

### Don't:

- **Don't** 把深色设为默认，也不要恢复石墨终端、赛博朋克或酸性绿主导的视觉世界。
- **Don't** 用 acid lime 做默认 CTA、选择态、链接色或焦点环。
- **Don't** 创建卡片墙、玻璃面板、厚重常驻阴影或整页胶囊控件。
- **Don't** 把大标题写成营销 Hero，或虚构客户证明、SLA 和能力声明。
- **Don't** 使用 9px 文本，或在移动端隐藏费用、安全边界、审批后果、风险说明和验证状态。
- **Don't** 提前上传本机附件，也不要把快速工作流或视觉占位符冒充 Computer Agent 或子 Agent。

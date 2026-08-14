---
name: Artigen Unified Agent Workspace
description: Codex-class three-lane design workspace with Artigen execution signals.
colors:
  dark-background: "#0E100F"
  dark-sidebar: "#151715"
  dark-surface: "#1A1D1A"
  dark-border: "#2B2F2A"
  dark-text: "#F2F4EE"
  muted: "#929A8D"
  light-background: "#F7F8F4"
  light-sidebar: "#EEF0EA"
  light-surface: "#FFFFFF"
  light-border: "#D8DDD3"
  light-text: "#171A16"
  execution: "#C8FF3D"
---

# Artigen Unified Agent Workspace

## Product thesis

Artigen 的 Agent 页面是一套持续任务空间，不是营销 Hero、配置后台或普通聊天软件。用户在左侧管理历史与入口，在中间表达目标并持续对话，在右侧观察真实环境、计划、子 Agent、电脑与文件。`/artigen/create`、`/artigen/agent` 和 `/artigen/agent/runs/:runId` 必须共享这套空间语言和交互骨架。

它学习 Codex 的信息架构、上下文持续性和专业操作密度，但不复制 OpenAI 的品牌、组件、文字、资产或像素级样式。Artigen 自己的识别点是低噪声石墨表面与一条酸性绿“执行脊柱”：绿色只意味着当前执行、关键动作、焦点或可验证的健康状态。

## Visual direction

- 默认深色，同时完整支持浅色与系统主题。
- 以细边界、邻接表面和信息密度建立层级；不依赖巨型标题、厚重阴影、玻璃或赛博朋克装饰。
- 系统工作字体：`-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif`。
- 正文 11–13px，主要标题 18–28px，小型状态 9–10px。9px 文本只用于短元数据，不承载风险、授权后果或恢复说明。
- 大容器圆角 10–12px，普通卡片 8–10px，控制 7–9px。不要把所有内容做成胶囊。
- SVG 是唯一图标语言；不在产品 UI 中使用 Emoji。

## Color system

### Dark

- Background `#0E100F`
- Sidebar `#151715`
- Surface `#1A1D1A`
- Raised surface `#20231F`
- Border `#2B2F2A`
- Text `#F2F4EE`
- Muted `#929A8D`

### Light

- Background `#F7F8F4`
- Sidebar `#EEF0EA`
- Surface `#FFFFFF`
- Raised surface `#F5F6F1`
- Border `#D8DDD3`
- Text `#171A16`
- Muted `#667061`

### Execution and semantics

- Execution `#C8FF3D`：运行节点、主动作和焦点。浅色主题中的文本型绿色使用 `#426400`，不能直接用高亮绿写小字。
- Danger `#FF6B62`：停止、取消、失败。
- Warning `#F1BD4F`：审批、接管、预算或用户输入等待。
- Success `#69D59A`：验证通过、成功结束。

状态不能只靠颜色表达；必须同时有文字、结构位置或图标。

## Three-lane layout

```text
248px history  |  minmax(0, 1fr) conversation  |  360px inspector
```

- 1200px 以上显示三栏；左栏可在 216–340px 拖拽，右栏可在 320–480px 拖拽。
- 800–1199px：左栏默认收起，左右栏以覆盖层打开。
- 800px 以下：左右栏是全高抽屉；主区始终占满视口，不允许横向滚动。
- 面板宽度、折叠和主题偏好只保存在本机，不写入服务端。
- 顶栏固定承载标题、执行器、费用、运行状态和控制，不能塞回消息流底部。
- 中间输入框在零状态和运行状态中保持同一个心智位置：先表达目标，发送后停靠到底部继续对话。

## Left lane

- 品牌、新任务、搜索、分组历史、项目/工具/高级生图入口。
- 底部集中点数、主题、设置和账户。
- 历史项优先显示任务目标、状态和更新时间；活动状态有文字与状态点。
- 桌面折叠为 64px 工具轨；移动抽屉打开后焦点进入抽屉，Tab 循环，Escape 关闭并恢复到触发按钮。

## Center lane

- `/artigen/create` 零状态只保留一个紧凑问题、主输入框、附件边界和少量真实建议。
- `/artigen/agent` 直接询问最终交付，不以大型能力表单开场；交付物、能力、站点范围与预算留在 Inspector。
- 运行详情以“你—父 Agent—审批—子 Agent 事件—交付”形成连续对话，不跳到另一套后台。
- 用户补充内容、审批和停止都在同一任务上下文中完成。
- 固定输入区必须为最后一条内容保留足够滚动空间，不能遮挡消息或交付物。

## Inspector

五个文字页签始终按以下顺序出现，后台事件只能增加徽标和 `aria-live` 通知，不能自动抢走当前页签：

1. 环境：模型锁定、沙箱、允许站点、能力和预算。
2. 计划：真实持久计划、当前步骤、重规划与审计。
3. 子 Agent：父 Agent、最多 3 个子 Agent、状态、步骤、用量和单独取消。
4. 电脑：安全桌面、接管、一次性票据和归还控制。
5. 文件：生成、验证、预览、来源和下载。

Inspector 卡片紧凑、扁平、可扫描。避免在右栏重复中间消息全文。

## Execution spine

- 计划节点与子任务状态通过一条稀疏酸性绿轨迹连接，这是 Artigen 的视觉签名。
- 当前节点可用酸性绿；完成用语义成功色；等待保持中性；失败或取消使用危险色。
- 进度变化只使用 `transform`、`opacity` 和颜色，150–220ms。退出快于进入。
- `prefers-reduced-motion` 下去除位移和循环动画；键盘触发不播放位移动画。

## Model and Agent truth

- 对话、规划、父 Agent 和所有子 Agent 只能显示并调用 `Qwen/Qwen3-8B`。
- 所有图片只能显示并调用 `Kwai-Kolors/Kolors`。
- 子 Agent 是真实独立 Qwen3 上下文，不是视觉占位符：最多 3 个、深度固定 1、20 步、10 分钟。
- 子 Agent 只能读取授权输入并运行离线 Shell；不获得浏览器、电脑、连接器、Kolors、审批或最终交付权。
- 父 Agent 独占外部能力、审批和最终文件声明。失败或取消单个子 Agent 不应伪装成父任务失败。
- UI 必须如实显示实际执行器、预算、已用点数、排队、审批和验证状态。

## Interaction rules

- `Cmd/Ctrl+K` 打开命令面板，`Cmd/Ctrl+N` 新建任务。
- 所有覆盖层都支持 Escape、焦点陷阱和焦点恢复。
- 页签支持左右方向键、Home 和 End。
- 移动触控目标至少 44×44px；桌面密度可以更高，但焦点轮廓必须清晰。
- 主内容前提供跳转链接；动态图使用 `aria-live`，审批与错误使用明确语义。
- 用户当前页签、滚动位置和输入草稿不应被后台事件无故重置。

## Do / Don't

Do:

- 先让用户表达结果，再逐步暴露高级配置。
- 始终显示真实模型、执行器、预算、授权范围和文件验证。
- 让三条 Agent 路由看起来属于同一个专业桌面产品。
- 让失败、取消、等待接管和预算阻断都提供下一步。

Don't:

- 不恢复明亮营销 Hero 或赛博朋克表单后台。
- 不复制 Codex 的商标、资产、文案或像素级组件。
- 不让酸性绿成为大面积装饰背景。
- 不把快速工作流伪装成 Computer Agent，也不把视觉占位符称为子 Agent。
- 不在移动端隐藏费用、安全边界、审批后果或验证状态。

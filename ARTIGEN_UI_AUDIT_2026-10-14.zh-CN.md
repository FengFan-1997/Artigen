Method: dual-agent (A: /root/design_review · B: /root/detector_browser)

# Artigen 主工作流 UI 大审查

审查对象是 Artigen 的主创作链路：`/artigen/create` → Agent 执行与运行详情 → `/artigen/projects` → `/artigen/projects/:id`。依据包括 `frontend/PRODUCT.md`、`frontend/DESIGN.md`、相关 Vue 页面/组件、Impeccable detector，以及 DEV 页面的只读浏览器观察。没有提交生成任务、触发支付或修改线上环境。

## 结论

Artigen 已经有自己的产品表达，不是套通用聊天壳：自然语言发起任务、执行路径自动选择、启动前报价、任务持续记录、逐项审批、项目资产与结果留存都能在代码里找到。综合设计特异性为 **中高，7/10**；Nielsen 十项为 **26/40**。主流程目前最需要改进的是错误与上传这类会直接挡住用户的状态，其次是跨页面衔接和记录层级。

## 设计健康分数

每项 0–4 分。A 以源码和产品/设计说明评估；并非每个页面都能在同一时刻完成实时视觉验证。

| # | 启发式 | 分数 | 主要依据 |
|---|---|---:|---|
| 1 | 系统状态可见 | 3 | Agent 有报价、阶段、审批、交付状态；列表加载错误原先会落入空列表文案，本轮已修。 |
| 2 | 贴近真实任务 | 3 | 自然语言入口清楚；“Worker、子 Agent、受限出口”等执行术语对创作者偏技术。 |
| 3 | 用户控制与自由 | 3 | 有新建、暂停、恢复、停止、拒绝审批、回收与恢复；项目内再生成会跳到另一入口。 |
| 4 | 一致性与标准 | 2 | Create 与 Agent 共用工作台；运行详情输入和项目页又形成独立交互/视觉体系。 |
| 5 | 错误预防 | 3 | 有生成报价、预算上限、文件检查和外部操作审批。 |
| 6 | 识别而非回忆 | 3 | 有历史、建议、计划、项目文件和上下文；项目检查器有 5 个分类页签。 |
| 7 | 灵活与高效 | 3 | 有历史搜索、命令面板、建议和快捷操作；搜索框标注的 `⌘K` 实际打开命令面板。 |
| 8 | 简约与审美 | 2 | 主工作台角色清楚；项目资料、记忆、版本操作偏密，运行事件有重复呈现。颜色一致性还需治理。 |
| 9 | 错误恢复 | 2 | Agent 对部分失败给出重试/恢复提示；项目加载失败原先可能伪装成空项目，本轮已修。 |
| 10 | 帮助与文档 | 2 | 有示例和字段说明；首次用户仍要自行理解不同 Agent 入口和项目生成衔接。 |
| **总分** |  | **26/40** | 可以继续迭代上线；优先修主流程的可达性与失败反馈。 |

## 最有效的部分

- 创建前显示报价与预算上限，用户确认后才创建运行任务；这让费用和任务启动边界清楚。
- 任务空间围绕一个持续运行保留目标、计划、审批、调用和交付记录，与“描述结果、系统安排执行”的产品目标一致。
- 上传云端素材与外部写操作有边界说明；用户能看到何时涉及上传或批准。

## 问题与处理顺序

1. **[P1，已修] 项目素材上传原先无法可靠键盘操作。** `ProjectWorkspace.vue` 用 `display:none` 隐藏原生文件输入，包含它的 `<label>` 本身不可聚焦。键盘用户可能无法上传商品/品牌素材，挡住项目主流程。本轮改为可聚焦的视觉隐藏输入，并在上传入口显示清晰焦点环；回归测试验证文件输入可聚焦且焦点环出现。位置：[ProjectWorkspace.vue](frontend/src/agentImg/views/ProjectWorkspace.vue#L641)。
2. **[P2，已修] 项目列表请求失败原先可能显示“还没有项目”。** 错误仅写入创建表单里的 `statusText`；用户不打开表单便看不到。现在空列表显示带“重试/重新登录”的错误状态；已有项目刷新失败时显示错误提示并保留旧列表。位置：[ProjectsPage.vue](frontend/src/agentImg/views/ProjectsPage.vue#L75)、[ProjectsPage.vue](frontend/src/agentImg/views/ProjectsPage.vue#L219)。
3. **[P2，待做] 从项目点击“生成新版本”会离开项目工作区。** `ProjectWorkspace.vue` 把 `projectId`、版本与参考素材传到 `/artigen/ai`；是否能顺畅回到版本画廊尚未在浏览器确认。建议下一步把项目上下文贯穿生成和交付，完成后返回同一版本列表。[ProjectWorkspace.vue](frontend/src/agentImg/views/ProjectWorkspace.vue#L443)
4. **[P2，待做] 运行事件在多个区域重复出现。** 最近动作区显示最近 8 条，主对话流再显示部分相同事件，右侧审计区保留全量事件。用户需要查看调用记录，所以要减少重复层级、保留完整可追溯审计，而不是删掉调用记录。建议让主流显示对用户有用的动作摘要，详细事件集中在可展开审计区。[AgentRunDetail.vue](frontend/src/agentImg/views/AgentRunDetail.vue#L56)、[AgentRunDetail.vue](frontend/src/agentImg/views/AgentRunDetail.vue#L118)、[AgentRunDetail.vue](frontend/src/agentImg/views/AgentRunDetail.vue#L190)、[AgentRunDetail.vue](frontend/src/agentImg/views/AgentRunDetail.vue#L353)
5. **[P2，待做] 搜索框的 `⌘K` 提示与实际快捷键冲突。** `⌘K` 打开命令面板，没有聚焦任务搜索。删除错误提示或增加专用搜索快捷键，并让提示与实际行为一致。[AgentWorkspaceShell.vue](frontend/src/agentImg/components/workspace/AgentWorkspaceShell.vue#L51)、[AgentWorkspaceShell.vue](frontend/src/agentImg/components/workspace/AgentWorkspaceShell.vue#L468)

## 认知负荷与用户旅程

桌面右侧检查器有环境、计划、子 Agent、电脑、文件五个分类；项目页还同时放着项目资料、品牌资料、折叠的项目记忆和多项版本操作。记忆默认折叠是合理的缓冲，但新手仍需要分辨“设计 Agent、电脑 Agent、高级生图”以及 Worker/子 Agent 等内部术语。

用户从自然语言入口开始时顺畅；报价确认是信任峰值。等待、服务不可用、权限和余额阻断是容易丢失进度感的低谷。运行失败仍需要清楚告诉用户“发生了什么、任务/素材是否还在、下一步怎么恢复”。项目生成入口离开当前工作区，则增加一次上下文切换。

## 角色检查

- **首次使用的电商创作者：**从 Create 描述目标容易开始；遇到“Worker 离线/子 Agent/受限出口”时需要理解内部实现；项目错误如果说成“没有项目”会造成数据丢失的错觉，后者已修复。
- **键盘用户/高效用户：**项目素材输入原先不可达，现已修复；任务搜索的快捷键提示仍会把人带去命令面板。
- **重视上下文和调用记录的用户：**主对话、最近动作和审计都能提供轨迹；当前重复展示会增加阅读量，但完整审计应继续保留。

## 检测器与浏览器证据

Impeccable detector 对六个目标文件运行一次，退出码 `2`，报告 **55 条 advisory**，全部是 `design-system-color`（字面颜色未匹配 `DESIGN.md` 令牌）：`ProjectsPage.vue` 19 条、`ProjectWorkspace.vue` 36 条，另四个 Agent 页面/组件为 0。它逐条报告 CSS 颜色，不是 55 个不同用户问题，也没有测量真实对比度。审查需要决定项目页的 `#CCFF00` 等是有意的地方性品牌色，还是旧令牌漂移；不应机械替换颜色。

浏览器审查员在 DEV 检查了五个主路由的 DOM/截图，桌面 **1512×697** 与移动 **390×844**，页面 `scrollWidth` 均未超过视口。DEV 可看到项目列表和项目素材/版本；运行详情里有一个失败任务。第一次打开时也出现过 Render 唤醒页。没有创建任务或触发付费。浏览器脚本注入被页面工具的只读限制和 Chrome 窗口由用户接管所阻止，因此**没有 `[Human]` 检测覆盖层**；本地后端未运行，Vite 的 auth/余额代理会报 `ECONNREFUSED`。源码推断和 DEV 截图观察已分开记录。

## 外部做法：Douyin + GitHub

按技能要求尝试的抖音公开搜索词包括：`UI UX 审核 设计 审查 AI 编程 Codex Skill`、`UI accessibility responsive audit Playwright AI coding`、`Codex UI 审核`、`UX audit Skill AI coding`。搜索没有返回可核验的视频来源；Chrome 中已有一条相关视频标签，但浏览器当时由用户接管，未读取视频/字幕。因此本报告不引用任何抖音作者结论，也不声称抖音覆盖完整。

| GitHub 来源 | 仓库可见情况（2026-10-14 检查） | 可复用做法与处置 |
|---|---|---|
| [EliaAlberti/ux-audit-skill](https://github.com/EliaAlberti/ux-audit-skill) | 约 20★、4 forks、MIT；含 `SKILL.md` 和 Python 图片标注工具。 | 分目标、原则、命名检查与用户旅程多轮审查；要求静态截图不推断交互。**仓库与 Skill 文档已核验，未安装、未运行脚本。** |
| [paulunemoon/ux-audit-skill](https://github.com/paulunemoon/ux-audit-skill) | 约 9★、MIT；含 Skill 文档、参考资料和对比度脚本。 | 用维度、严重度和置信度组织发现，明确不假设不存在的用户分析。**已核验文档，未安装或运行。** |
| [EnchStyle/ui-ux-audit-skill](https://github.com/EnchStyle/ui-ux-audit-skill) | 约 5★、MIT；含打包 Skill、Playwright 测量脚本。 | 覆盖 360/768/1280 视口并模拟多种用户。仓库自述偏 Claude Skill 包装，安装兼容性需单独确认；**未安装或运行。** |
| [ov3rf1w/ui-responsive-audit](https://github.com/ov3rf1w/ui-responsive-audit) | 当时 GitHub 页显示 0★、MIT；含 Skill、脚本、测试和 `package.json`。 | 先抽样页面，再测 DOM 几何和视口；依赖项目 Playwright。**已检查仓库说明，未运行下载代码。** |

**综合建议（本报告推导，不是作者原话）：**先用真实主任务定义审核范围，再并行看产品意图、源码、实际页面；对截图结论与代码结论标出证据和信心；优先走完桌面/手机上最关键的成功、空、失败、恢复路径；最后只提交一两个可验证修复。公开星数会变化，本表只记录审查当天页面显示的大致数值。

## 本轮已实施与验证

- `ProjectWorkspace.vue`：文件输入仍保留原生语义和键盘焦点，样式将其视觉隐藏但不从 Tab 顺序移除，并增加可见焦点环。
- `ProjectsPage.vue`：增加独立加载错误状态、重试/重新登录入口；有旧数据时刷新失败保留已有项目。
- `frontend/e2e/projects-page.spec.ts`：增加列表失败恢复与素材输入键盘焦点的回归断言。
- 通过：目标文件 ESLint、`pnpm type-check`、项目页 Chromium 两个 E2E（**2/2**）、`git diff --check`。E2E 使用系统 Chrome，关闭录像/追踪以避免下载 ffmpeg；测试时 Vite 代理对未运行的本地后端余额接口报错，但被测流程通过。临时 Playwright 输出、临时配置和本地 Vite 服务均已清理。
- 无线上改动、无 commit、无 push。审查开始前工作树已有其他用户改动，本轮只改上述 3 个文件，并保留其余修改与文件。

## Impeccable 记录

目标 slug：`frontend-src-agentimg-views-agentworkbench-vue`。另一个 v4.0.4 context 诊断将 `DesignConversation.vue` 的 surface brief 报为 orphaned，但该 brief 和对应源码均存在，属于误报；不需要移动文件。用户批准的 Impeccable v4.5.2 已安装到 `~/.agents/skills/impeccable`；本会话已加载的 `~/.codex/skills/impeccable` 仍是 4.0.4，因此本轮继续遵循当前加载版本，更新对后续会话生效。

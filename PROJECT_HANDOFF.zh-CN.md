# Artigen 项目正式 Handoff

更新时间：2026-08-20（Asia/Shanghai）

文档性质：**GitHub 正式项目状态 / 持久事实总入口**

本文只保留已经确定并产生持久影响的架构、代码、配置、迁移、部署和正式决定。开发中的具体进度、临时尝试、失败调试和下一条命令只记录在被 Git 忽略的 `HANDOFF.local.md`，不进入本文。

> 本文不保存密码、API Key、Token、数据库连接串、OTP、恢复码或平台 Secret。账号标识、公开资源 ID、环境变量名称和密钥存放位置可以记录，秘密值不可以。

## 2026-08-20 工作台微对齐与信息蒸馏精修（已实现，待 PR / DEV）

- 分支 `codex/workspace-micro-alignment-polish` 基于最新 `origin/dev` SHA `8bdb24b...`。本轮保留既有暗色无边框三栏结构，只处理图标几何、文字对齐、阅读轴、信息层级和无障碍细节；没有修改后端、API、数据库、模型、Worker、计费、生产开关或网络配置。
- 新增共享 `WorkspaceIcon`，将 Shell、Create、Computer Agent、Run Detail、Composer 和执行卡的工作台图标统一到 24×24 viewBox、14/16/18/20px 尺寸阶梯、1.75px 圆角描边和固定 flex 几何。发送、附件、刷新、删除、文件、暂停/恢复/停止等动作不再各自携带漂移的 SVG 与 stroke 规则；纯图标按钮显式归零 padding，移动附件动作在隐藏文字后保持真正居中。
- 发现并修复了旧全局 `#app { text-align:center }` 对工作台的隐式污染。工作台现在显式建立对齐语法：桌面顶栏、历史、Inspector、消息与表单内容左对齐；低于 800px 的默认顶栏标题明确居中；标签/值按列对齐，数字使用 tabular 形式，正文与 Composer 共享同一 760px 阅读轴和移动 gutter。
- 默认界面进一步蒸馏：就绪 Runtime 不再重复显示，零状态不再常驻执行器/费用说明，运行详情移除 Run ID 与重复状态副标题，技术能力和浏览范围归入按需展开的运行设置/技术详情；费用、审批影响、失败释放、文件验证与必要状态仍保持可见。
- 几何审计新增硬门槛：共享图标尺寸不得变形，纯图标按钮中心误差不超过 0.5px，图标/文字基线误差不超过 1px，桌面标题左对齐与移动标题居中必须显式成立，消息/Composer 左右轴误差不超过 1px，同时拒绝可手动拖大 textarea、带意外 padding 的发送动作、DEV 徽标碰撞和不足 44px 的移动触控目标。
- 三遍审核已完成：Impeccable 对核心八文件机械检测返回 `[]`；类型检查、变更文件 ESLint 与 `git diff --check` 通过；工作台专项矩阵在 Chromium、Firefox、WebKit desktop、360、390 与 WebKit 768 为 120/120。完整 `pnpm check` 退出码 0：前端 216/216、Agent 质量集 50/50、生产构建与 87.5 KiB gzip 初始 JS 预算通过，Playwright 为 483 passed / 3 条既有条件跳过 / 0 failed，耗时 17.3 分钟。
- 自动截图覆盖 1440、1439、1200、1199、1180、1024、800/799、768、430、400/399、390、360、844/667 横屏、200% 等效窄视口、暗色/浅色/系统主题、运行详情与子 Agent，证据保存在被忽略的 `.artifacts/workspace-micro-alignment-8bdb24b/`；代表性桌面、移动、活跃会话、运行详情和浅色截图已逐张人工复核。
- 实现提交 `5a66e92` 已通过 feature PR [#103](https://github.com/FengFan-1997/Artigen/pull/103) 提交到 `dev` 审核；不得绕过 Core、跨浏览器 E2E 与 Release gate。本文记录的是已提交实现，不代表已经合入 DEV 或发布生产。
- 本轮不触碰 Karing、B2U2/AI Wi-Fi、DNS、系统代理、节点或路由。`ui-review/` 始终作为用户未跟踪资产，禁止读取、进入、修改、删除、暂存或提交。下一步只能通过 feature PR 合入 `dev`，再执行同 SHA DEV smoke；尚未发布到生产。

## 2026-08-19 无边框工作台细节优化（生产已发布）

- 用户确认保留已上线的暗色三栏工作台和三条既有路由，只做细节层面的专业化收敛：左、中、右区域改用相邻背景与间距区分，不再依赖常驻装饰边框；酸性绿只承担主动作、执行节点和焦点信号。没有改变产品结构、执行器、报价、冻结、审批、取消、交付或模型边界。
- 统一 Shell、Create、Computer Agent、Run Detail、Composer 与执行卡已去除重复模型口号、`LOCAL FIRST` 标记、编号建议卡和嵌套描边。中心区只保留目标、关键结论、澄清、审批、费用、错误和交付；计划、文件和审计分别保留在右侧对应页签。
- 新增共享 `TechnicalDetails` 折叠组件。Qwen/Kolors、Provider、沙箱、Worker、受限出口、队列、保留期、授权时效、并发和子 Agent 能力边界默认不打扰普通用户，但仍可通过语义化 `details/summary` 完整查看；费用、审批影响、失败退款与文件验证始终可见。
- 无障碍与响应式细节同步硬化：8px 可拖拽分隔命中区只在 hover/drag/focus 显示分隔线，键盘方向键/Home/End 能继续调整；表单名称、焦点环、44px 移动触控、附件 local-first 提示、懒加载交付图片和 reduced-motion 均纳入回归。跨浏览器检查真实发现并修复 WebKit 移动历史项仅 42px 的缺口。
- 三遍本地审核依次覆盖结构/几何、暗浅/系统主题与可用性、代码/全量回归。Impeccable 核心七文件机械检测为 `[]`；工作台专项矩阵在 Chromium、Firefox、WebKit desktop、360、390 与 WebKit 768 为 120/120。完整 `pnpm check` 退出码 0：前端单元 216/216、Playwright 483 passed / 3 条既有条件跳过 / 0 failed（16.3 分钟），后端、邮件、Agent 质量、生产构建和 87.5 KiB gzip 初始 JS 预算全部通过。
- 本轮只修改前端、E2E、设计规范与 Handoff，不修改后端、API、数据库、模型、Worker、生产开关、Karing、B2U2/AI Wi-Fi、DNS、系统代理、节点或路由。`ui-review/` 继续作为用户未跟踪资产，禁止读取、进入、修改、删除、暂存或提交。
- 实现经 PR [#98](https://github.com/FengFan-1997/Artigen/pull/98) 的 Core、8 路 E2E 与 Release gate 全绿后合入 `dev`，merge SHA 为 `a7617c40bba0adeff42ff702998177501c893920`。随后 PR [#100](https://github.com/FengFan-1997/Artigen/pull/100) 以零文件差异把上一轮 `main` 历史同步回受保护的 `dev`，最终 DEV SHA 为 `30606409559d4b38c26ec5b781121682ee1c18c1`；没有直接 push 或绕过 up-to-date 保护。
- Render DEV deployment `dep-da2knpjbc2fs73fqepag` 为精确 `3060640...` 的 `live` 部署；Vercel Preview deployment `5977261691` 为同 SHA `success`。带 DEV 访问门禁重新读取 `/api/meta`、`/readyz`、Agent、设计对话和生图模型接口均 HTTP 200，数据库迁移 023、S3、SiliconFlow、Qwen3/Kolors 与两种图片模式 ready。DEV Mac Worker 延续既有离线状态、queue=0，本轮没有把配置存在误报为 Worker ready。
- Release PR [#99](https://github.com/FengFan-1997/Artigen/pull/99) 的 main 分支策略、push/PR 两套 Core、全部 E2E 与 Release gate 最终均成功后合入 `main`，生产运行 SHA 为 `ed308b828593fbd20e60fe2e82b0850fa30d0d99`。两个 Cloudflare Workers 外部状态仍是既有非 required failure，未计作通过。
- 生产三端已对齐该不可变 SHA：Render deployment `dep-da2mns7qj5pc7384p83g` 为 `live`；Vercel 精确 Preview `dpl_87J5vpVGa2wDaCEpGJTZmAqPFxyS` 经 `/api/meta` 与 `/readyz` 验证后显式 promote，production deployment `dpl_Hdvv39w5xjgUwaL3eSstcbDo9xaX` 为 `READY` 并接管 `artigen-fengfan.vercel.app`；Mac Worker 来自 `/Users/fengfan/Public/personal/Artigen-worker-production-ed308b8`，LaunchAgent 的程序与工作目录精确指向该 worktree，并保留 `AGENT_SUBAGENTS_ENABLED=true`。
- 最终生产 `/api/meta`、`/readyz`、`/api/agent/status`、`/api/design-assistant/status` 与 `/api/generation/models` 均 HTTP 200；`gitSha=ed308b8...`，PostgreSQL、S3、SiliconFlow、爱发电与邮件 ready，Worker、浏览器、受限出口、桌面中继和 `shared-v1` 子 Agent ready，queue=0。文字/规划/父子 Agent 仍只使用 `Qwen/Qwen3-8B`，全部图片仍只使用 `Kwai-Kolors/Kolors`，两种图片模式均 `available=true`。
- 真实生产 Create/Agent 页面在 1440、1024、768、390px 共 8 个状态重新截图，全部 HTTP 200、统一 Shell 存在、无横向溢出和页面错误；人工逐张复核无边框层级、阅读轴、三栏/抽屉切换、Composer、Inspector 与移动端均无遮挡、裁切或错位。证据保存在被忽略的 `.artifacts/workspace-borderless-polish-prod-ed308b8/`。本轮只改变 UI 与文档，未重复运行付费模型 smoke。
- Docker Desktop 在 Worker 切换窗口被发现未运行；启动 Docker 后 Worker 正确从 fail-closed 恢复 ready。全过程没有修改 Karing、B2U2/AI Wi-Fi、DNS、系统代理、节点或路由配置，`ui-review/` 始终未读取、修改、删除、暂存或提交。

## 2026-08-18 数字打样台 UI 回滚决定

- 用户明确否决 PR #82 的浅色“数字打样台”视觉，决定完整恢复此前的 Codex 式深色三栏工作台；本次回滚只覆盖 PR #82 的前端实现、视觉测试、设计规范与截图，不回滚 Agent runtime、子 Agent、迁移 023、计费、安全、模型或 Worker 能力。
- 为先恢复线上体验，Vercel 生产别名已紧急重新指向上一版已验证 deployment `dpl_9CvQPz1acPPF5fdBYjWMjTwjeKPs`（源 SHA `55296af5d40cff3aefd30fa980ab8b6c1c96aa28`）。Render 与 Mac Worker 继续运行 `b6c1cc6b169dc1694f409a93f7dea4ca2a60f7ac`；这是前端紧急回滚期间的有意短暂版本差异。
- 持久代码回滚必须继续经过 `feature → dev → main` 门禁。完成后应重新以同一个新的 `main` SHA 发布 Vercel、Render 与 Mac Worker，并重新核验 `/api/meta`、`/readyz`、Agent status、模型和页面 smoke。
- 此次操作没有修改 Karing、B2U2/AI Wi-Fi、DNS、系统代理、节点或路由配置。

## 2026-08-18 深色工作台布局硬化（生产已发布）

- 用户确认继续使用恢复后的 Codex 式深色三栏工作台，本轮不改变视觉方向，只修复 `/artigen/create`、`/artigen/agent` 与 `/artigen/agent/runs/:runId` 的遮挡、错位、溢出、短视口、横屏、抽屉、长内容、触控和键盘问题。
- 分支 `codex/dark-workspace-layout-hardening` 基于 `origin/dev` SHA `024d2827e8011cd09dd3d7475bd37028a3ca27fa`。主要修复包括：三栏 slotted 内容统一 `border-box`、顶部标题与控制区防碰撞、右侧 Inspector 页签与徽标分离、关闭抽屉 `inert`、焦点恢复、短视口紧凑布局、移动安全区与 44px 触控目标、长文本安全换行、附件与审批可访问名称、可见焦点和 reduced-motion 边界。
- 新增工作台几何审计辅助器，自动检测 document 横向溢出、应用 chrome 裁切、标题/操作区碰撞、底部 composer 越界、徽标/图标重叠、关闭抽屉仍可交互，以及移动端关键触控目标不足。截图矩阵覆盖 1440、1180、1024、768、430、390、360、844/667 横屏与 200% 等效窄视口，三轮共生成 112 张本地审查截图；最终代表性证据同步到 `frontend/.impeccable/review/`。
- 三遍独立自审依次覆盖基线视觉问题、几何/键盘/响应式回归和六浏览器最终矩阵。最终 Impeccable 机械检测为 `[]`，聚焦工作台回归 120/120；完整 `pnpm check` 退出码 0，其中前端单元 216/216、后端 414 passed / 41 条显式外部跳过、邮件 7/7、Agent 质量集 50/50、Playwright 483 passed / 3 条条件跳过 / 0 failed，生产构建与 87.5 KiB gzip 初始 JS 预算均通过。
- PR #89 全部仓库门禁通过后合入 `dev`，merge SHA `102d70cde8dae1a907fa66fb79f500792aadbfa2`；Render DEV deployment `dep-da22n8b7uimc73deom30` 为 `live`，Vercel Preview deployment `5960304577` 为 `success`，同 SHA 的五个接口均 HTTP 200、readiness ok、两种生图模式 available、队列为 0。
- 真实 DEV 的 1440/1024/390/360/667 横屏截图连续发现三处仅在 DEV 徽标存在时暴露的问题：390px 标题、360px Create 副标题和 390px Inspector 关闭按钮曾被徽标覆盖。跟进修复将窄屏徽标缩为右上 `DEV`，只在徽标存在时为顶栏动作和 Inspector 标题分配独立安全槽，低于 400px 隐藏次要顶栏说明，并统一到正式 Warning / 深墨语义色；生产无徽标时不保留空槽。
- 几何审计同步从容器矩形升级为 DOM Range 的真实文字像素边界，并覆盖全局环境徽标与标题、操作按钮、Inspector 关闭按钮的相交检测。修复期间追加两轮各 40 张截图和多轮 6 浏览器定向复核，最终 120/120；Impeccable 对 App、统一 Shell 与三条核心视图的终检为 0 条。最终完整 `pnpm check` 再次退出码 0：Playwright 483 passed / 3 条既有条件跳过 / 0 failed，耗时 15.8 分钟。
- 跟进 PR #91 全部门禁通过后合入 `dev`，merge SHA `5ec3f2a78d1d4e5455ceb689529b63343fbf86f1`；Render DEV deployment `dep-da241lou01pc73en49t0` 为 `live`，`/api/meta.gitSha`、`/readyz` 和状态接口已重新核验为同一 SHA。真实 DEV 1440/1024/768/390/360/667 截图又发现 1024px Agent 标题被全局 DEV 徽标遮挡；将该缺口加入全部断点后，又在 1200px 三栏边界发现运行状态胶囊与长版徽标相撞，因此该 SHA 未获发布许可。
- PR #92 已将 1440px 以下 DEV 徽标的紧凑布局与 1439/1440、1199/1200、799/800、399/400 成对边界回归合入 `dev`，merge SHA `a4bf63c990a94b40196b6d783bb0c391234019fa`；Render DEV deployment `dep-da24ka142hec73fbej7g` 为同 SHA `live`，`/api/meta`、`/readyz`、Agent、对话和生图模型接口均 HTTP 200。随后 36 张真实 DEV 静态与抽屉截图发现移动历史抽屉的“刷新任务”仍只有 28×28px：它没有遮挡，但低于 44px 触控下限。跟进分支 `codex/dark-workspace-drawer-touch-target` 将该按钮在移动宽度提升为 44×44px、增加可见焦点，并把打开后的左右抽屉稳定态纳入几何审计；六浏览器定向回归 12/12、完整工作台矩阵 120/120，新增截图批次 `pass-9` 为 71 张。最终 `pnpm check` 退出码 0：Playwright 483 passed / 3 条既有条件跳过 / 0 failed，耗时 16.3 分钟；Impeccable 核心五文件扫描为 `[]`。
- 跟进 PR #93 的 Core、8 路 E2E 和 Release gate 全绿后合入 `dev`，merge SHA `9399109a607125bcb1ab13c4099f83d7e9578519`。Render DEV deployment `dep-da25a01srm7s738eve50` 为该 SHA `live`，Vercel Preview deployments `5963066625`、`5963082012` 均为 `success`；`/api/meta.gitSha` 精确相同，`/readyz`、Agent、设计对话与生图模型接口均 HTTP 200，迁移仍为 `023_agent_subagent_runtime_hardening`，Qwen3/Kolors 锁定和两种图片模式可用。真实 DEV 生成 43 张 Agent/Create 临界视口、短视口、横屏与 360/390 抽屉截图，自动审计 40 个状态的横向溢出、chrome 裁切、标题/操作区、环境徽标、Inspector、Composer 和移动触控目标均为 0 问题；刷新按钮实测 44×44px。人工复核 1440、1439、1200、1199、1024、800/799、390/360 和四种抽屉稳定态未见遮挡或错位。DEV Worker 延续既有离线状态、队列为 0；本次纯前端验收不冒充真实 Agent smoke，通过 DEV 视觉门槛后方可进入 `dev → main`。
- 最终 DEV 证据 PR #94 合入后 SHA 为 `64ae78af3d982ee404eae5d4413b34a0556b9fae`；Render DEV deployment `dep-da25hnjncjis73fbumug` 为同 SHA `live`，Vercel Preview deployments `5963361873`、`5963346096` success。Release PR [#95](https://github.com/FengFan-1997/Artigen/pull/95) 的 main 分支策略、Core、8 路 E2E 与 Release gate 全绿后合入，生产不可变 SHA 为 `78577097e71689bb8f20ac09ad655e00abc2de00`。两个 Cloudflare Workers 外部检查仍为已知非门禁失败，没有计作通过。
- 生产三端已对齐该 SHA：Render deployment `dep-da25tnojo6nc73fn69a0` 为 `live`；Vercel production deployment `dpl_7zLQ6CToeJ9aKGQKVyNSk8k6RPEm` 为 `READY` 并 alias 到 `artigen-fengfan.vercel.app`；Mac Worker 从不可变 worktree `/Users/fengfan/Public/personal/Artigen-worker-production-7857709` 运行，LaunchAgent 的程序与工作目录均精确指向该 worktree。
- Vercel 的 GitHub main build `dpl_G2vHiFM7cq3J4uAVrZXjs2aFYpEk` 最初被标记为 Preview，生产域名仍指向旧 deployment `dpl_HxXczXrdypHaR5dRz7VhwjCP22LH`。首轮 20 张生产截图因此真实复现旧构建的 Composer content-box 裁切与关闭抽屉未 inert；没有把 Render `/api/meta` 的新 SHA 误当成前端已更新。将该精确 Preview 显式 promote 后生成上述 production deployment，重新确认 production asset hash 已变化，再从零重跑截图矩阵。
- 最终生产截图位于 `.artifacts/workspace-layout-hardening/prod-7857709/`：Agent/Create 各覆盖 1440、1200、1199、1024、800、799、390、360，并覆盖 390px 历史和 Inspector 抽屉，共 20 张。自动几何审计结果为 0 横向溢出、0 chrome 裁切、0 顶栏碰撞、0 Composer 越界、0 Inspector 徽标重叠、0 未 inert 的关闭抽屉、0 小于 44px 的可见移动触控目标，且生产不存在 DEV 徽标或对应空白占位；20 张均已人工查看。
- 最终生产 `/api/meta`、`/readyz`、`/api/agent/status`、`/api/design-assistant/status` 与 `/api/generation/models` 均 HTTP 200；迁移为 `023_agent_subagent_runtime_hardening`，Worker、浏览器、受限出口、桌面中继与子 Agent ready，queueDepth=0。文字/规划/父子 Agent 继续锁定 `Qwen/Qwen3-8B`，全部图片继续锁定 `Kwai-Kolors/Kolors`，两个图片模式均 `available=true`。本轮只修改前端与测试，不重复消耗真实模型点数。
- 本轮没有修改 Karing、B2U2/AI Wi-Fi、DNS、系统代理、节点、路由、模型、Agent runtime、数据库、计费或生产开关。`ui-review/` 始终禁止读取、进入、修改、删除、暂存或提交。

## 1. 新接手者先看结论

Artigen 当前使用以下正式交付链：

```text
功能分支
→ PR 到 dev
→ CI
→ DEV 自动部署与 smoke
→ dev PR 到 main
→ Release gate
→ 合并 main
→ 从 main 的不可变 SHA 人工发布生产
→ 生产 smoke
```

`main` 是正式生产代码来源；`dev` 是 DEV 集成分支。旧的 `codex/artigen-overhaul` 和 `test` 仅保留历史，不再作为日常开发或生产来源。

截至 2026-08-12 的已验证生产基线：

| 项目 | 正式状态 |
| --- | --- |
| GitHub 仓库 | `FengFan-1997/Artigen` |
| 生产运行时代码 | `main`，SHA `49618cf603a1f4f18b5ec4b454fef489dc4c7a39` |
| 生产前端 | Vercel `artigen-fengfan`，deployment `dpl_BMb4TusD75y2mmQ3EH4L9zQTUE3C`，`READY` |
| 生产后端 | Render `artigen-app-fengfan`，Service `srv-d9cr73r7uimc73etc4j0` |
| 生产部署 | Render deployment `dep-d9u0ntqjobas73e0uho0`，`live` |
| 生产数据库 | Neon PostgreSQL `neondb` |
| DEV 数据库 | Neon PostgreSQL `dev_artigen` |
| 对象存储 | 私有共享 S3 桶 `artigen-assets` |
| 数据库迁移 | `020_agent_secure_browser_relay` |
| GitHub 发布流水线 | run `31567870806`，Release gate `success` |
| 生产功能开关 | 付费、支付、AI Design、Workshop、Task Worker 与 Agent 生图已开放 |

生产精确 SHA 不能只依赖文档，必须读取 `/api/meta` 并与 GitHub `main` 和平台 deployment 交叉核对。

## 2. 正式线上入口

| 用途 | 地址 |
| --- | --- |
| 生产站点 | <https://artigen-fengfan.vercel.app/artigen> |
| AI 生图 | <https://artigen-fengfan.vercel.app/artigen/ai> |
| 浏览器 Agent | <https://artigen-fengfan.vercel.app/artigen/agent> |
| 登录 | <https://artigen-fengfan.vercel.app/login> |
| Render 后端 | <https://artigen-app-fengfan.onrender.com> |
| 版本 | <https://artigen-app-fengfan.onrender.com/api/meta> |
| Readiness | <https://artigen-app-fengfan.onrender.com/readyz> |
| Agent 状态 | <https://artigen-app-fengfan.onrender.com/api/agent/status> |
| DEV | <https://dev-artigen-app-fengfan.onrender.com/artigen> |
| 邮件中继 | <https://artigen-mail-relay.vercel.app> |

当前使用平台自带 HTTPS 域名，没有接入自定义域名。

## 3. 已固化的系统边界

### 3.1 Web、数据和鉴权

- 前端是 Vue 3 + Vite SPA，生产托管在 Vercel。
- 后端是 Express/CommonJS，生产托管在 Render。
- PostgreSQL 16 是账户、任务、订单、钱包、审计和 Agent 状态的业务真相。
- 生产文件和 Agent 交付物使用共享 S3；多实例生产不能回退到本地文件。
- 普通用户鉴权使用同源 HttpOnly Cookie + CSRF，不接受浏览器持久化 bearer token。
- 生产邮箱登录使用 Turnstile 和一次性邮箱验证码，秘密配置由平台注入。
- 真实密码、Token、数据库 URL 和 Environment Export 不进入 GitHub。

### 3.2 分支与发布

- 日常功能、修复和文档从功能分支通过 PR 进入 `dev`。
- DEV 验证完成后才允许 `dev → main`。
- 不直接 push `dev` 或 `main`。
- 合并 `main` 不等于已经生产发布；生产部署和生产 smoke 是独立的人工步骤。
- 生产只能发布 `main` 上选定的不可变 SHA。
- `/api/meta`、`/readyz`、部署 ID 和 smoke 是正式发布证据。
- 数据库迁移在发布切流量前带锁执行；失败时停止发布。

### 3.3 双层 Handoff

项目采用两层交接：

| 文件 | 是否进 Git | 用途 |
| --- | ---: | --- |
| `HANDOFF.local.md` | 否 | 当前任务的阶段、具体进度、临时尝试、测试和下一步 |
| `PROJECT_HANDOFF.zh-CN.md` | 是 | 当前正式项目状态和已经确定的持久事实 |

AI 必须在每个 Artigen 任务结束前更新本地 Handoff。有持久影响的代码、配置、文档、迁移、部署或正式决定必须在同一 PR 更新本文。

详细规则见 [`AGENTS.md`](./AGENTS.md) 和 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 4. Agent Production Beta

浏览器 Agent 已完成真实生产端到端验收，不再是只有核心测试、没有环境配置的状态。

正式配置：

| 项目 | 当前值 |
| --- | --- |
| 发布等级 | Production Beta / owner-only |
| 模型 Provider | 硅基流动 |
| 模型 | `Qwen/Qwen3-8B` |
| 本地模型 | 不下载、不使用 Ollama |
| Worker | 当前 Mac + Docker Desktop + LaunchAgent |
| Worker 并发 | 1 |
| CUA 镜像 | `artigen/cua-xfce:0.1.15-tools-v2` |
| 浏览器模式 | `full-approval-v1` |
| 出口策略 | `restricted-v1` |
| Beta 模式 | `owner-only-v1` |
| Agent 图片能力 | `Kwai-Kolors/Kolors` 统一承担文生图和单参考图图生图；DEV 与生产均已真实验证 |
| Agent 图片计价 | 文生图 8 点；单参考图 12 点；任务总额仍受报价与 `maxCredits` 约束 |
| 严格模型白名单 | `Qwen/Qwen3-8B` 负责文字理解/拆解/工具决策，`Kwai-Kolors/Kolors` 负责全部图片；DEV 与生产均已真实验证 |
| 图片交付 | `IMAGE`，PNG/JPEG/WebP；允许独立满足任务完成条件 |

上表的双模型边界已在第 1 节列出的不可变运行 SHA 上发布，并由生产文生图与单参考图 Run 复核实际模型、点数、S3、SHA-256 和交付验证状态。

已验证运行状态：

```text
workerOnline=true
browserReady=true
egressVerified=true
desktopRelayReady=true
browserPublicEnabled=true
imageGenerationPublicEnabled=true
accessMode=owner-only-v1
availabilityNote=ready
queueDepth=0
```

真实生产链路已完成：

```text
创建任务
→ Mac Worker 领取
→ Docker/CUA 安全沙箱
→ 硅基流动 Qwen
→ 浏览器访问
→ noVNC 人工登录接管
→ 加密保存并恢复单站会话
→ 生成 Markdown/PDF
→ 或生成、验证独立 IMAGE 图片设计稿
→ 独立验证
→ 上传共享 S3
→ succeeded
```

Agent 的完整架构、安全边界、真实 Run ID、测试、账号和运维细节见 [`ARTIGEN_AGENT_FULL_HANDOFF.zh-CN.md`](./ARTIGEN_AGENT_FULL_HANDOFF.zh-CN.md)。

## 5. 最近完成的重大变更

### 5.1 浏览器 Agent Production Beta

最终生产合并：PR [#14](https://github.com/FengFan-1997/Artigen/pull/14)，`main` SHA `529b73fffcd2f06323ccd373168a5e009f312b5a`。

完成内容：

- 硅基流动 `Qwen/Qwen3-8B` 云端模型，不下载本地权重；
- Mac 独立 Worker、LaunchAgent 和 macOS Keychain；
- 每任务 Docker/CUA、安全出口代理和网络清理；
- SSRF、DNS rebinding、私网、元数据、NAT64 和危险端口防护；
- 表单/外部状态变更审批，密码/OTP 人工接管；
- Render 反向 WebSocket + noVNC 一次性桌面票据；
- 加密保存、恢复、撤销和擦除单站浏览器会话；
- 共享 S3 交付物和独立验证；
- owner-only Production Beta 门禁。

正式验证：

- 后端：343 通过、38 跳过；
- 前端单元：211/211；
- Agent/RFB/PostgreSQL：68/68；
- Agent 质量集：40/40；
- Playwright：405 通过、3 条条件跳过；
- 真实登录捕获、会话恢复和 4 个 S3 交付物通过。

### 5.2 AI Handoff 治理

本次文档治理固化：

- 根目录 `AGENTS.md` 作为所有 AI 的仓库级规则；
- 本地 `HANDOFF.local.md` 作为被 Git 忽略的阶段工作台；
- 本文作为 GitHub 项目级正式 Handoff；
- `CONTRIBUTING.md` 和 PR 模板要求持久改动同步正式 Handoff；
- 正式文档只记录最终事实，本地文件记录具体开发阶段；
- Reviewer 负责 Handoff 门禁，不新增 CI 强制脚本。

治理规则在包含这些文件的提交合入目标分支后生效；未合并的工作分支不能代表 `dev` 或
`main` 已经采用该规则。实际合入状态以 GitHub 为准。

### 5.3 Agent 生图与付费主业务恢复（历史上线证据）

Agent 生图、独立 `IMAGE` 交付、主业务付费工具、任务 Worker 和爱发电下单链路已完成 DEV、Release gate 和真实生产验收。运行时代码最终经 PR [#18](https://github.com/FengFan-1997/Artigen/pull/18) 至 [#25](https://github.com/FengFan-1997/Artigen/pull/25) 逐步合入，生产运行 SHA 为 `ca75dce39ef5eebd27154029ef19ad1cc25b5758`。Render 与 Vercel 使用该不可变代码发布，生产 Mac Worker 也从同一 SHA 重新安装并启动。

正式生产配置：

- Agent 继续为 `owner-only-v1`；主业务付费工具向所有登录用户开放；
- `PAID_FEATURES_ENABLED=true`、`PAYMENTS_ENABLED=true`、`AI_DESIGN_TASK_V2_ENABLED=true`、`AI_DESIGN_TASK_V2_ROLLOUT_PERCENT=100`、`WORKSHOP_AI_TASK_V2_ENABLED=true`、`TASK_WORKER_ENABLED=1`；
- `AGENT_PUBLIC_CAPABILITIES=files,shell,browser,generate_images`，`imageGenerationPublicEnabled=true`；
- 当时纯文生图与参考图曾使用不同图片模型；2026-08-12 起两者统一由 Kolors 执行，参考图上限收紧为 1 张，历史 Run 继续作为结算与持久化证据；
- `render.yaml` 仍保留安全关闭默认值，生产值由 Render 环境覆盖；
- 定价、冻结、结算、退款、幂等和 S3 边界保持服务端控制；没有新增数据库迁移。

DEV 真实依赖验收：

- 七个付费 executor 全部 success；标准文生图、商品参考生成与其他五个既有操作均完成 S3、尺寸、SHA 和单次结算验证；
- Agent 文生图 Run `cf2af670-074e-4ab4-b4d6-32d0ac478e30`：图片工具 8 点，总计 13 点，1024×1024 PNG，验证 passed；
- Agent 参考图 Run `30273e85-8445-4baf-9658-601ac6579246`：图片工具 12 点，总计 19 点，960×1200 PNG，验证 passed。

生产真实验收：

- 该次验收时两个 profile 均为 available；严格模型白名单发布后仍保持 `standard-v1.available=true`、`product-reference-v1.available=true`，后者 `maxReferences=1`；
- 七个主业务 executor 全部 success 且各自只结算一次：视觉方向 `4ad2e104-2ffe-4f36-a0e1-e049123a78a9`、标准文生图 `f9ce713d-5150-4b9d-9813-d902a42afbd8`、商品参考 `51c89f88-1d6b-4f77-868a-566411d7ee98`、老照片 `9ad73581-8961-4651-8473-d2a4ef36a75b`、证件照 `f46e3202-82b3-4a12-a053-7b7af937dd51`、背景场景 `baa8e32b-ec30-468e-a8a2-b43cfeb5c98b`、配料整理 `863a21e3-05e0-4b17-ab64-16b35d3f4168`；合计 100 点；
- 未支付爱发电订单 `c10996c8-8e20-4c2a-ab4e-a07d0ce84ca4` 已取得跳转链接，保持 `pending`，钱包未入账，幂等重放没有重复建单；没有执行真实付款；
- Agent 文生图 Run `b277a1d1-1195-4462-8828-89314600878c`：图片工具 8 点，总结算 12 点，1024×1024 PNG，S3 与 SHA-256 验证 passed；
- Agent 参考图 Run `eaae124b-1064-44e2-b8e4-f7b46a0b39a4`：图片工具 12 点，总结算 18 点，960×1200 PNG，S3 与 SHA-256 验证 passed；
- 两个生产 Agent Run 均只结算一次，结束后 Worker online、浏览器/出口/桌面中继 ready、queueDepth=0。

最终验证：`pnpm check` 通过；Playwright 411 通过、3 条条件跳过；后端 355 通过、39 条条件跳过；Agent/CUA 定向测试 59/59 通过；PostgreSQL 支付集成测试 7/7 通过。生产发布后再次核验 Render 与 Vercel `/api/meta` 均返回运行 SHA `ca75dce39ef5eebd27154029ef19ad1cc25b5758`。

### 5.4 严格模型白名单（2026-08-12）

- 运行时只允许 `Qwen/Qwen3-8B` 与 `Kwai-Kolors/Kolors`：前者负责所有文本理解、任务拆解、提示词与工具决策，后者负责所有图片输出，包括文生图、商品参考、老照片、职业形象和 AI 背景。
- SiliconFlow 官方 Kolors 契约支持通用 `image` 字段，但额外的 `image2`、`image3` 属于其他编辑模型。因此 Agent 和主业务最多接受 1 张参考图，2 张及以上在供应商派发前返回 `REFERENCE_IMAGES_NOT_SUPPORTED`。
- `standard-v1.maxReferences=0`，`product-reference-v1.maxReferences=1`；两者运行时内部图片模型均固定为 Kolors。Agent `generate_image.references.maxItems=1`，参考路径仍必须精确命中本次 Run 的已扫描输入。
- 老照片、职业形象、AI 场景背景继续使用单张输入图并统一调用 Kolors；四方向分析、配料原文整理和 Agent 编排统一调用 Qwen3-8B。
- 不新增数据库迁移；历史 SKU 与 profile ID 保留。任何客户端模型参数都不能改变服务端双模型白名单。
- 运行时代码经 PR [#28](https://github.com/FengFan-1997/Artigen/pull/28) 合入 `dev`；模型证据与可重复 DEV smoke 经 PR [#29](https://github.com/FengFan-1997/Artigen/pull/29) 合入；图片交付物禁止编造未观察来源的修复经 PR [#30](https://github.com/FengFan-1997/Artigen/pull/30) 合入。当前已验证 DEV SHA 为 `f42152eacd8bb73522409ccb8c3550349b140f86`，Render deployment `dep-d9u0768ae00c73bo0rd0` 为 `live`。
- DEV 文生图 Run `f4c76b79-acde-412b-901d-2be134c63e12` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，0 张参考图，图片调用 8 点、总计 12 点；PNG 1024×1024、1838340 bytes、SHA-256 `80dc3ae7ff3904fe337f53ccf773a4af55edf42e62849c2d60a2a29c76a2d417`，S3 与 verification passed。
- DEV 单参考图 Run `3d849ca5-ec6c-4ba9-8380-ee86240d65e8` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，1 张 `product` 参考图，图片调用 12 点、总计 19 点；PNG 960×1200、1575449 bytes、SHA-256 `623bef6bc3927a59848997d011b685cbd30f1e6e3b0e0d580b92e7ee9ab7db02`，S3 与 verification passed。
- 首次 DEV 文生图 Run `ef16b5fd-2022-49c3-bd68-eb595f81510d` 正确使用 Qwen3 与 Kolors，但 Qwen 在交付声明中编造了未观察来源，最终以 `AGENT_ARTIFACT_SOURCE_NOT_OBSERVED` 失败；图片调用 8 点只结算一次，其余冻结释放。PR #30 将“无实际观察 URL 时 sources 必须为空”固化到系统指令、工具 schema 说明和 smoke 目标，随后两条 Run 均通过。
- 两张成功图片已下载到被 Git 忽略的 `.artifacts/dev-two-model-image-smoke-2026-08-12T05-27-39-597Z/` 并人工查看；无空图、损坏或明显裁切问题。该次单参考图使用合成素材，只证明单图输入、Kolors 路由、角色、持久化和结算，不把真实商品身份保持质量作为本轮通过条件。
- 上述 smoke 结束后 DEV Worker online，浏览器、受限出口和桌面中继 ready，`queueDepth=0`；活动 Agent Run、工具任务和 held budget 均经数据库复核为 0。
- Release PR [#32](https://github.com/FengFan-1997/Artigen/pull/32) 的分支策略、Core、八组桌面/移动 E2E 与 Release gate 全绿后合入 `main`；不可变生产运行 SHA 为 `49618cf603a1f4f18b5ec4b454fef489dc4c7a39`。
- Render deployment `dep-d9u0ntqjobas73e0uho0` 为 `live`，Vercel production deployment `dpl_BMb4TusD75y2mmQ3EH4L9zQTUE3C` 为 `READY` 并 alias 到 `artigen-fengfan.vercel.app`；两者与 `/api/meta` 均对应上述 SHA。生产 `/readyz` 为 `ok=true`，`standard-v1.maxReferences=0`、`product-reference-v1.maxReferences=1` 且两者均 `available=true`。
- 生产 Mac Worker 已从同一 SHA 重新安装并启动；最终 `workerOnline=true`、`browserReady=true`、`egressVerified=true`、`desktopRelayReady=true`、`imageGenerationPublicEnabled=true`、`queueDepth=0`。
- 生产文生图 Run `47fd3b28-459e-4e25-97f3-301b363bc097` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，0 张参考图，图片调用 8 点、总计 14 点；PNG 1024×1024、1927956 bytes、SHA-256 `dd92ed33b1a52deeec9c08bfa2aa755720305c1896aaf582bae925313bf8ee85`，S3 与 verification passed。
- 生产单参考图 Run `e55352bf-30cd-49b3-b1df-da1c136608f1` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，1 张 `product` 参考图，图片调用 12 点、总计 17 点；PNG 960×1200、1665333 bytes、SHA-256 `ef52822da46bb0071fa4b97b3acb09f0faf70dcfea998dc3bc8bb33661efb1de`，S3 与 verification passed。
- 两张生产产物保存在被 Git 忽略的 `.artifacts/production-two-model-image-smoke-2026-08-12T06-09-26-477Z/`，已人工查看且无空图、损坏或明显裁切。参考输入为合成抽象图，本次只把它作为单图输入、Kolors 路由、角色、持久化与结算证据，不把真实商品身份保持质量列为通过项。
- 生产 smoke 后数据库再次确认活动 Agent Run、活动工具任务、held Agent budget 与 held tool credit 均为 0。源码硬审计未发现 `Qwen/Qwen-Image-Edit-2509`、Gemini 或其他第三模型的生产引用；全部运行时模型字面量仅保留 Qwen3 与 Kolors。

### 5.5 对话式设计 Agent 主入口（生产已发布）

2026-08-12 从 `origin/dev` SHA `ccff8a94450d972bac19d26ec26d056c9e6341c3` 建立 `codex/design-conversation-entry`，实现统一设计入口 `/artigen/create`。运行时代码与 DEV 修复经 PR [#35](https://github.com/FengFan-1997/Artigen/pull/35)、[#36](https://github.com/FengFan-1997/Artigen/pull/36)、[#37](https://github.com/FengFan-1997/Artigen/pull/37) 合入 `dev`；首轮 DEV 验收 SHA 为 `918ba05c23a7adc1f3140ea03c9b8e1e31b177b8`，最终修复、发布和实时生产证据见本节末尾。

持久架构与接口变更：

- 新增迁移 `021_design_conversations`，分别保存 30 天过期的加密会话与消息、执行引用、附件、游标事件、持久化规划队列和会话授权；消息使用实体、行与角色绑定的 AES-256-GCM，不复用仅适用于 Agent 运行载荷的 `agent_run_payloads`。
- 新增 `/api/design-assistant/status` 与 `/api/design-conversations` 会话、消息、附件、执行、预算、取消、游标 SSE 和授权接口；每个执行只能关联一个 `toolTaskId` 或 `agentRunId`，跨用户读取统一返回资源不存在。
- 服务端规划模型硬锁为 `Qwen/Qwen3-8B`，所有图片工作流硬锁为 `Kwai-Kolors/Kolors`。路由只允许 `reply | local_tool | tool_task | agent_run` 及服务端工具目录中的合法操作；最多一轮、两项关键澄清。
- 文生图和单参考图进入现有 AI Design/Kolors 工作流；老照片、背景、证件照和配料整理进入对应专项工作流；图片压缩、PDF 转换等本地任务通过五分钟、单次使用的浏览器内 handoff 打开准确工具；调研、浏览器、Shell 和多格式交付进入 Computer Agent。
- 附件默认只保留在浏览器，规划确定云端执行后才上传。Kolors 路径只选择第一张兼容 PNG/JPEG/WebP，其余文件保持本地；本地工具不会静默上传。
- 自动执行默认最高 50 点，先取得服务端真实报价再创建；超预算或余额不足不创建、不冻结。提高预算只影响当前执行，SSE 预算更新只刷新状态，仍需用户再次点击启动。
- Agent 新增 `authenticated-v1` 访问模式，允许全部已登录且状态正常的账户；继续保留单用户活动任务限制、全局队列、限流和服务端权限校验。Mac Worker 目标并发为 2，但 CPU、内存、浏览器出口或桌面中继不满足条件时自动回退到 1。
- 第三方写操作授权精确绑定会话、HTTPS origin 和动作类型，30 分钟闲置失效并可撤销；当前动作必须先通过一次性审批，之后才能保存持续授权。密码、OTP、验证码、支付、安全绕过和受监管决定不能被会话授权覆盖。
- 主导航“创作”和营销首页创作 CTA 指向 `/artigen/create`；游客发送时进入登录，成功后自动续发草稿。现有 `/artigen/ai` 和 `/artigen/agent` 继续作为高级工作台。
- `render.yaml` 与示例环境中的对话入口、规划 Worker 默认保持关闭；DEV 和生产只能在完成迁移、真实依赖 smoke 和发布门禁后通过平台环境显式开启。

本地验证已覆盖消息加密、跨用户隔离、路由分类、模型硬限制、澄清上限、工具白名单、单参考图上传边界、50 点预算、授权范围、事件清理、Worker 并发回退、登录续发、桌面/移动布局、预算 SSE、失败恢复、焦点管理和无障碍状态。PostgreSQL 迁移集成测试已在本机开发库通过；独立实现与视觉复审最终为 PASS。完整 `pnpm check` 通过，其中 Playwright 为 441 passed / 3 skipped / 0 failed；PR #36 与 #37 的 GitHub Core、全部浏览器分片及 Release gate 均通过。两个不属于必需门禁的 Cloudflare Workers 外部构建仍无注解失败，本次未修改 Cloudflare 服务。

DEV 真实依赖与部署验收（2026-08-13）：

- Render DEV deployment `dep-d9uq4j0ae00c738ktqdg` 为 `live`，`/api/meta.gitSha` 精确等于 `918ba05c23a7adc1f3140ea03c9b8e1e31b177b8`；`/readyz` 为 `ok=true`，数据库迁移为 `021_design_conversations`，共享 S3、对话规划 Worker、Agent Worker、浏览器、受限出口和桌面中继 ready。
- `/api/design-assistant/status` 显示入口与规划 Worker 开启、自动上限 50 点、保留 30 天、授权闲置 30 分钟；`/api/agent/status` 为 `accessMode=authenticated-v1`、Worker online、queueDepth=0；`/api/generation/models` 显示标准文生图与单参考图均 available，最大参考图分别为 0/1。
- 跨进程 smoke 暴露并修复了 Render DEV 与 Mac DEV Worker 的 Agent payload key 漂移，以及 DEV Worker 缺少独立 task payload key。密钥通过 macOS Keychain 与 Render Secret 安全同步，未写入仓库或交接文档；生产 Secret 和生产 Worker 未触碰。
- Mac DEV Worker 目标并发 2，但本机可用内存未达到安全门槛，按设计自动回退并发 1；真实双用户提交观察到一条 active、一条 queued，第一条结束后第二条取得租约，未阻断排队。
- 对话快速生图 execution `8b6194ca-31e6-4e1e-a334-77db56b856e8` / task `3276901b-ff7b-45b4-9290-c43072e40c4f` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，标准文生图、10 点且只结算一次；PNG 1024×1024、1769719 bytes、SHA-256 `b2a297c4d02a3e9375235851497c6ba6977239de35d25dba044bdeb9aadb8aa2`，共享 S3 验证通过。
- 双用户 Computer Agent Run `9d3c3b4b-0ec9-486f-9828-f5d8d900581a` 与 `91a130aa-f7eb-4e2b-ae86-1943d4cc3207` 均 succeeded，模型均为 `Qwen/Qwen3-8B`，各结算 6 点。每条 Run 都交付一份 Markdown source 与一份 PDF，四个产物均 `verificationStatus=passed`、S3、大小与 SHA-256 复核通过；每条 Run 只有一条 settled budget hold、一条 hold 账本事件和一条 release 事件，无重复结算。
- 完整机器证据保存在被 Git 忽略的 `.artifacts/design-conversation-dev-smoke-2026-08-13T11-15-41-711Z/`，包含 `evidence.json`、Kolors PNG、两份 Markdown 与两份 PDF。smoke 结束后数据库再次确认 active Agent Run=0、active tool task=0、held Agent budget=0、held tool credit=0；Worker online、queueDepth=0。
- 真实 smoke 还推动了两个小模型契约硬化：`declare_artifact.mimeType` 只能从验证器实际支持的 allowlist 中选择；`browser_dom` 的 `snapshot + 非空 HTTPS URL` 在保持同一 origin allowlist 的前提下规范化为 navigate，避免页面仍停留在 `about:blank`。HTTP、私网和未授权 origin 仍拒绝。

后续修复与生产发布（2026-08-13）：

- 真实 Agent 文件任务发现中文“提案”会被规划器误加为 `presentation`，即使用户只明确要求 Markdown 与 PDF，也会在已生成两个合格文件后因缺少 PPTX 失败。PR [#45](https://github.com/FengFan-1997/Artigen/pull/45) 将演示文稿识别收紧为明确的 PPT/PPTX/PowerPoint/幻灯片/路演稿等意图；规划器擅自增加的 `presentation` 会被服务端过滤。定向回归与完整 `pnpm check` 均通过，其中 Playwright 为 441 passed / 3 skipped / 0 failed。
- 修复后的 DEV SHA `d1abdb0984a69c49ab5ddf1deae3ed40a7e21d15` 部署为 Render `dep-d9utire7bikc73b8igq0` 并 live；Mac DEV Worker 同 SHA。最终真实 smoke 保存在被 Git 忽略的 `.artifacts/design-conversation-dev-smoke-2026-08-13T15-11-05-537Z/`：Kolors 图片 execution `63851dab-db02-4cb7-a9b0-3187907ca5c9` / task `e6735de3-e353-4035-913e-ecc458cabc7d` succeeded、10 点且只结算一次；Computer Agent Run `76bd01cc-47c2-4ce8-abe0-9b0b750d69b4` 与 `7b18a7ea-49cb-48c3-aa15-67ec09d67c71` 均 succeeded、各 6 点且只结算一次，四个 Markdown/PDF 产物全部 verification passed。并发安全回退为 1 时观察到队列最大深度 1，最终 queueDepth=0。
- `dev → main` PR [#46](https://github.com/FengFan-1997/Artigen/pull/46) 的 Core、分支策略、Chromium 桌面/移动、Firefox、WebKit 桌面/平板和 Release gate 全部通过；生产不可变 SHA 为 `b4b5b828efed80aeb9d2f5acde632c3de9d63f53`。
- Render production deployment `dep-d9uu7rijobas73bqesm0` 已核验为 `Deploy succeeded | Live`，来源 SHA 为 `b4b5b828efed80aeb9d2f5acde632c3de9d63f53`；Vercel production deployment `6M5KxnhCdLhpZDarEDv347vbTcXR` 为 `Ready / Production / Current`，同 SHA 并指向 `artigen-fengfan.vercel.app`。生产 Mac Worker 已从同一 SHA 重启。
- 生产 `/api/meta` 返回上述 SHA；`/readyz` 为 `ok=true`、迁移 `021_design_conversations`、共享 S3、SiliconFlow、支付、Agent 与对话入口全部 ready；`/api/design-assistant/status` 显示 Qwen3 规划、Kolors 图片、50 点自动上限、30 天保留、队列 0；`/api/agent/status` 为 `accessMode=authenticated-v1`、Worker online、浏览器/受限出口/桌面中继 ready、image generation public enabled、并发安全回退 1、queueDepth=0；两个图片生成模式均 `available=true`，参考图上限保持 0/1。
- 2026-08-14 的最终生产文件任务发现了更窄的否定意图边界：目标明确写“不要 PPT/PPTX/PowerPoint/幻灯片”时，旧归一化逻辑仍会因为这些词出现而接受规划器附加的 `presentation`。会话 `d2f5468c-c75d-4ea8-a206-534af70366b8` / execution `1c0a1ec4-af47-41cd-b81a-dcefb2dc8bfd` 在报价、创建 Run 或冻结前被安全取消，状态为 `cancelled`，点数变化 0。修复会先移除中文“不要/无需/不需要/禁止”等和英文 `no/without/do not` 的演示文稿否定短语，再判断显式 presentation 意图；Qwen 仍可为真正明确要求 PPT 的任务选择 `presentation`。新增中英文回归后完整 `pnpm check` 通过：441 passed / 3 skipped / 0 failed。
- 上述演示文稿否定修复经 PR [#47](https://github.com/FengFan-1997/Artigen/pull/47) 合入 `dev`，DEV 真实 Qwen3 smoke 的 `plan.deliverables` 精确为 `["report"]`；PR [#48](https://github.com/FengFan-1997/Artigen/pull/48) 的 Core、全部浏览器分片与 Release gate 通过后合入 `main`。生产 SHA `66403864d238cfa487b730d9181e4186c1c12a03` 已发布为 Render `dep-d9v9kau417fc73cffvs0` 和 Vercel `4jTbuAmqLffSjWZ6MVbJ18WhFDHE`，Mac production Worker 同 SHA 重启；`/api/meta`、`/readyz`、Agent、对话入口和两个图片模型状态接口均重新核验通过。
- 同 SHA 的生产复跑进一步暴露规划器会把“不要图片或网站原型”中的字面量接受为正向 `image` / `website`：conversation `5432162a-350d-447f-bb5c-5bd6ee156a1f` / execution `9772cf59-4867-40ad-8d40-8bf03be634c0` / Run `f53da5f0-5a2c-456c-9456-e0db499dd39a` 在 0/120 步时立即取消，execution 与 Run 均为 `cancelled`、实际消耗 0。后续修复把报告、表格、演示、网站和图片全部改为服务端正向意图 allowlist，并统一过滤中英文否定范围；未正向要求的规划器候选不能再扩大交付物或图片能力。该修复完成发布和生产报告验收前不得把最终文件任务标记为通过。

### 5.6 Codex 式统一工作台与真实子 Agent（实现完成，尚未部署）

2026-08-14 从最新 `origin/dev` SHA `9549cfdc2f49de3ccf5bad9a9a95cb8a1fae58ec`
建立 `codex/codex-style-agent-workspace`。本节记录已经实现并完成本地验证、但尚未合入
`dev` 或发布到生产的架构；生产状态必须以本节末尾的实时基线为准。

持久实现：

- `/artigen/create`、`/artigen/agent` 与 `/artigen/agent/runs/:runId` 使用同一个专业三栏工作台壳层：左侧历史与设置，中间持续对话，右侧持续展示环境、计划、子 Agent、电脑和文件。默认暗色，同时支持浅色与系统主题；酸性绿只用于执行状态、主动作和焦点。
- 桌面左右栏可折叠和调整宽度，本机保存偏好；中等宽度使用右侧覆盖层，移动端使用全高抽屉。命令面板、跳转主内容、焦点恢复、抽屉焦点陷阱、`aria-live`、44px 触控目标和 reduced motion 均已纳入统一组件。
- 新增迁移 `022_agent_subagents`：保存父 Run 下最多三个子 Agent 的公开状态、实际用量、步骤和文件清单；目标与 Qwen checkpoint 使用独立 AES-256-GCM 表加密保存。`agent_steps` 和 append-only `agent_events` 新增可空 `subagent_id`，旧 Run 返回空数组并保持兼容。
- 父模型新增严格 Schema 工具 `delegate_tasks`。每个 Run 最多创建三个深度固定为 1 的独立 `Qwen/Qwen3-8B` 上下文；每个子 Agent 最多 20 个工具步骤、10 分钟，使用自己的 UUID 工作目录，并只读挂载服务端确认过的本 Run 输入。
- 子 Agent 工具目录只包含计划更新与离线 Shell，禁止浏览器、电脑、连接器、图片生成、审批、最终交付声明和再次委派。父 Agent 独占浏览器、电脑、外部写审批、Kolors 和最终文件验证；所有图片继续只能由 `Kwai-Kolors/Kolors` 生成。
- 父 Run 最多并行三个子任务；单个子 Agent 失败或取消不会自动终止父任务，父 Run 取消会级联取消全部子任务。Worker 从加密 checkpoint 恢复已完成的子任务，避免重复模型调用和重复计费。
- 子 Agent 没有固定启动费；Qwen3 实际用量按 actor 聚合进父 Run，继续只产生一个预算冻结、一次结算和一次余额释放。服务端继续执行 120 步、运行时长和最高预算边界。
- Mac Worker 安装器要求通过 `ARTIGEN_AGENT_SUBAGENTS_ENABLED=true` 显式写入 LaunchAgent；运行脚本只有看到该值时才把 `subagents` 加入公共能力。暗发布和普通安装继续默认关闭，避免只开启 Render 入口却让 Worker 权限状态漂移。
- 公共 Run 类型新增 `AgentSubagent[]`；SSE 新增 `subagent.created|started|progress|succeeded|failed|cancelled`；新增幂等的单独取消接口 `POST /api/agent-runs/:runId/subagents/:subagentId/cancel`。
- `/api/agent/status` 在本代码发布后将新增 `subagentsEnabled`、`subagentMaxConcurrent` 和 `subagentSandboxMode=shared-v1`。安全开关 `AGENT_SUBAGENTS_ENABLED=false` 以及生产、DEV Render blueprint 默认值保持关闭；仅当服务端开关开启且公共能力包含 `subagents` 时，客户端或模型才能获得委派能力。

本地验证：

- 完整 `pnpm check` 通过；Playwright 六个桌面/移动/平板浏览器项目合计 435 passed / 3 skipped / 0 failed，覆盖三条路由共享壳层、暗色/浅色、右栏五页签、调整宽度、命令面板、审批、电脑接管、子 Agent 取消、文件交付和 360/390/768/1440px 布局。
- 后端 418 tests：378 passed / 40 条条件跳过 / 0 failed；前端单元 216/216；邮件中继 7/7；Agent 质量集 50/50。
- 本机 PostgreSQL 迁移、billing、payment、task queue、generation queue、design conversation 与 S3 边界集成共 23 tests：22 passed / 1 条 MinIO 条件跳过 / 0 failed。迁移 `022_agent_subagents` 已通过带锁迁移流程应用到本机开发数据库。
- 本轮视觉证据保存在 `frontend/.impeccable/review/`；360px 实测曾发现底部输入框遮挡执行卡，已改为消息区与 composer 分离的网格布局，修复后完整浏览器矩阵再次全绿。

2026-08-14 发布前重新核验的生产基线仍是旧代码：GitHub `main`、`/api/meta`、Render live
deployment `dep-d9va6rp42hec738hhivg` 和 Vercel production deployment
`dpl_CiUTKfiGszkH62R7tZG1San6BfpF` 均对应
`386e88da4fe04ccf00f0639602bbf3d5afa796e0`。`/readyz`、Agent、对话入口和两种图片
模式均 HTTP 200，Worker online、浏览器/受限出口/桌面中继 ready、queueDepth=0；当前
`/api/agent/status` 尚无上述子 Agent 字段，证明本节新代码尚未上线。必须在 PR、DEV 真实
三子任务 smoke、`dev → main` Release gate、同 SHA 的 Render/Vercel/Mac Worker 发布和
生产 owner smoke 全部完成后，才能把本节阶段改为“生产已发布”。

### 5.19 2026-08-17 三遍审核后的运行时与工作台硬化（DEV 验收通过，待生产发布）

阶段：PR #69–#74 已合入并发布到 DEV；运行时、三栏工作台、验证后工具锁和真实 Worker 交付要求接线均已通过回归。最终 DEV SHA `f89c8bce6e7826681d0589e3bc7197a557398d63` 已完成“3 个子 Agent 全成功”和“单独取消 1 个子 Agent、父任务继续”两场真实 Qwen3 smoke；下一门槛为正式交接 PR、`dev → main` Release gate 和同一不可变 SHA 的生产发布。生产状态必须以发布前重新核验为准。

- 新增迁移 `023_agent_subagent_runtime_hardening`，为 `agent_subagents` 增加独立 `consecutive_failures`。全局 120 步仍统计父子全部步骤，但子步骤失败只更新对应子 Agent，不再污染父 Run 的重复失败熔断。
- 并行子 Agent 的模型用量与费用快照改为串行持久化；内存计量、父 Run 数据库费用和恢复下限均采用单调最大值，晚到的旧快照不能覆盖较新的计费状态。
- `publicSubagent.usage` 以服务端数据库核算的 `credits` 为准，不能被加密 checkpoint JSON 中的旧字段覆盖。
- readiness 已将 `agent_subagents.consecutive_failures` 纳入迁移契约；同时保留 `asset_upload_sessions` 的既有 10 列检查，避免列数误配导致 readiness 假失败。
- `/artigen/agent` 中间区已从大型 Hero、预设卡和配置表单改为紧凑欢迎语、统一 Composer 和持续对话；能力、交付格式、允许站点和预算继续由右侧 Inspector 渐进配置。
- 三栏工作台建立统一可读性与交互下限：桌面元数据最小 11px、正文 14px；移动输入 16px、正文 14px、关键触控目标 44px；附件输入退出 Tab 顺序并具备名称；审批拒绝原因使用关联 label；宽度 separator 支持方向键、Shift、Home/End 和 ARIA 数值；reduced motion 在三浏览器中真实归零。
- 中间对话只显示澄清、审批、关键总结和交付，子 Agent 技术事件归入 Inspector/审计；审批只保留一个酸性绿推荐主动作，其余动作使用明确语义层级。

本地验证证据：

- 第二轮完整 `pnpm check` 退出码 0：前端单元 216/216；后端 447 tests（446 passed / 1 条既有 MinIO 条件跳过）；邮件中继 7/7；Agent 质量集 50/50；生产构建与初始 JS 预算通过。
- 真实 PostgreSQL `agent-subagent-pg.integration` 与相关集成共 113/113，通过两次子失败不终止父任务、跨用户取消拒绝、单独取消、费用单调增长和迁移 readiness。
- Playwright 六个桌面/移动/平板浏览器项目共 468 tests：465 passed / 3 条既有条件跳过 / 0 failed，覆盖 1440/1024/768/390/360px、暗色/浅色/系统主题、200% 等效缩放、键盘全流程、reduced motion、移动横屏、长消息和长文件名。
- Impeccable 最终自动检测为 `[]`；最终截图保存在 `frontend/.impeccable/review/`，已人工检查桌面/移动工作台、Run 详情和设计对话。

发布与实时证据：

- PR [#69](https://github.com/FengFan-1997/Artigen/pull/69) 已于 2026-08-17 合入 `dev`，merge SHA 为 `1006fcf5edee5bbe8b99be85ad3c55ece81b2215`。Core、8 路 E2E、Release gate 与两个 Vercel Preview 均通过；两个 Cloudflare Workers Preview 仍为已知非门禁失败。
- Render DEV deployment `dep-da1ab061egvs73a20bq0` 为 `live`，`/api/meta.gitSha` 精确等于 `1006fcf...`；`/readyz` 为 `ok=true` 且数据库迁移为 `023_agent_subagent_runtime_hardening`。Vercel Preview GitHub deployments `5939911696` 与 `5939902153` 均为 `success` 且对应同一 SHA。
- 用户确认后只将 Karing 从“规则”临时切为“全局”，未修改节点、分流、DNS、系统代理或 Wi-Fi；DEV Worker 随后恢复 online，浏览器、受限出口、桌面中继、subagents 均 ready，queueDepth=0。全部线上工作完成后必须恢复“规则”并重新核验。
- 真实 Run `f10e927f-184e-4e39-85f6-447f0daf4276` 的 3 个子 Agent 全部成功，子工具仅为 `update_plan` 与 `sandbox_shell`；父 Agent 实际浏览 `example.com` 并生成 Markdown/PDF。Neon `ECONNRESET` 触发 Worker 恢复后，已完成子任务没有重跑，但父模型重复声明相同产物，产生多条 artifact/verification 记录并继续累计费用。该 Run 已安全取消，最终 charged=17，hold 仅结算一次且剩余额度已释放。
- 本地后续修复将产物摄取改为内容幂等：对象存储先执行可修复的幂等写入，再按 run、role、filename、MIME、SHA-256 与 asset 查找已通过验证的产物；重复内容不再新增 artifact 或 verifier step。Provider 会纠正重复声明，第三次仍忽略时以 `AGENT_ARTIFACT_DECLARATION_LOOP` fail-closed，不能伪造任务完成。
- 修复后的最终 `pnpm check:core` 退出码 0：前端 216/216、后端 451 tests（410 passed / 41 个外部环境条件跳过）、邮件 7/7、质量集 50/50、生产构建与 bundle 预算通过。此前同一修复的完整 Playwright 为 465 passed / 3 skipped / 0 failed；另用本地 PostgreSQL 16 与固定 CI digest 的 MinIO 跑完后端外部集成 450/450、0 skip、0 fail，精确临时数据库与容器已清理。
- 内容幂等修复经 PR [#70](https://github.com/FengFan-1997/Artigen/pull/70) 全门禁通过后合入 `dev`，merge SHA `5218a564e27f4c896ee557ffe98e355903a0ff2d`；Render DEV deployment `dep-da1ffu2d0e5s73barg40` 已 `live`，`/api/meta`、`/readyz` 与两个 Vercel deployment 均核验为同一 SHA。Mac Worker 也从精确 worktree `Artigen-worker-dev-5218a56` 启动并恢复全部 readiness。
- 同 SHA 真实 Run `fd1ec9ab-c982-4fcb-b235-a7f18865e89f` 的 3 个子 Agent 全部成功且只使用 `update_plan`、`sandbox_shell`；父 Agent 实际观察 `example.com`，随后 Qwen 在最终 Markdown 中擅自加入未观察、未授权的 W3C/Wikipedia URL。离线 Shell origin 防线正确以 `AGENT_BROWSER_ORIGIN_FORBIDDEN` 阻止写入；Run failed、charged=0、hold=released、artifacts=0。这证明安全门有效，但也暴露模型缺少受限纠正路径。
- 上述受限 Shell origin 纠正经 PR [#71](https://github.com/FengFan-1997/Artigen/pull/71) 全门禁通过后合入 `dev`，merge SHA `fc407cae18301303aa76a47ab336d7fc843f4daa`；Render DEV deployment `dep-da1fs3u7bikc73cmk8t0`、两个 Vercel deployment 与 Mac Worker 精确 worktree `Artigen-worker-dev-fc407ca` 均对应同一 SHA。`/api/meta`、`/readyz`、Agent Worker、浏览器、受限出口、桌面中继和队列均重新核验通过。
- 同 SHA 的真实 Run `4dea52d4-6981-4a9c-bed0-2b5192dd262b` 创建 research `a0c4858e-081a-4f49-98a6-8f6910d87ff3`、analysis `4976715f-d21f-4df2-9010-8fed70170a08`、drafting `bacf9592-eae2-4902-8cfd-64424d59e1e1` 三个子 Agent，全部 succeeded 且只使用 `update_plan`、`sandbox_shell`；父 Agent 完成浏览、Markdown 与 PDF。Run 本身 `succeeded`、estimated=`13.6738`、charged=14（3 点免费 + 11 点钱包），一个 hold 只结算一次并释放剩余 36 点，活动队列最终为 0。
- 该 Run 的严格 smoke 仍判定失败：Qwen 将同一 Markdown 先后声明为 `editable` / `source`，将同一 PDF 先后声明为 `pdf` / `preview`，数据库因此出现 4 条 artifact；两组分别共享同一 asset、文件名、MIME 与 SHA-256，证明是角色别名重复而不是四份交付物。
- 当前本地修复将已验证内容匹配收紧为同一 Run 下的 `filename + MIME + SHA-256 + asset`，不再把请求角色作为物理文件身份；对象存储修复仍先执行，第一次通过服务端验证的角色保持权威。最终登记在事务内锁定父 Run 行并再次检查相同内容，旧 Worker 与恢复 Worker 短暂重叠也不能同时插入。不同文件名、不同字节或不同 asset 不会被折叠。Provider 的已声明状态也以服务端返回的角色、MIME 与文件名为准，避免模型用别名覆盖真实记录。
- 跨角色修复的 Agent runtime 95/95、真实 PostgreSQL `agent-subagent-pg.integration` 1/1 均通过；最终 `pnpm check:core` 退出码 0：前端 216/216、后端 452 tests（411 passed / 41 external skips）、邮件 7/7、质量集 50/50、生产构建与 bundle 预算通过。精确临时数据库 `artigen_role_dedupe_20260817` 已删除并确认不存在。
- 跨角色修复经 PR [#72](https://github.com/FengFan-1997/Artigen/pull/72) 的 Core、9 个 E2E 分片和 Release gate 全绿后合入 `dev`，merge SHA `c531db7fdb3abed14ab08bcc70d0612fd82953e0`。Render DEV deployment `dep-da1gcobncjis739e8rig` 为 `live`，两个 Vercel deployment success；`/api/meta`、`/readyz`、Qwen3/Kolors、S3、Agent 与对话入口均重新核验为同一 SHA。Mac Worker 精确 worktree 为 `Artigen-worker-dev-c531db7`，共享 Cua Python 环境链接补齐后 online，浏览器、受限出口、桌面中继和 subagents ready，queue=0。
- 同 SHA 的成功场景 Run `f8d1aa8a-751c-4084-8542-366a03e9d0bf` 创建 research `0f86b0f2-9db8-4da2-af6f-524b531f192e`、analysis `eaf6684b-ddd7-4437-a6e1-e31c72b67169`、drafting `a1210a48-3ff8-42ff-bc8c-5631efdf0d44`，三者分别 5/3/5 步并全部 succeeded；父 Agent 完成实际浏览与文件生成，数据库恰好只有一份 verified Markdown 和一份 verified PDF，证明跨角色内容幂等已生效。
- 该 Run 仍未通过严格 smoke：两项交付物已在 step 22/23 验证后，Qwen 又两次更新父计划并重写已交付 Markdown，最终以 `AGENT_REPLAN_LIMIT_REACHED` failed。`replan_count=3`、estimated=`12.9216`、charged=0、50 点 hold 全额 released、queue=0；不能通过提高 replan limit 掩盖“验证后继续改文件”。
- 当前本地修复只在所有显式交付物均为服务端 `verification_status=passed`、且必需委派已完成后生效：下一模型回合删除整个工具目录并设置 `tool_choice=none`，要求只给最终摘要；若 Provider 仍返回 tool call，则不执行并使用已验证文件名生成确定性摘要。交付物未齐、验证失败或委派未完成时不会触发，现有缺失交付、重复声明和 fail-closed 边界继续保留。
- 验证后工具锁定修复的 Agent runtime 95/95，最终 `pnpm check:core` 退出码 0：前端 216/216、后端 452 tests（411 passed / 41 external skips）、邮件 7/7、质量集 50/50、生产构建与 bundle 预算通过。
- 验证后工具锁经 PR [#73](https://github.com/FengFan-1997/Artigen/pull/73) 全门禁通过后合入 `dev`，merge SHA `fadb9ce4c33b79a9e696f365224413dd03c6c1ac`。同 SHA success Run `ca3e306d-3eb1-475a-b907-c7775dd7e3f5` 的三个子 Agent 全部成功并交付恰好一个 Markdown 与一个 PDF，charged=17、单次结算；cancel Run `d04a0113-f3bb-4371-93b5-424718c52d6b` 虽已形成取消/成功/成功的子任务组合和两个 passed 产物，父模型仍继续重规划而失败。该现象定位到 Worker 误传不存在的 `context.run.deliverables`，真实要求只存在于解密后的 `objectivePayload.deliverables`。
- Worker 交付要求接线修复经 PR [#74](https://github.com/FengFan-1997/Artigen/pull/74) 的 Core、8 路 E2E 和 Release gate 全绿后合入 `dev`，最终 merge SHA `f89c8bce6e7826681d0589e3bc7197a557398d63`。Agent runtime 96/96，`pnpm check:core` 退出码 0：前端 216/216、后端 412 passed / 41 external skips、邮件 7/7、质量集 50/50、生产构建与 bundle 预算通过。
- Render DEV deployment `dep-da1hl4dg1s2s73ca8h60` 为 `live`，`/api/meta`、`/readyz`、`/api/agent/status`、`/api/design-assistant/status` 和 `/api/generation/models` 均 HTTP 200；迁移为 `023_agent_subagent_runtime_hardening`，文本/父子模型锁定 `Qwen/Qwen3-8B`，所有图片锁定 `Kwai-Kolors/Kolors`，Worker、浏览器、受限出口、桌面中继与 `shared-v1` 子 Agent 均 ready，queueDepth=0。
- Vercel Git/CLI Preview 被 `TEAM_ACCESS_REQUIRED` 阻止：提交作者邮箱 `sorates1997@163.com` 未映射到 Vercel 团队席位。没有伪造提交作者或修改团队配置；改用 `git archive f89c8bc...` 导出的精确 Git tree `17f77e96e8c0cd33520d4aca8a0aac69be49a0b1`，以已认证 owner 发布并写入真实 `artigenGitSha` / `artigenGitRef=dev` 元数据。READY Preview deployment 为 `dpl_6vLcPxdcaks1aNen9tUZgUS56Gjj`；两条 blocked 记录 `dpl_5cEgHjzUz1q1BNKYSJcxoj3aRGYd`、`dpl_3YEf8tGNUmug5TkooMTGLGJR1PPP` 保留为审计证据，不计为通过。
- 同 SHA cancel Run `bce73714-ef4f-45b8-91d0-3d34b5475c2c` 通过：research `c8edd90f-dacb-43b0-a127-edc663e6d127` cancelled，analysis `3bf3c05e-0e4a-44cb-916f-8539d0ebe157` 与 drafting `02c31436-2a4f-497d-abeb-43195ff61abe` succeeded；Markdown 707 bytes / SHA-256 `deb28b405d6d6dea7c14c4ca9205ab085de5fc24e31fe582d8a980c4124767d7`，PDF 3388 bytes / SHA-256 `9f179b5fa19900b0471b0a09da0a9d926b341bd6eb73734b0f7d9fc7112144a5`，均为 S3 `verificationStatus=passed`。父 Run succeeded、18 步、estimated=12.049、charged=13、一个 hold 只结算一次，子工具仅 `update_plan` / `sandbox_shell`，queue=0、frozen=0。
- 同 SHA all-success Run `2235d9c4-7e4c-4ff7-89a5-66067023b09f` 通过：research `c7d05e77-bda7-4b53-9843-3fe041d7f641`、analysis `f9cd0ab1-05cd-4cf8-a763-f54fb651d5bd`、drafting `201aa804-e4ae-4d17-9d6f-8d376419d09a` 均 succeeded 且各 3 步；Markdown 565 bytes / SHA-256 `c7790e6f33c6080bd2d4ecaa2421fbc5564023397ec4c5f40d2f6033e62a92c5`，PDF 3272 bytes / SHA-256 `e49959f3c23709fc46ef9a68253307d61af8005ae3b88ab68d3e17549df352fc`，均为 S3 `verificationStatus=passed`。父 Run succeeded、21 步、estimated=14.1765、charged=15、成本序列单调、单次结算，最终 Worker online、queue=0、frozen=0、held budget=0。

### 2026-08-18 生产首次发布与恢复加固证据

- Release PR [#76](https://github.com/FengFan-1997/Artigen/pull/76) 全门禁通过后合入 `main`，运行 SHA 为 `429a7fecc40c6ed9020fda9cd315c568276b1302`。Render production deployment `dep-da1iukht0dsc73bv9b3g` 为 `live`；Vercel production deployment `dpl_FAdvHV8oxTAEKymPjDwqWKFJTZCs` 为 `READY` 并指向 `artigen-fengfan.vercel.app`；Mac production Worker 从不可变 worktree `Artigen-worker-production-429a7fe` 启动。生产 `/api/meta`、`/readyz`、Agent status 和生图模型接口重新核验通过，Worker、浏览器、受限出口、桌面中继和 `shared-v1` 子 Agent ready，queue=0。
- 上线前 PostgreSQL 16 只读一致性备份保存在 `/Users/fengfan/Library/Application Support/Artigen/backups/artigen-neon-2026-08-17T15-45-39-065Z.dump`，404797 bytes、52 tables，manifest 与 SHA-256 文件同前缀。生产 `AGENT_SUBAGENTS_ENABLED=true`；文本规划、父 Agent 与子 Agent 仍只允许 `Qwen/Qwen3-8B`，所有图片仍只允许 `Kwai-Kolors/Kolors`。
- 生产 Run `7c7b6753-f424-415f-ac0c-5636644705af` 的三个子 Agent 均成功，Markdown 已 S3 verified，但 PDF 声明漏传 sources，终态 `AGENT_REPORT_SOURCES_REQUIRED`；15 步、estimated=9.7626、charged=0，50 点 hold 全额 released，queue/frozen/held=0。
- 生产 Run `2f88e55b-a7a2-4b4d-9389-6cc11495d70e` 的三个子 Agent 均成功，父 Agent 实际浏览 Artigen 与 W3C；随后两个不同的 Shell 恢复动作被旧的全局失败计数误判为连续重复，终态 `AGENT_REPEATED_ACTION_FAILED`；18 步、estimated=8.3599、charged=0，50 点 hold 全额 released，queue/frozen/held=0。两次均未冒充生产 smoke 通过，也没有继续靠概率重试。
- 分支 `codex/production-agent-recovery-hardening` 对上述两点执行有界修复：`AGENT_REPORT_SOURCES_REQUIRED` 只允许模型使用本轮 browser/connector 已观察到的精确 HTTPS 来源纠正，最多两次，禁止编造；父/子失败计数只在同一 scope 且与紧邻失败步骤 fingerprint 相同时递增，不同恢复动作重置为 1，成功重置为 0，相同动作重复两次仍 fail-closed。定向 Agent runtime 98/98、真实 PostgreSQL 集成 1/1、lint 与 `git diff --check` 通过；完整 `pnpm check` 退出码 0，Playwright 465 passed / 3 skipped，backend 455 tests（414 passed / 41 显式外部跳过），frontend/unit/type/build/bundle、mail 7/7、quality 50/50 均通过。
- 修复经 PR [#77](https://github.com/FengFan-1997/Artigen/pull/77) 的 Core、全部 8 路跨浏览器 E2E 与 Release 判定全绿后合入 `dev`，merge SHA `f7eba0f6dfd3c329e3bd1c0e9abd404eb87ef293`。两个 Cloudflare Workers Builds 是仓库外非门禁失败，保留审计但不计作通过。
- Render DEV deployment `dep-da1jree7bikc73cqia40` 为同 SHA `live`；`/api/meta`、`/readyz`、Agent status、设计对话和两个生图模式均 HTTP 200，migration=`023_agent_subagent_runtime_hardening`。Vercel exact-tree Preview `dpl_CatGpCNWFQAnvmFpDA1YV5cLDdjV` 为 `READY`，由 `git archive f7eba0f...` 发布并带真实 SHA/ref 元数据。Mac DEV Worker 来自不可变 worktree `Artigen-worker-dev-f7eba0f`，worker/browser/egress/desktop relay/subagents ready，资源门槛按预期将父并发回退为 1，queue=0。
- 同 SHA 真实 DEV Run `d8194dd5-eaa9-4558-b62f-94a3bc2cfd7e` succeeded：research `50ac35ec-5d72-4482-b786-9ff7f3763c8f`、analysis `ba467f2a-e5a2-40d7-801f-4700628342ce`、drafting `2b066077-96f9-4d24-bb74-6f6fc0de9cf0` 均 succeeded 且各 5 步，子工具只有 `sandbox_shell` / `update_plan`。Run 自然命中 step 20 failed → 21 distinct recovery succeeded、step 22 failed → 23 distinct recovery succeeded；新实现保持 `consecutive_failures=0` 并继续完成，直接证明误熔断修复在真实 Qwen3/Neon/Worker 链路生效。
- 该 Run 最终 27 步、estimated=15.1596、charged=16，成本事件单调，单一 hold 只结算一次，`run.succeeded` 恰好一次。S3 passed 交付恰好两项：Markdown 1456 bytes / SHA-256 `dc12ca2d6a237e882f1c9ba3ef252f07c588770907336951d06b038d1c6bfc96`；PDF 4680 bytes / SHA-256 `fdac282285ecb0c7a420d1b4815d8cfe1f6120c456520794d1f25456488bbe55`；来源为父 Agent 实际观察的 `https://example.com/`。最终 worker online、queue=0、wallet frozen=0、held budgets=0。
- 正式证据 PR [#78](https://github.com/FengFan-1997/Artigen/pull/78) 全门禁通过后合入 `dev`，证据 SHA 为 `14259be1d329b396e5c7429ae14dbab3fe1512d4`；Render DEV `dep-da1kaj8ae00c738ro7i0`、Vercel exact-tree Preview `dpl_5WEb9HJi7YUzavKsDhj7KNmRe3kR` 与 Mac DEV Worker `Artigen-worker-dev-14259be` 均对齐该 SHA，五个接口 HTTP 200、queue=0。
- Release PR [#79](https://github.com/FengFan-1997/Artigen/pull/79) 的 main 分支策略、Core 与全部 8 路 E2E 全绿。同一 DEV SHA 的 push run 曾留下一个旧 `webkit-desktop 2/2` failure，GitHub 保护规则正确拒绝第一次合并；只重跑该失败 job 后 WebKit 与旧 Release gate 均真实 success，没有强推或绕过保护。最终 `main` merge SHA 为 `1c1ede2e500e895bc610668a869dea3263dbb2e5`。
- 生产三端随后对齐同一 SHA：Render deployment `dep-da1kj77lk1mc73a990m0` 为 `live`；Vercel production deployment `dpl_52PuYtvbhsPnmVuzRu8VgEkDUTpz` 为 `READY` 并 alias 到 `artigen-fengfan.vercel.app`；Mac Worker 来自不可变 worktree `Artigen-worker-production-1c1ede2`。`/api/meta`、`/readyz`、Agent status、设计对话与生图模型接口均 HTTP 200；Qwen3/Kolors 锁定、两个生图模式 available、Worker/browser/egress/desktop/subagents ready，queue=0。
- 最终生产 Run `5942134d-fce2-4547-94d2-99e344063aaa` succeeded：research `63b3325b-0813-4411-8fdc-fbc9d512d282`、analysis `b879f5f5-1f2b-4ee8-be1b-a2967ebd810b`、drafting `545808c3-427d-4cc2-958c-5a99018beb77` 均 succeeded 且各 3 步，子工具只有 `sandbox_shell` / `update_plan`。父级两个 `browser_dom` 成功观察 Artigen 与 W3C；step 14/15 两个连续但不同 fingerprint 的 Shell failure 未被误熔断，step 16 恢复计划、step 17–20 Shell 连续成功，最终 `consecutive_failures=0`。
- 该生产 Run 最终 22 步、estimated=10.8723、charged=11，成本序列单调，单一 hold 只结算一次，`run.succeeded` 恰好一次。S3 passed 交付恰好两项，且 sources 同为实际观察的 Artigen/W3C URL：Markdown 3557 bytes / SHA-256 `ed89ec0daad786df75cebca86608a4769d5153879bee20511d1b109ab0932121`；PDF 6241 bytes / SHA-256 `95cb578389a45a346fddbdc034f3163dc183930ee21c5fe8d0fa2ecc63acaa20`。最终 worker online、queue=0、wallet frozen=0、held budgets=0。

恢复加固已完成真实 DEV 与生产验收，可以标记为上线。后续若以纯文档提交补充本节证据，只需让 Render、Vercel 和 Mac Worker 对齐最终文档 merge SHA 并重新核验 readiness；运行时代码相同时不重复消耗真实模型额度。Karing 只在全部联网发布与验收结束后从临时“全局”恢复为“规则”，不得修改节点、分流、DNS、系统代理或 Wi-Fi。

### 5.20 2026-08-18 Agent 工作台视觉重设计（生产已发布）

阶段：从 `origin/dev` SHA `99ea900d2cf76ec021b500e81b1bb9bb915e0b52` 建立
`codex/artigen-workspace-visual-redesign`，经 PR [#82](https://github.com/FengFan-1997/Artigen/pull/82)
合入 `dev`，merge SHA 为 `5e2990ca71f06962cb4de34dae77b590cd7ad8b2`。本节变更已通过
CI、Render DEV 与 Vercel Preview 验收，尚未进入 `main` 或生产。

- `/artigen/create`、`/artigen/agent` 与 `/artigen/agent/runs/:runId` 保留统一三栏信息架构和全部真实业务能力，但视觉权威改为“数字打样台”：左侧项目架、中间唯一工作稿、右侧生产控制台。
- 工作台默认使用冷白浅色纸面，同时完整支持暗色与系统主题。深墨负责结构，cobalt 负责选择与焦点，acid lime 只用于执行状态和套准标记；十字套准图形成为统一 Agent 标记。
- 中间区继续以对话和结果为先，去除黑色配置后台、均匀卡片墙、霓虹装饰和过小灰字；零状态提供紧凑目标输入与真实任务建议，高级能力、模型锁定、预算、交付物、计划、子 Agent、电脑与文件留在持续 Inspector。
- 建立可读性下限：正文至少 14px、控件至少 12px、元数据至少 11px、移动输入至少 16px；执行标题与计划分别为 15px/14px，移动安全警告为 14px。
- 左栏折叠工具轨保留可恢复的“展开左栏”入口，新任务、导航、点数、主题和设置图标均有持久可访问名称。附件安全边界在桌面与移动持续显示为“附件先留本机，选定云端执行后才上传”。
- 键盘分隔条、命令面板、抽屉焦点陷阱、焦点恢复、44px 移动触控目标、200% 等效缩放、长内容和 reduced motion 约束继续保留。
- 模型与执行事实没有改变：所有文字、规划、父/子 Agent 继续只使用 `Qwen/Qwen3-8B`；所有图片继续只使用 `Kwai-Kolors/Kolors`。本轮没有修改 API、数据库、计费、Worker、Karing、部署或生产开关。

本地验证：

- `pnpm check` 的核心、前端 216/216、后端 414 passed / 41 条环境条件跳过、邮件 7/7、质量集 50/50、生产构建和初始 JS 预算均通过。
- 完整 Playwright 六环境矩阵为 469 passed / 3 条既有条件跳过；两个旧图片工坊/格式工厂用例在长矩阵中因浏览器进程关闭失败，随后按原项目单独重跑均通过。工作台聚焦矩阵与最终修复回归分别为 18/18、7/7。
- 当前代码再次通过 `pnpm check:core`；两份工作台 E2E 在 Chromium、Firefox、WebKit、360px、390px 与 768px 六个项目中为 108/108。
- 两轮人工截图 QA 后由全新 Impeccable 终审上下文发现并复核四项修复：折叠恢复、图标轨命名、移动附件边界、执行字号与移动安全警告。最终结论为 `PASS`，机械反模式检测为 `[]`。
- 最终桌面浅色/暗色、390px、创建零状态、持续对话和 Run 详情证据保存在 `frontend/.impeccable/review/`。
- PR #82 的 Core、8 路 E2E、Release gate 与两个 Vercel Preview 全绿；Cloudflare 两个既有非门禁 Preview 失败未参与合并门槛。
- Render DEV deployment `dep-da1ui6ou01pc73eihkmg` 为 `live` 且 commit 精确等于 `5e2990c...`。`/api/meta` 返回 `appEnv=dev` 与同一 SHA；`/readyz` 为 `ok=true`，数据库迁移 `023_agent_subagent_runtime_hardening`、PostgreSQL 与 S3 均正常。
- DEV Agent status 为 `authenticated-v1`，Worker、浏览器、受限出口、桌面中继与子 Agent 均 ready，queue=0；设计助手使用 `Qwen/Qwen3-8B` 与 `Kwai-Kolors/Kolors`，两个生图模式均 `available=true`。
- 只读页面 smoke 确认 `/artigen/create` 与 `/artigen/agent` 均 HTTP 200、真实 DOM 加载统一 Shell、无横向溢出和页面异常；Create 标题为“你想完成什么？”。Vercel merge-SHA deployments `5956564214`、`5956554071` 均为 `success`。
- 正式 DEV 证据经 PR #83 合入后形成 SHA `5757c0e431db89b3f9fc8a45e928fa67507a129e`；Render DEV deployment `dep-da1uo7bncjis73f5pke0` 为同 SHA `live`，`/api/meta`、`/readyz` 与数据库迁移 `023_agent_subagent_runtime_hardening` 再次通过。
- Release PR #84 的 main 分支策略、Core、8 路 E2E 与两条 Release gate 全部成功。DEV push 首轮一个旧格式工厂 WebKit 分片因浏览器进程关闭失败，只重跑该失败 job 后真实通过，没有绕过保护；最终 `main` SHA 为 `c98f7487403330463bd54facf5c194aa1b8ca022`。
- 生产三端已对齐该不可变 SHA：Render deployment `dep-da1uv8rl550s73arbn5g` 为 `live`；Vercel production deployment `dpl_Eii66JG3oLsRZKdiY8t4hCy13Qim` 为 `READY` 并 alias 到 `artigen-fengfan.vercel.app`；Mac Worker 来自 `/Users/fengfan/Public/personal/Artigen-worker-production-c98f748`，LaunchAgent 的程序与工作目录均精确指向该 worktree。
- 生产 `/api/meta`、`/readyz`、`/api/agent/status`、`/api/design-assistant/status` 与 `/api/generation/models` 均 HTTP 200；PostgreSQL、S3、SiliconFlow、支付和邮件 ready，Worker、浏览器、受限出口、桌面中继与 `shared-v1` 子 Agent ready，queue=0。Qwen3/Kolors 硬锁和两种图片生成模式 `available=true` 保持不变。
- 真实生产页面在 1440px 与 390px 复核：`/artigen/create`、`/artigen/agent` 均 HTTP 200、统一 Shell 存在、无横向溢出；Create 无页面或控制台错误。Agent 游客态仅出现预期的账户/运行数据 401，并在界面明确要求登录，没有越权读取或页面崩溃。本轮只变更 UI 与文档，未重复消耗真实模型点数。

本轮未修改 Karing 节点、规则、DNS、系统代理、Wi-Fi 或 B2U2/AI 网络配置；发布结束时继续保持既有“规则”模式。

## 6. 已知风险与正式后续事项

- Render 使用 Free 实例，会休眠或重启，不提供商业级 SLA。
- Agent Worker 绑定当前 Mac；关机、合盖、退出登录或 Docker 停止会让任务排队。
- Agent 已开放给所有状态正常的登录用户；当前 Mac Worker 因本机资源安全门槛自动回退并发 1，额外任务会排队而不是被拒绝。
- 当前没有自定义域名。
- 生产管理后台没有可用管理员，行为统计不能仅凭队列状态推断。
- 已有生产发布前逻辑备份，但定时备份和恢复演练仍需建立。
- 稳定 24×7 需要用户明确同意费用后升级 Render 并迁移 Worker 到专用 Linux 主机。
- 扩大 Agent Beta 前需要重新验证容量、失败率、S3 用量、沙箱清理和敏感输入隔离。
- 爱发电本轮只验证了未支付订单创建、跳转、pending、钱包不入账和幂等；真实付款 webhook 入账仍需在单独获批的验收中完成。

## 7. 正式 Handoff 更新规则

必须更新本文：

- API、数据契约或核心业务行为改变；
- 环境变量、Provider、模型或运行方式改变；
- 数据库迁移或存储边界改变；
- 分支、CI、DEV、生产发布或回滚流程改变；
- 平台、域名、账号入口或部署位置改变；
- 用户批准了新的正式架构决定；
- Bug 修复更正了本文已有正式结论；
- DEV 或生产部署产生了新的可验证状态。

不写入本文：

- 尚在讨论的计划；
- 未采用或已经撤销的方案；
- 具体调试过程和命令试错；
- 只读分析、代码阅读或无持久影响的问答；
- 未经验证的生产推断；
- 任何敏感信息。

未部署的代码必须准确标记阶段。只有线上接口或平台 deployment 已核验后，才能使用“已上线”“生产运行中”等表述。

## 8. 专题文档索引

| 文档 | 正式用途 |
| --- | --- |
| [`ARTIGEN_AGENT_FULL_HANDOFF.zh-CN.md`](./ARTIGEN_AGENT_FULL_HANDOFF.zh-CN.md) | Agent 全链路、开发决策、安全、账号、发布和运维专题 Handoff |
| [`ARTIGEN_AGENT_BETA_RELEASE_RECEIPT.zh-CN.md`](./ARTIGEN_AGENT_BETA_RELEASE_RECEIPT.zh-CN.md) | Agent 最终生产发布回执 |
| [`ARTIGEN_AGENT_BETA_DELIVERY.zh-CN.md`](./ARTIGEN_AGENT_BETA_DELIVERY.zh-CN.md) | Agent Production Beta 完整交付说明 |
| [`AGENT_OPERATIONS_RUNBOOK.zh-CN.md`](./AGENT_OPERATIONS_RUNBOOK.zh-CN.md) | Agent Worker 和本机运维 |
| [`AGENT_BROWSER_SECURITY_AND_BETA_RELEASE.zh-CN.md`](./AGENT_BROWSER_SECURITY_AND_BETA_RELEASE.zh-CN.md) | 浏览器 SSRF 威胁模型、发布与回滚 |
| [`ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md`](./ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md) | 数据库、部署、域名、账号与登录审计 |
| [`PROJECT_OPERATIONS_GUIDE.zh-CN.md`](./PROJECT_OPERATIONS_GUIDE.zh-CN.md) | 本机、DEV、生产、分支、发布和回滚总手册 |
| [`PRODUCTION_RUNBOOK.zh-CN.md`](./PRODUCTION_RUNBOOK.zh-CN.md) | 生产平台、账号和故障接管 |
| [`DEV_ENVIRONMENT_RUNBOOK.zh-CN.md`](./DEV_ENVIRONMENT_RUNBOOK.zh-CN.md) | DEV 环境、安全边界和 smoke |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 日常协作、测试、PR、Review 和 Handoff 门禁 |

## 9. 信息冲突时的优先级

1. 当前线上 `/api/meta`、`/readyz`、状态接口和平台 deployment；
2. GitHub `main` 与实际部署 SHA；
3. 当前代码和数据库迁移；
4. 本文和对应专题正式文档；
5. `HANDOFF.local.md`；
6. 早期聊天、历史计划或旧分支说明。

如果本文与更高优先级证据冲突，应在同一修复任务中更新本文，不能让已知错误继续作为正式项目事实。

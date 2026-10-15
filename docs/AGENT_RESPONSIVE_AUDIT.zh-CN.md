# Agent 多尺寸与大工作量 UI 审查

阶段：本地候选，未发布 DEV 或 Production。审查基线为 `be89003`；原有用户改动保留。

## 范围与方法

检查创建页、Agent 工作台、运行详情及其项目导航、输入框、文件、编辑器、GitHub和覆盖层。使用本机已安装Chrome执行真实Vue生产构建，业务接口、消息、文件和PR均为合成测试数据。改前构建在本轮修改前保存，包含当时工作树；本轮目标组件与基线提交一致。前后配对采用相同视口、主题和负载，滚动位置按实际布局变化，不作为像素差分。

12种尺寸：320×640、360×800、390×844、768×1024、820×1180、1024×768、1280×720、1439×900、1440×900、1920×1080、2560×960、844×390；另测844×320命令面板。矩阵42个状态，覆盖60条长消息、120条会话、12个长文件标签和10个附件；专项检查250个文件、5000行文本搜索和1024px触屏。

先记录DOM几何、中心命中、可访问名称、页面错误及局部滚动，再对可复现问题修复。遮挡采样中的抽屉背后遮罩、滚动边缘和离屏条目不是自动判定的bug；桌面小控件也不能按手机44px规则直接报错。未执行axe或完整WCAG认证。

## 已修复问题

| 级别 | 触发与问题 | 最终行为及相关文件 |
| --- | --- | --- |
| P2 | 打开12个长文件标签后，目录开关被标签挤走；切回文件页选中标签仍可能不可见 | 标签独立滚动，开关固定；恢复激活标签，方向键/Home/End/Delete和关闭焦点正常。`ResourceWorkspace.vue` |
| P2 | 120条会话时，改名表单位于列表末端，手机约在第5571px | 表单放在导航头部，打开即聚焦并滚入视野。`ProjectNavigation.vue` |
| P2 | 长输入和10附件撑大零状态，320px工作台输入框宽336px，横屏顶部丢失 | Grid使用minmax(0,1fr)，输入和附件分别限高滚动，safe center保留短屏可达性。`ComposerBox.vue`、`DesignConversation.vue`、`AgentWorkbench.vue` |
| P2 | 844×320命令面板底部操作被屏幕裁切 | 面板受视口高度约束，内容独立滚动，Tab在面板内循环。`AgentWorkspaceShell.vue` |
| P2 | 深色编辑器沿用浅色高亮，采样最低对比度1.43:1 | 高亮使用现有主题语义色，深色样本最低6.21:1、浅色6.10:1。`WorkspaceEditor.vue`；只代表采样代码，不代表整站认证 |
| P2 | 16列中文Markdown表格被压成单字竖排 | 单元格保持可读最小宽度，表格内部横向滚动。`WorkspaceMarkdown.vue` |
| P2 | 30条GitHub记录时，点击PR后详情追加到列表末端 | 详情替换列表，返回恢复原记录焦点。`WorkspaceGithub.vue` |
| P2 | 拉取PR期间刷新为未关联状态，旧请求失效后busy一直为true | 当前刷新拥有busy生命周期并释放表单；迟到回执不覆盖新状态。`WorkspaceGithub.vue` |
| P2 | 多个项目路径引用同一资产，点击文件链接可能打开另一路径 | 优先匹配精确file ID，再使用asset ID回退。`ResourceWorkspace.vue` |
| P2 | 从功能栏打开资源抽屉后关闭焦点回错入口；取消拖动仍残留resize状态，ARIA宽度超实际范围 | 保存实际触发元素，关闭恢复焦点；pointercancel/blur结束拖动；separator报告夹紧后宽度。`AgentWorkspaceShell.vue` |
| P2 | 在编辑器搜索框按Escape同时关闭整个资源抽屉 | Shell尊重嵌套控件已处理事件，第一次Escape仅关闭搜索并回到编辑器。`AgentWorkspaceShell.vue` |
| P2 | 平板触屏仍使用30px运行按钮、42px账户行，手机断点无法覆盖 | pointer:coarse下按钮、选择和账户动作至少44px；目录、附件、编辑器搜索同步适配。相关workspace组件 |

变更面板增加局部滚动与差异区最小高度，避免短屏操作挤出。下载图标补充可访问名称。没有改登录、费用、审批、模型、支付或后端协议。

## Skill查找与出处

本地搜索覆盖Codex、Agents、Claude技能目录及Codex插件缓存，关键词包括find/search/discover/skill、审查、响应式。未发现独立安装的`find-skills`；最接近用户描述且已安装的是`douyin-github-ai-research`，用于核实GitHub来源。本轮没有安装第三方Skill或执行下载脚本。

| 来源 | 判定与采用方式 |
| --- | --- |
| 本地`douyin-github-ai-research` | 已安装；使用其来源核验与分类流程。此次用户要求本地/GitHub检索，未检索抖音收藏 |
| 本地Impeccable v4.5.2 | 已安装；读取audit/adapt/craft-floor，应用到实际修复，不新增审美规范体系 |
| 本地Web Interface Guidelines与playwright-core | 已安装；核对键盘、焦点、布局及浏览器验收方法 |
| [vercel-labs/skills/find-skills](https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md) | 上游SKILL已核实，本地未安装；没有冒称它就是用户已有Skill |
| [ov3rf1w/ui-responsive-audit](https://github.com/ov3rf1w/ui-responsive-audit) | 仓库SKILL及MIT许可证可读；借鉴生产构建、视口矩阵、几何与遮挡交叉核验，不安装、不运行其脚本 |
| [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) | 读取当前原始规范作为依据，不把指南当自动通过证明 |
| EnchStyle相关搜索结果 | 原始SKILL访问未完成，不作为已核实依据 |
| brumley相关审查搜索结果 | 依赖本机缺失MCP，未执行，不作为已验证能力 |

以上外部材料只作为方法参考，不覆盖用户指令和仓库规则。未全量审查所有GitHub搜索结果。

## 验证结果与可重复命令

- 前端单元249/249，65个文件通过。
- 既有四组Agent/输入/工作空间Playwright：86通过，1个图册采集用例按原配置跳过。
- 新增压力验收11/11通过；42状态无整页横向溢出，采样无pageerror、无无名按钮。
- 250文件筛选、5000行虚拟渲染和末行搜索通过；搜索关闭保留编辑器焦点。
- 改前生产构建有3个定向回归断言按预期失败：同资产路径、旧请求刷新锁表单、短屏命令末项。改后对应测试通过；这是基线复现，不是遗留失败。
- 类型、lint、生产构建及文档/工作空间检查以交付记录中的最终结果为准。构建原有空echarts块和大块提示仍保留。
- Impeccable扫描8个相关组件：primary 0，6条既有中性阴影/遮罩颜色advisory；未添加ignore。
- 独立静态复核提出2项P2（文件模式返回的标签位置、GitHub刷新busy），均已修复并加入回归。复核者没有执行测试。

```sh
pnpm --filter personal test
pnpm type-check
pnpm --filter personal lint
ARTIGEN_E2E_CHROME_CHANNEL=1 pnpm --filter personal exec playwright test -c playwright.workspace.config.ts e2e/workspace-stress.spec.ts --project=chromium-desktop
pnpm check:docs
pnpm check:workspace
git diff --check
```

本轮截图矩阵通过临时单项目Chrome配置连接改前/改后生产预览；临时配置、构建和报告在交付后删除。上述仓库命令默认启动开发服务器，可重复交互断言；生产验收应先构建，再将baseURL指向独立预览。

## 截图、边界与回退

交付独立压缩图册：16组、32张真实页面前后截图，包括窄屏/平板/大屏标签、长会话改名、附件输入、明暗编辑器和GitHub详情。图册附原图SHA256、尺寸、状态矩阵和采样对比度。图册不包含真实账号数据，不能证明线上生成、OAuth、数据库或Worker成功。

本轮未运行后端测试/数据库集成（无后端变更）、真实模型任务、真实GitHub OAuth、远端部署、物理移动设备、Firefox和Safari完整回归。Chrome触屏及视口模拟不能代替这些验收。不承诺零bug。

本轮只增加对两个已安装间接依赖的直接声明：`@codemirror/language`和`@lezer/highlight`，离线执行downloaded 0、added 0，MIT许可证已同步。没有新增平台、账号或Secret，不需要改账号报告。

回退可revert本轮独立本地提交；不需要迁移，不删除用户文件和项目数据。保持旧工作空间实现和用户原有脏工作树。

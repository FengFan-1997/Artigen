---
target: Artigen 主创作链路 / AgentWorkbench
total_score: 26
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 1
timestamp: 2026-10-14T06-32-25Z
slug: frontend-src-agentimg-views-agentworkbench-vue
---
Method: dual-agent (A: /root/design_review · B: /root/detector_browser)

# Artigen 主创作链路 Critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Agent 状态清楚；项目列表加载错误原先易被误解为空，已修。 |
| 2 | Match with real world | 3 | 自然语言目标入口清楚；Worker、子 Agent 等术语泄漏。 |
| 3 | User control and freedom | 3 | 有暂停、恢复、停止、拒绝和恢复项目；项目内再生成会跳页。 |
| 4 | Consistency and standards | 2 | Create/Agent 共用工作台，运行详情和项目页视觉/交互体系分离。 |
| 5 | Error prevention | 3 | 报价/上限/素材检查/外部操作审批清晰。 |
| 6 | Recognition rather than recall | 3 | 历史、计划、文件可见；五个检查器页签仍需用户理解分类。 |
| 7 | Flexibility and efficiency | 3 | 搜索、命令面板、建议可用，但 `⌘K` 搜索提示与行为不符。 |
| 8 | Aesthetic and minimalist design | 2 | 项目资料和版本操作密，运行事件重复呈现；颜色检测有待令牌治理。 |
| 9 | Error recovery | 2 | 部分 Agent 错误有恢复说明；项目列表失败与空列表曾混淆，已修。 |
| 10 | Help and documentation | 2 | 有示例和字段帮助；创作入口选择及跨页项目衔接仍需用户推断。 |
| **Total** | | **26/40** | 核心方向成立，主流程状态、连续性和信息层级仍需打磨。 |

## Design-specificity verdict

**中高，7/10（源码与设计文档判断，不是视觉分数）。** Artigen 有可辨认的三栏持续任务空间、酸性绿执行语言、自动选择执行器、报价、调用记录、外部操作审批和项目资产留存。主要机会是让同一套创作上下文覆盖项目生成、Agent 运行与产物交付；目前项目页和运行详情像是相邻但独立的产品面。

Detector 对六个 Vue 目标扫描一次，报告 55 条 advisory，全是 `design-system-color` 字面颜色：ProjectsPage 19，ProjectWorkspace 36，其他四项 0。计数不代表 55 个独立 UX 缺陷，规则也没有测量对比度。项目页的 `#CCFF00` 可能是有意的品牌色；需确认它是否为设计令牌漂移。覆盖层注入失败：没有用户可见的 `[Human]` overlay。

## Overall impression

用户可以自然语言启动任务，并能在启动前看到费用、在执行中批准外部动作、事后查看产物。这比泛用聊天壳更贴近 Artigen 的创作任务。最大的体验缺口是主流程跨入口后的连续性，其次是错误态与事件记录的组织；错误态中的两个直接缺陷已在本轮修复。

## What's working

- 报价和预算上限在确认前可见，让费用边界可信。
- 运行流程保留目标、计划、审批、调用和交付记录，支持回看上下文。
- 上传和外部写入边界有明确提示，用户能判断何时素材离开本地或发生实际操作。

## Priority issues

1. **[P1 · 已修] 键盘用户无法聚焦项目素材上传输入。** `ProjectWorkspace.vue` 曾以 `display:none` 隐藏 file input，包裹 label 不可单独 Tab 聚焦。商品/品牌素材因此无法通过键盘添加。改为视觉隐藏但仍可聚焦的原生输入，并给父标签增加可见焦点环；E2E 已验证焦点和焦点环。
2. **[P2 · 已修] 项目加载失败可能呈现为“还没有项目”。** `ProjectsPage.vue` 把错误放进创建表单的 status，而空列表状态仍直接显示。现已给无数据失败态添加重试/重新登录，有旧数据刷新失败时保留列表并提示更新失败。
3. **[P2 · 待做] 项目内“生成新版本”离开项目工作区。** 路由带上 project/version/参考图上下文，但生成后返回版本画廊的连续感尚未实机确认。把生成后上下文保留和回到项目列为下一轮。
4. **[P2 · 待做] 最近动作、主流和右侧审计存在重复事件。** 事件来源有交叠；应让主流保留用户可读动作，审计区提供完整细节，保留调用追溯能力。
5. **[P2 · 待做] 搜索框显示 `⌘K`，实际该快捷键打开命令面板。** 删除误导提示，或实现专用搜索聚焦快捷键并确保命令面板快捷键不变。

## Persona red flags

- **第一次使用的电商创作者：**自然语言输入易懂；Worker/子 Agent/出口属于内部术语，错误信息需回答素材是否保留、如何恢复。
- **键盘用户：**素材输入已修到可聚焦且有焦点环；搜索快捷键仍会导向错误操作。
- **依赖任务记录的创作者：**调用和上下文信息齐全，但同一事件在三个区域重复，查找结论的成本偏高。

## Minor observations

- 右侧检查器有 5 个可选页签；项目记忆默认折叠缓解了首次负荷，但完整项目页集中了较多资料字段与版本动作。
- 项目页面大量颜色字面量未匹配 `DESIGN.md` 令牌。先辨明品牌语义，再统一令牌；不要把 detector 的逐处计数当成对比度结论。
- 运行详情有自己的输入框，项目页则用单独 `TitleBar`；需要检查这是否是明确职责差异，还是主创作工作台一致性断点。

## Questions to consider

- 下一轮应先把项目生成和版本画廊的上下文接起来，还是先整理运行事件层级并保留完整审计？
- 项目页的荧光绿是刻意区分项目工作区的品牌色，还是应归并到 `DESIGN.md` 的执行色令牌？
- `⌘K` 要固定留给命令面板、增加一个搜索快捷键，还是去掉搜索快捷键提示？

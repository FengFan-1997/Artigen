# Artigen 文档中心

本页是仓库现行文档入口。产品和运行事实以代码、实时健康接口和下列 living documents 为准；历史归档只用于理解演进。

## 产品与设计

| 文档 | 用途 |
| --- | --- |
| [`README.md`](../README.md) / [`README.en.md`](../README.en.md) | 中文/英文产品首页、能力概览与快速开始 |
| [`PRD.md`](../PRD.md) | 产品、执行路径、认证、计费、资产、Agent 与验收契约 |
| [`frontend/PRODUCT.md`](../frontend/PRODUCT.md) | 统一创作入口的用户、定位和产品原则 |
| [`frontend/DESIGN.md`](../frontend/DESIGN.md) | Agent 工作台视觉、布局、交互和无障碍规范 |
| [`frontend/src/console/README_CONSOLE.md`](../frontend/src/console/README_CONSOLE.md) | 运营后台页面、权限、数据和隐私边界 |

## 工程与运维

| 文档 | 用途 |
| --- | --- |
| [`PROJECT_HANDOFF.zh-CN.md`](../PROJECT_HANDOFF.zh-CN.md) | 当前正式状态、持久决策和发布姿态 |
| [`PROJECT_OPERATIONS_GUIDE.zh-CN.md`](../PROJECT_OPERATIONS_GUIDE.zh-CN.md) | 本机、DEV、分支、CI、发布和回滚总流程 |
| [`DEV_ENVIRONMENT_RUNBOOK.zh-CN.md`](../DEV_ENVIRONMENT_RUNBOOK.zh-CN.md) | DEV 环境安全边界与 smoke |
| [`PRODUCTION_RUNBOOK.zh-CN.md`](../PRODUCTION_RUNBOOK.zh-CN.md) | 生产发布、核验、排障、备份和回滚 |
| [`AGENT_OPERATIONS_RUNBOOK.zh-CN.md`](../AGENT_OPERATIONS_RUNBOOK.zh-CN.md) | Mac Worker、Docker/CUA、状态、清理和 Runtime 验收 |
| [`AGENT_BROWSER_SECURITY_MODEL.zh-CN.md`](../AGENT_BROWSER_SECURITY_MODEL.zh-CN.md) | 浏览器 Agent 威胁模型与安全不变量 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 分支、提交、Review、门禁和 Handoff 纪律 |
| [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) | 直接运行时依赖、许可证和来源 |

## 运行时文档资产

`backend/agent-skills/*.md` 是 Runtime V2 可执行 Skill 资产，不是面向人的操作手册。它们随代码 Review、测试和版本控制更新，不移动到 `docs/`。

`frontend/.impeccable/surfaces/*.md` 是界面设计工具使用的 surface contract；它与 [`frontend/DESIGN.md`](../frontend/DESIGN.md) 一起约束工作台，不作为产品状态证据。

## 历史归档

历史记录集中在 [`docs/archive/README.md`](./archive/README.md)。现行文档除本索引外不得依赖归档提供当前操作步骤。

## 维护规则

- 修改代码、配置、迁移、部署或正式决定时，同一 PR 更新受影响的 living documents 和正式 Handoff。
- 不把动态 SHA、部署 ID、余额、订单、真实用户、Run ID或本机路径写进长期手册。
- `pnpm check:docs` 验证链接、锚点、归档警告、重复文档、公开信息、README 工具链版本和直接依赖覆盖。
- 外部网站可用性在发布前只读核验，不作为每次 CI 的联网依赖。

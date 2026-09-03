# Artigen 产品与运行契约

本文记录当前已实现的产品、路由、执行、认证、计费、资产和 Agent 契约。它不是未来功能清单；未通过配置、执行器和发布门禁的能力必须 fail-closed。

## 1. 产品定位与入口

Artigen 是“从一句话到可验证交付的统一创作 Agent”。用户描述目标并可附带图片、文档或网页范围，系统负责澄清、选择执行路径、展示费用与进度，并返回可下载或可继续编辑的成果。

主要入口：

| 路由 | 用途 |
| --- | --- |
| `/artigen/create` | 统一创作入口与持续设计会话 |
| `/artigen/agent` | Computer Agent 高级入口 |
| `/artigen/agent/runs/:runId` | 计划、审批、电脑、子 Agent 与文件详情 |
| `/artigen/projects`、`/artigen/projects/:id` | Creative Project 与版本工作台 |
| `/artigen/ai` | AI 图片高级工作台 |
| `/artigen/image-workshop/:toolId` | 证件照、老照片、配料、背景和编辑器 |
| `/artigen/tools/:toolId` | 本地图片、PDF、文档、视频与 favicon 工具 |
| `/artigen/market`、`/artigen/orders`、`/artigen/usage` | 套餐、订单和用量 |
| `/console/*` | 受角色保护的运营与审计后台 |

旧 URL 只在代码明确提供兼容重定向时存在，不能继续作为新文档或新依赖的主入口。

## 2. 统一执行路径

Design Conversation 首先理解目标，并在以下路径中选择最短、真实可用的执行器：

1. **直接回答**：咨询、澄清或无需文件的结果。
2. **本地工具**：浏览器内完成，不上传、不登录、不扣点。
3. **图片生成**：服务端报价后由 Kolors 生成并验证图片。
4. **专项工作流**：证件照、老照片、背景和配料等受约束 operation。
5. **Computer Agent**：研究、浏览器、Shell、多步骤或多格式交付。

执行卡必须如实标明实际执行器，不能把快速工作流、脚本或确定性演示伪装成 Computer Agent。

Design Conversation 默认最多进行一轮、两个关键澄清问题。信息充分时直接给出执行计划；需要收费时先返回报价和预算影响，用户确认后才创建任务或 Run。

## 3. 模型与能力边界

- 所有文字理解、路由、规划、父/子 Agent 和验证固定使用 `Qwen/Qwen3-8B`。
- 所有图片输出固定使用 `Kwai-Kolors/Kolors`。
- 图片产品 profile 由服务端返回能力、比例和参考图上限；客户端不得提交内部模型 ID。
- 标准图片生成不接收参考图；商品参考模式必须恰好使用一张授权图片。
- 子 Agent 最多三个、深度一层，只能使用授权输入和离线能力；浏览器、图片、外部连接、审批与最终交付权归父 Agent。
- Runtime V2、Planner、项目记忆和调度优化由服务端开关控制。当前只在 DEV 硬化，未通过真实发布门禁前不得描述为生产能力。

## 4. 会话与 Design Conversation

会话在 `/artigen/create` 中持续存在，第一条消息后进入共享三栏工作台。服务端保存净化后的消息、执行选择、审批和结果引用；默认保留 30 天，用户可提前删除。

核心接口：

| Method | Path | 契约 |
| --- | --- | --- |
| `GET` | `/api/design-assistant/status` | 当前会话规划、模型和执行器 readiness |
| `POST` | `/api/design-conversations` | 创建本人会话 |
| `GET` | `/api/design-conversations` | 列出本人会话 |
| `GET/DELETE` | `/api/design-conversations/:conversationId` | 读取或删除本人会话 |
| `POST` | `/api/design-conversations/:conversationId/messages` | 发送消息并触发受控路由 |
| `POST` | `/api/design-conversations/:conversationId/attachments` | 仅为选中的云端执行路径上传附件 |
| `GET` | `/api/design-conversations/:conversationId/events` | SSE 进度、澄清、报价、审批和结果 |
| `POST` | `/api/design-conversations/:conversationId/executions/:executionId/quote` | 获取专项/图片执行报价 |
| `POST` | `/api/design-conversations/:conversationId/executions/:executionId/agent-quote` | 获取 Agent Run 报价 |
| `POST` | `/api/design-conversations/:conversationId/executions/:executionId/target` | 选择明确执行目标 |
| `POST` | `/api/design-conversations/:conversationId/executions/:executionId/budget` | 确认预算 |
| `POST` | `/api/design-conversations/:conversationId/executions/:executionId/cancel` | 取消执行并走正式释放路径 |
| `GET/POST/DELETE` | `/api/design-conversations/:conversationId/authorizations/*` | 管理绑定会话、Origin 和动作类型的授权 |

附件默认 local-first。只有路由确定需要服务端模型、专项任务或 Computer Agent 后，才进行受所有权保护的上传；本地工具失败不能静默改为上传。

## 5. Computer Agent

Computer Agent 使用 PostgreSQL 队列和独立 Worker，在每个 Run 私有的 CUA 沙箱中执行。任务进度通过 SSE 返回；WebSocket 只用于远程桌面/noVNC 中继。

核心接口：

| Method | Path | 契约 |
| --- | --- | --- |
| `GET` | `/api/agent/status` | Worker、浏览器、出口、桌面、子 Agent 与队列状态 |
| `POST` | `/api/agent-assets` | 上传本人 Run 输入资产 |
| `POST` | `/api/agent-runs/quote` | 服务端报价与能力检查 |
| `POST` | `/api/agent-runs` | 创建本人 Run；客户端不能指定 Runtime 版本 |
| `GET` | `/api/agent-runs` | 列出本人 Run |
| `GET` | `/api/agent-runs/:runId` | Run、计划、审批、成本与终态 |
| `GET` | `/api/agent-runs/:runId/events` | SSE 事件流 |
| `POST` | `/api/agent-runs/:runId/input` | waiting_user 时补充用户输入 |
| `POST` | `/api/agent-runs/:runId/desktop-ticket` | 签发一次性桌面票据 |
| `GET` | `/api/agent-runs/:runId/artifacts` | 本人已验证交付物 |
| `GET/DELETE` | `/api/agent-browser-profiles/*` | 列出或撤销本人单 Origin 会话 |
| `GET/POST/DELETE` | `/api/integrations/*` | 管理受支持的外部集成授权 |

### 5.1 计划、审批与副作用

- 真实计划必须先于工具执行，并以稳定 step/criterion ID 持久化。
- 发送、发布、删除、购买、权限修改和其他外部副作用必须获得绑定具体动作的一次性审批。
- 密码、OTP、验证码、安全警告和最终付款不能由普通审批放行，只能由用户远程接管。
- 同一副作用不能因为 Worker 重启、租约回收或模型重试而重复执行。
- ambiguous 模型或工具回执进入人工恢复或失败路径，不能自动重放。

### 5.2 子 Agent

- 子 Agent 使用独立 Qwen3 上下文，但共享父 Run 的授权输入、预算上限和沙箱边界。
- 子 Agent 不获得浏览器、桌面、连接器、Kolors、审批或最终产物声明权。
- 父 Agent 汇总结果并对最终来源、格式和验收负责。
- 单个子 Agent 失败或取消不得伪造父任务成功，也不应无条件污染其他子任务。

### 5.3 文件与验证

支持的交付类别包括报告、XLSX、PPTX、离线网站和图片。Run 成功前至少验证：

- 文件存在、非空、MIME/扩展名与声明一致；
- 可由对应解析器或 LibreOffice 打开；
- 来源 URL 来自本 Run 实际浏览记录；
- 病毒、大小、像素、SHA-256 与对象存储回读通过；
- 计划验收项、预算、审批和回执完整；
- S3 资产属于当前用户且可下载。

零文件的 text-only Run 使用独立文本验收契约，不得被文件交付规则错误要求声明 artifact。

## 6. 工具、图片与 Creative Project

`shared/tools.catalog.json` 是工具名称、路由、operation、隐私、限制、输出格式和 SKU 的唯一目录来源。

统一工具任务接口：

| Method | Path | 契约 |
| --- | --- | --- |
| `GET` | `/api/tools/catalog` | 服务端工具目录 |
| `GET` | `/api/generation/models` | 稳定图片 profile 与真实 capability |
| `POST` | `/api/tool-tasks/quote` | 服务端报价 |
| `POST` | `/api/tool-tasks` | multipart + `Idempotency-Key` 创建任务 |
| `GET/DELETE` | `/api/tool-tasks/:taskId` | 读取或取消本人任务 |
| `POST` | `/api/asset-uploads` | 创建本人 S3 上传会话 |
| `GET/POST/DELETE` | `/api/asset-uploads/:id/*` | 恢复、签名、完成或取消 multipart |
| `GET/DELETE` | `/api/assets/:assetId` | 读取或删除本人资产 |
| `POST` | `/api/editor/transfers` | 创建短时编辑器 transfer |
| `POST` | `/api/editor/transfers/:transferId/consume` | 本人一次性消费 transfer |

Creative Project 保存品牌、需求、资产关联和生成版本。项目删除采用可恢复软删除；项目和版本更新检查所有权，敏感 payload 加密。旧生成结果只通过用户明确操作保存到项目，不自动迁移。

## 7. 认证、隐私与后台

- 普通用户使用 `HttpOnly`、`SameSite=Lax` Cookie；生产增加 `Secure`。
- Cookie 写请求必须通过 Origin 和 CSRF 校验。
- 管理员使用短时内存 Bearer token，生产每次请求重新检查 PostgreSQL 角色。
- 用户、管理员、资产、项目、会话、Run 和订单接口都执行服务端所有权/角色检查。
- 行为和模型用量只保存白名单元数据，不保存 prompt、输入文字、模型输出、密码、Token、图片 URL 或原始 IP。
- 停用用户在同一事务撤销有效会话；钱包调整只能通过不可变账本。
- 生产运营后台是否启用以 `/readyz` 为准，不能通过前端路由存在推断。

认证入口包括 `/api/auth/session`、`/api/auth/logout`、验证码、密码和 Google 登录接口；精确请求 Schema 以路由与测试为准。

## 8. 报价、钱包与支付

任务请求不能提交 `cost`、`price`、`credits`、`sku` 或嵌套变体。服务端流程：

1. 报价锁定 SKU、价格版本、能力和有效期。
2. 创建任务时锁钱包并原子冻结预算。
3. Provider 派发和工具副作用记录幂等/回执栅栏。
4. 产物持久化并验证后只结算一次。
5. 失败、取消、超时、空结果或无效输出释放全部未结算 hold。

支付订单由服务端套餐 UUID 创建；客户端不能提交金额、币种、点数或用户 ID。支付回调强制验签并向 Provider 查询规范订单，未知、错金额或重放事件不入账。

## 9. 数据、迁移与发布门禁

- PostgreSQL 迁移位于 `backend/migrations/`，生产启动在监听端口前持有 advisory lock 并应用 pending migration。
- “最新迁移”不写死在长期手册；DEV/生产均以 `/readyz.checks.database.migration` 与当前代码交叉验证。
- 生产付费能力需要 PostgreSQL、共享 S3、payload 密钥、Provider、价格和对应执行器全部 ready。
- 常规代码先进入 `dev` 并完成 smoke，再通过 PR 进入 `main`；合并 `main` 后仍需独立生产发布确认。

最低本地门禁：

```bash
pnpm check
```

GitHub Quality Gate 的具体 job 以当前 `.github/workflows/ci.yml` 为准。DEV Runtime 变更还必须通过五组 deterministic Harness、chaos、50 项 executable quality、真实 exact-SHA campaign 和对应人工审核。

50 项 Agent 固定质量集分为 report、spreadsheet、presentation、website、image 五组，每组 10 项；覆盖提示注入、来源冲突、禁止外部写入、低预算、恢复和离线渲染。确定性 Harness 通过不等于真实 Provider campaign 通过。

完整分支、环境和发布流程见 [`PROJECT_OPERATIONS_GUIDE.zh-CN.md`](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

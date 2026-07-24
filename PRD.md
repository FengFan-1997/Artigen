# Artigen 产品与接口契约

本文记录 Artigen 2.0 当前实现的产品、认证、计费、任务、资产和编辑器契约。它是协作基线，不是未来功能清单；没有可信执行器或外部环境的能力必须明确 fail-closed。

## 1. 产品范围

稳定入口：

- `/artigen`：产品首页。
- `/artigen/ai`：AI 生图工作台；旧 `/api/generate`、`/api/img2img` 只作一版兼容。
- `/artigen/image-workshop/:toolId`：5 个工坊入口。
- `/artigen/tools/:toolId`：8 个工具工作流。
- `/artigen/image-workshop/image-editor`：图片编辑器 2.0；`?editor=legacy` 可回退一版。
- `/artigen/market`、`/artigen/orders`、`/artigen/usage`：套餐、订单和用量。
- `/console/*`：运营控制台，未登录不会展示伪造财务数据或模拟生成结果。

唯一目录是 `shared/tools.catalog.json`。前后端路由、名称、能力、隐私、限制、operation、输出格式和 SKU 都由它派生。旧 `?tool=` 与旧 ID canonical redirect 到稳定子路由。

工坊：

1. `id-photo`：标准证件照完全本地免费；AI 职业形象是独立、需确认的收费 operation。
2. `old-photo`：服务端付费增强/上色，支持结果版本、对比和真实取消，不声称历史事实复原。
3. `ingredient-label`：只整理用户原文，不补全、不发明、不提供 FDA 或其他合规结论。
4. `background`：本地免费换色/换图与收费 AI 场景生成分开，不允许本地失败后静默上云。
5. `image-editor`：本地非破坏编辑器 2.0。

工具工作流：`image-batch`、`privacy-redaction`、`video-frame`、`pdf-image`、`pdf-text-word`、`document-pdf`、`video-gif`、`favicon`。本地任务不要求登录、不上传、不扣点；Word 保真模式是例外，必须明确同意上传并通过 LibreOffice 能力检查。

主生图现阶段只提供 `standard-v1`，不展示没有真实差异的模型品牌。快速生成使用 `ai-design.generate.v1`（10 点）；深度模式先用 `ai-design.directions.v1`（5 点）产出四个方向，用户选定后再独立确认 10 点生成。六个起步模板只填写需求，不创建任务或扣费；三个参考槽按商品、风格、场景的固定语义顺序提交。

## 2. 运行架构

- 前端：Vue 3、Vite、Pinia；按路由懒加载 Fabric、PDF、ECharts、GIF/WebP 处理代码。
- 后端：Express 5/CommonJS、`pg`、`node-pg-migrate`、`zod`，不使用 ORM。
- 数据：PostgreSQL 16 是用户、会话、钱包、账本、订单、任务和资产元数据的唯一生产写源。
- 二进制：本地/单实例测试可用 file，生产付费生图必须使用多实例共享的 S3/R2 兼容适配器；数据库不保存 Base64/BLOB。
- 发布：DEV 使用 Render 同源站点并跟踪 `dev`；生产前端在 Vercel、后端在 Render。
  `main` 合并与生产上线是两个独立动作，生产发布必须人工确认。

没有 `DATABASE_URL`，或 `PAID_FEATURES_ENABLED` 不等于 `true` 时，收费能力返回 `DATABASE_NOT_CONFIGURED` 或 `PAID_FEATURES_DISABLED`。这是一项安全门禁。

## 3. 认证与安全

普通用户使用同源 Cookie 会话：

- Cookie 名为 `auth_token`，`HttpOnly`、`SameSite=Lax`，生产增加 `Secure`。
- 普通用户前端不读取或接收 bearer token；密码和所有 token 均不持久化。管理员登录只把短时 Bearer token 保存在内存中。
- `GET /api/auth/session` 返回当前用户和派生 CSRF token。
- Cookie 认证的写请求必须通过 Origin 校验并发送 `X-CSRF-Token`。
- `POST /api/auth/logout` 撤销服务端会话并清 Cookie。
- `SESSION_NOT_BEFORE` 可强制旧会话整体失效。
- 用户切换必须重新登录；访客内容可显式合并，访客点数不能合并。

OTP 只保存 HMAC，10 分钟有效、60 秒发送冷却、最多 5 次尝试。密码使用异步 scrypt。Google credential 的不安全解码只允许非生产且显式开启。

管理员使用 `/api/admin/login` 签发的短时 Bearer token。生产拒绝默认 `admin/admin123456`，并始终禁用静态 `ADMIN_KEY`；后者只用于非生产显式兼容。生产登录必须绑定 active PostgreSQL `administrators` 记录，每个管理请求都重新检查角色；`operator` 可读，`admin`/`owner` 才能调账、停用/恢复用户或补偿支付，财务与账号状态审计保存真实 `actor_user_id`。停用用户时必须在同一事务撤销其有效会话。管理员通过 `pnpm --filter backend admin:grant -- <userId> <role>` 显式授权。

远程图片代理和 provider 结果持久化执行协议、host allowlist、DNS/IP、跳转、大小、magic bytes 与 MIME 校验，并固定验证后的 DNS 地址。`/files` 不会向任意外域拼接 token。产品页访问与点击进入 PostgreSQL `behavior_events`：只保存净化页面路径、稳定操作标识、时间和 opaque 用户/会话/项目引用；不读取按钮文案、`aria-label` 或 DOM `id`，不保存输入文字、prompt、模型输出、图片/文件 URL、密码或密钥，IP 只保存哈希，UA 只保存设备类别，默认 90 天并由独立调度器清理。usage、图片历史与内容审计采用同样的严格白名单并写入 `operational_records`；旧 JSON 只在无数据库非生产兼容模式使用，读取时再次净化并写回。

## 4. 任务、报价与计费

统一状态：

```text
idle -> validating -> awaiting_confirmation -> queued -> running
                                             -> success | failed | cancelled
```

本地 operation 进入浏览器 Worker；服务端 operation 使用统一任务 API。当前可信收费执行器开放老照片增强/上色、AI 职业形象、AI 场景背景、配料原文整理与 `ai-design.generate`/`ai-design.directions`。职业形象和背景客户端只能传服务端枚举及主体变换参数，prompt 由服务端构造；配料任务只允许整理用户原文，结算前必须通过来源追溯。其他未接入 operation 返回 `TOOL_OPERATION_UNAVAILABLE`，不会排队或扣费。

任务请求只能包含：

```text
toolId / operation / options / inputAssets / quoteId
```

客户端禁止传 `cost`、`price`、`credits`、`sku` 或其嵌套变体。`POST /api/tool-tasks` 必须使用 multipart 和 `Idempotency-Key`。

财务事务：

1. 报价锁定服务端 SKU、价格版本和有效期。
2. 创建任务时锁钱包与报价，原子减少 available、增加 frozen，并写 task、hold、ledger。
3. 输出通过校验且资产已持久化后，只结算一次。
4. 失败、取消、超时、空结果、无效输出或持久化失败，原子释放全部 hold。
5. 相同幂等键与相同请求只执行/收费一次；同键不同请求返回 `409 IDEMPOTENCY_CONFLICT`。
6. 钱包更新带约束和行锁，可用与冻结余额不能为负。

服务端任务由 PostgreSQL 租约队列认领：`FOR UPDATE SKIP LOCKED`、90 秒默认租约、心跳续约和最多一次派发前重领。`provider_dispatched_at` 是重试栅栏；一旦已派发而结果不明，只能失败退款。hold 过期会在输入完成、任务认领、心跳、Provider 派发和结算阶段 fail-closed，不能由迟到结果重新变成收费成功。DELETE 先在数据库标记取消并释放 hold，再通过 PG `NOTIFY` 和本机 `AbortController` 中断执行；取消后的迟到结果不能结算。

主生图 prompt/产品档案与配料整理原文仅写入 AES-256-GCM 短期 payload，AAD 绑定 task ID，密钥来自 `TASK_PAYLOAD_ENCRYPTION_KEY`。普通任务 options 只保存必要枚举、文本长度和 SHA-256，不保存原文；缺少密钥时对应报价与创建 fail-closed，任务终态删除 payload。

工坊付费 AI 使用独立熔断开关 `WORKSHOP_AI_TASK_V2_ENABLED`。关闭时职业形象、AI 场景背景和配料 AI 整理均不可报价或创建，但本地证件照、本地换背景和本地配料排版继续可用且不扣费。`/readyz` 在开关开启且付费能力启用时要求 PostgreSQL 迁移、对象存储、payload 密钥和完整 Provider adapter 全部就绪。

生图发布使用稳定用户 cohort：全局 `AI_DESIGN_TASK_V2_ENABLED` 开启后，`AI_DESIGN_TASK_V2_INTERNAL_USERS` 内部用户优先放行，再按数据库用户 UUID 的确定性哈希执行 `AI_DESIGN_TASK_V2_ROLLOUT_PERCENT` 10% → 50% → 100% 灰度。财务或资产指标越界时关闭全局开关立即熔断，不能依赖浏览器随机数或会漂移的 session 分桶。

结果统一为 `{ assets, receipt, warnings }`。`receipt` 包含 SKU、报价、实扣、退款和余额。错误统一包含 `code`、可选 `field`、`messageKey` 与 `retryable`。

## 5. 支付契约

前端先读 `GET /api/pay/packages`，创建订单时发送目录返回的套餐 UUID，不发送金额、点数、币种或用户 ID。服务端创建本地 pending 订单并锁定套餐版本、金额、币种和点数。

爱发电回调流程：

1. 标准支付回调在所有环境强制验签；缺签、伪造签名直接拒绝。
2. 使用服务端 API 凭证按 provider order id 查询规范订单。
3. 只认本地 pending 订单及其已锁定用户、套餐、金额和点数。
4. provider event、provider order、ledger idempotency key 都有唯一约束；并发和重放只能入账一次。
5. 已验签但未知订单、错金额、错套餐等事件进入 dead letter，不入账。
6. 管理员 reconciliation 会再次查询 provider 规范订单；不能用请求体修改用户、套餐、金额或点数。

PostgreSQL UUID 是内部规范用户标识，legacy user id 被数据库约束为不得伪装成 UUID。active 套餐短别名具有唯一约束；UUID/完整 SKU 为规范引用。

## 6. 资产与保留

资产行记录所有者、opaque URI、SHA-256、magic-byte 校验后的 MIME、大小、尺寸、创建时间、过期时间和 GC 状态。读取 `/api/assets/:assetId` 必须校验所有权。

写入使用 URI advisory transaction lock 与 `writing -> active` 状态；数据库提交失败会尽力补偿删除对象。同内容重传会安全取消正在删除的旧 claim。回收器通过 `SKIP LOCKED` 租约认领，删除前再次检查状态以及 active transfer、queued/running task 引用。失败使用退避重试。

file 适配器还执行带游标的 inventory reconciliation，在宽限期后清理数据库不存在的孤儿对象。S3/R2 第一阶段使用过期资产行回收；生产应同时配置 bucket 生命周期规则作为兜底。生成结果写入后必须重新读取并校验字节数和 SHA-256，只有通过验证的 opaque asset 才能结算。

## 7. 图片编辑器 2.0

`fabric@7.4.0` 只负责交互投影；`EditorDocumentV2` 和 Pinia/domain store 是业务真源，Fabric 对象只保存 `layerId`。legacy 的 `ImageEditor.vue` 不再继续堆功能。

模块：

- `domain/store`：像素/sRGB 文档、图层顺序、选择、工具状态和命令。
- `engine`：Fabric 投影、viewport、多选、控制柄、对齐、分布和吸附。
- `assets`：IndexedDB Blob、ObjectURL/ImageBitmap 生命周期与可达性 GC。
- `history`：事务式 Undo/Redo，最多 100 条。
- `workers`：滤镜、去背景、手动多边形抠图、增强、2x 放大和导出，均带 revision stale-result guard。
- `export`：预览与导出共享 render description。

首版支持图片、文字、矩形/圆角矩形、椭圆、直线，多选，变换，翻转，锁定/显隐/排序，非破坏 crop 和 adjustments，PNG/JPEG/WebP 1x/2x/3x 导出。导入永远先创建普通单层，不会隐式拆前景/背景。本地去背景、抠图、增强和放大明确标注为实验能力。

项目在变更后 750ms 自动保存到 IndexedDB，支持崩溃草稿恢复和存储失败提示。取消、Undo、切层、切项目或离开页面后，旧 Worker 结果不能提交。移动端裁剪/抠图会收起大面板并保留紧凑控制条。

V1 不承诺 PSD、视频、复杂蒙版、画笔修复、生成式填充、CMYK、多人协作。

## 8. 公共 API

### 认证

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/auth/session` | 当前 Cookie 会话与 CSRF token。 |
| `POST` | `/api/auth/logout` | 撤销会话。 |
| `POST` | `/api/login/send-code` | 发送 OTP。 |
| `POST` | `/api/login/verify` | OTP 登录。 |
| `POST` | `/api/auth/login` | 密码登录。 |
| `POST` | `/api/auth/register` | 注册。 |

### 工具与资产

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/tools/catalog` | 统一 `ToolDefinition` 目录。 |
| `GET` | `/api/generation/models` | 稳定产品 profile 与真实 capability，不暴露内部模型。 |
| `POST` | `/api/tool-tasks/quote` | 服务端报价。 |
| `POST` | `/api/tool-tasks` | multipart + `Idempotency-Key` 创建任务。 |
| `GET` | `/api/tool-tasks/:taskId` | 本人任务结果。 |
| `DELETE` | `/api/tool-tasks/:taskId` | 取消并退款未结算任务。 |
| `POST` | `/api/asset-uploads` | 创建登录用户专属的单 PUT / multipart S3 直传会话。 |
| `GET` | `/api/asset-uploads/:id/parts` | 恢复本人已上传分片。 |
| `POST` | `/api/asset-uploads/:id/parts/:part/sign` | 签发本人分片上传 URL。 |
| `POST` | `/api/asset-uploads/:id/complete` | 幂等完成、校验并返回既有 asset 结构。 |
| `DELETE` | `/api/asset-uploads/:id` | 取消并清理暂存对象。 |
| `GET` | `/api/assets/:assetId` | 本人资产。 |
| `DELETE` | `/api/assets/:assetId` | 提前删除本人资产。 |
| `POST` | `/api/editor/transfers` | 创建短时编辑器 transfer。 |
| `POST` | `/api/editor/transfers/:transferId/consume` | 本人一次性消费 transfer。 |

### 支付与点数

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/pay/packages` | active 套餐与服务端价格。 |
| `POST` | `/api/pay/create-order` | 创建本地支付订单。 |
| `GET` | `/api/pay/orders/:orderId` | 本人订单。 |
| `POST` | `/api/pay/afdian/webhook` | 强制验签、provider reconciliation 回调。 |
| `GET` | `/api/credits/balance` | 本人钱包余额。 |
| `GET` | `/api/credits/orders` | 本人已支付订单。 |
| `GET` | `/api/credits/holds` | 本人任务冻结记录。 |
| `GET` | `/api/admin/payments/dead-letters` | 管理员查看支付异常事件。 |
| `POST` | `/api/admin/payments/reconcile/:eventId` | 管理员补偿处理。 |

`/api/generate`、`/api/img2img`、`/api/credits/costs` 保留一个兼容周期，忽略客户端价格。收费能力稳定迁移前不可新增对这些旧入口的直接依赖。

生图运营事件进入 PostgreSQL `generation_events`，只接受固定事件名及枚举、布尔、长度、哈希、耗时和 task/quote/session opaque 引用，不保存 prompt、文件名或图片 URL。控制台 `/api/admin/generation/funnel` 汇总成功率、退款率、队列与 Provider p50/p95、资产持久化失败、未结算 hold 和每成功任务成本。

### 运营后台

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 服务端管理员账号密码登录，签发短时 token。 |
| `GET` | `/api/admin/me` | 当前管理员和角色。 |
| `GET` | `/api/admin/overview` | 用户、点数、订单、任务、行为和审计聚合。 |
| `GET` | `/api/admin/users` | 用户、状态、钱包、最近活跃和访问次数。 |
| `POST` | `/api/admin/users/status` | admin/owner 停用或恢复用户。 |
| `POST` | `/api/admin/users/credits` | admin/owner 账本化调整用户可用点数。 |
| `GET` | `/api/admin/credits/ledger` | 不可变钱包流水筛选与分页。 |
| `GET` | `/api/admin/behavior/events` | 页面访问和点击行为筛选与分页。 |
| `GET` | `/api/admin/behavior/summary` | 行为总量、趋势、热门页面和操作。 |
| `GET` | `/api/admin/audit/events` | PostgreSQL 管理和系统审计。 |
| `GET` | `/api/admin/usage/ledger` | PostgreSQL 最小化模型用量。 |
| `GET` | `/api/admin/images/history` | PostgreSQL 最小化图片任务历史。 |
| `GET` | `/api/admin/audit/history` | PostgreSQL 最小化内容审计历史。 |

后台页面信息架构固定为运营总览、用户管理、点数账本、行为轨迹、系统审计、内容审计、
模型用量和系统设置。旧 `/console/billing`、`/console/playground` 仅保留重定向，不再
展示模拟充值、模拟生成或浏览器本地业务数据。

## 9. 数据迁移与发布门禁

迁移文件位于 `backend/migrations/`。财务 JSON 导入使用 `backend/scripts/import-json-to-postgres.js`，迁移核对使用 `audit-json-postgres.js`。切换后旧财务快照只读保留，不是回退源；产品行为写入 `behavior_events`，最小化 usage、图片历史和内容审计写入 `operational_records`。旧 JSON analytics/usage/history 仅用于无数据库非生产兼容。钱包与不可变账本余额使用 bigint，避免合法购买在 32 位整数边界回滚。

Render 从仓库根目录安装完整 workspace。`pnpm start:production` 在监听端口前持有
PostgreSQL advisory lock 并应用全部迁移；迁移失败时新版本不得启动。托管 PostgreSQL
默认校验证书；生产应配置 `PG_SSL_CA`/`PG_SSL_CA_BASE64`，只有已评估的私有网络兼容
场景才可显式设置 `PG_SSL_REJECT_UNAUTHORIZED=0`。

完整门禁：

```bash
pnpm check
```

它执行只读 lint、类型检查、前后端单测、六组 Playwright 项目（Chromium/Firefox/WebKit 桌面与移动视口）、生产构建和首页 250 KiB gzip 预算。CI 使用 PostgreSQL 16 并先应用全部迁移；任一 P0/财务测试失败时保持 `PAID_FEATURES_ENABLED=false`。

Provider、内部模型或 prompt 模板变更还必须用 `backend/evaluation/ai-design-quality-set.json` 的同一组 30 个中英文电商案例生成 baseline/candidate manifest，再运行 `pnpm --filter backend eval:generation:blind -- ...` 创建去标识盲评表。完成盲评后以 `pnpm --filter backend eval:generation:score -- --review <file>` 验证：candidate 硬约束通过率不少于 90%，且平均分与偏好胜负均不得劣于旧链路。没有测试 Provider 凭证时只运行契约 mock，不伪造质量结论。

外部 AI、SMTP、爱发电和对象存储先使用契约 mock/fixture。没有独立 DEV 凭证时不得
发起真实支付或收费 Provider 请求。代码先进入 `dev` 并完成 smoke，再通过 PR 进入
`main`；合并 `main` 后仍需独立的生产发布确认。完整流程见
`PROJECT_OPERATIONS_GUIDE.zh-CN.md`。

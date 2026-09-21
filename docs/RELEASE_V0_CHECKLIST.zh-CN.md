# Artigen Beta 发布清单

本文把 Artigen 的第一阶段发布固定为邀请制 Web Beta。它描述提交前和部署后必须核对的事实，不代表已经完成生产发布。

## 发布范围

第一版只承诺以下闭环：

1. 用户登录；
2. 创建项目；
3. 发起一次文本或图片生成；
4. 查看、下载生成产物；
5. 刷新、重新登录或短暂断线后可以看到任务状态。

公开注册、自助支付、Runtime V2、子 Agent、Provider Scheduler 和高并发 campaign 在本 Beta 中保持关闭。支付和数据库相关 readiness 仍然可以存在，但 readiness 不等于用户流量已经开放。

## 环境真相

发布前从以下三处读取配置并逐项比较：

- 提交仓库中的 [`render.yaml`](../render.yaml) 和 [`render.dev.yaml`](../render.dev.yaml)；
- Render Dashboard 的实际 Environment Variables；
- 部署后 `/api/meta`、`/readyz` 和 `/api/agent/status`。

`/api/meta` 返回 API 的 Git SHA、版本、环境名、发布策略及实际配置能力。`capabilitySemantics=configured-not-readiness` 明确表示配置状态，不承诺依赖或用户权限已通过；`releasePolicy.violations` 列出当前配置超出 Beta 范围的能力。前端构建和 Worker SHA 仍须分别从平台 deployment 与 Worker 证据核对，不能仅靠前端代理的 `/api/meta` 证明三端一致。Render 的浅层健康检查固定使用 `/healthz`；`/readyz` 只用于部署 smoke 和人工发布门禁。

生产、DEV 和未知环境按发布策略关闭公开注册，即使平台误设 `ARTIGEN_PUBLIC_SIGNUP_ENABLED=true` 也不会开放。邀请用户通过平台 Secret `ARTIGEN_INVITE_EMAILS` 维护，使用逗号分隔的规范化邮箱地址；不要把真实邀请名单提交到仓库。名单变更后必须重新执行登录、注册、项目创建和生成 smoke。密码注册、OTP 自动建号、Google 自动建号共用同一策略；已有用户不因移出邀请名单而被禁止登录，停用账号必须走管理员停用入口。

生产蓝图使用最小常驻 `starter` 实例，避免 Beta 用户第一次访问时遇到 Free 实例冷启动。DEV 可以继续使用 Free 计划，但不能把 DEV 的冷启动行为当作生产可用性证据。

## 配置对照与开放顺序

| 项目 | DEV / Preview | Production | 验证依据 |
| --- | --- | --- | --- |
| 环境名 | DEV API 使用 `APP_ENV=dev`，Preview 只指向 DEV | `APP_ENV=production` | meta.environment |
| 公开注册 | 关闭；真实名单只放平台 Secret | 关闭；真实名单只放平台 Secret | 非受邀密码/OTP/Google 创建均 403 |
| 自助支付 | `PAYMENTS_ENABLED=false` | `PAYMENTS_ENABLED=false` | API、readiness、meta 共用同一解析函数 |
| 生成与钱包 | `PAID_FEATURES_ENABLED` 与生成开关验收后开启 | DEV 验收后设置同等配置 | 不能为了关闭支付而关闭生成/钱包 |
| Runtime V2 | `AGENT_RUNTIME_V2_ENABLED=false` | 同左 | 原有真实开关，不新增同义开关 |
| 数据库/对象存储 | DEV 库与 DEV bucket/prefix | 独立生产库与生产 bucket/prefix | 隔离检查、上传/读取/删除 |
| 邮件与模型 | Secret 中配置并验证 | Secret 中配置并验证 | readiness 非 skipped + 真实 smoke |
| API / Worker / 前端版本 | 同一已验证 SHA | 已验证的 main SHA | 分别记录平台与 Worker 证据 |

蓝图目前仍保守关闭生成、OTP 等依赖能力；这表示“待配置验收”，不表示直接套用蓝图就能交付 MVP。不要批量打开开关。先核对 Secret、迁移与存储隔离，再逐项开启并测试。

上轮引入但未接入运行时的 `ARTIGEN_SELF_SERVE_PAYMENTS_ENABLED`、`ARTIGEN_AGENT_RUNTIME_V2_ENABLED` 已删除，统一使用现有 `PAYMENTS_ENABLED`、`AGENT_RUNTIME_V2_ENABLED`。支付关闭不改变已有账务记录，也不删除钱包余额。

## 提交门禁

每个发布 PR 必须说明：

- 变更目的和核心用户路径；
- 影响的环境变量、迁移和能力开关；
- 本地测试命令和结果；
- DEV smoke 账号、部署 SHA 和 `/readyz` 结果；
- 失败后的回滚 SHA。

最小检查命令：

```bash
pnpm check:workspace
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

如果改动触及 Agent、真实数据库、对象存储或 Worker，还必须运行对应的定向集成测试。没有 PostgreSQL、MinIO、真实 Provider 或 Worker 的证据时，不能把本地 mock 结果写成生产通过。

## 部署后 smoke

```bash
curl --fail --silent https://artigen-fengfan.vercel.app/api/meta
curl --fail --silent https://artigen-fengfan.vercel.app/readyz
curl --fail --silent https://artigen-app-fengfan.onrender.com/healthz
```

新增只读自动门禁（替换占位 SHA，不使用分支名）：

```bash
pnpm smoke:beta https://artigen-fengfan.vercel.app <完整40位main-SHA> production
```

该命令检查 API SHA、环境、能力范围、健康状态及数据库/存储/模型/邮件的非 skipped 检查。失败返回非零退出码，输出不包含远程响应正文或凭据。它不检查前端构建 SHA，也不替代真实用户流程、Worker 心跳或恢复演练。

随后使用固定测试账号完成：登录、创建项目、文本生成、图片生成、文件上传、产物下载、刷新页面、失败重试和退出后重新登录。

## 数据和恢复

Beta 开放前必须留下一份不含秘密的恢复记录：

- PostgreSQL 备份文件、备份时间和迁移版本；
- 在隔离数据库完成恢复，并验证项目、任务、资产元数据和账务记录；
- 从 S3 恢复一个真实产物并验证 MIME、字节数和 SHA-256；
- 重启 Worker 后验证队列任务不会重复结算；
- 记录恢复失败时的人工接管方式。

## Beta 通过标准

- 至少 5 名测试用户各完成 3 次核心任务；
- 核心任务成功率达到 90%；
- 没有未解决的 P0/P1 问题；
- 没有数据丢失或重复结算；
- 备份恢复和上一版本回滚都实际演练过；
- 每个关键失败都有用户能理解的提示和后台关联 ID。

本文只描述发布契约。真实生产状态仍以线上探针、`/api/meta`、`/readyz` 和平台 deployment 为准。

## 管理员最小操作手册

1. 开通：把邮箱加入目标环境的 `ARTIGEN_INVITE_EMAILS` Secret，再让用户走正常 OTP/Google/密码注册。不要共享管理员账号。
2. 配额：检查 `CREDITS_INIT`、单任务预算和已有接口限流；通过受保护的管理界面发放测试点数，保留审计，不直接改钱包表。
3. 查错：先记录前端错误码和关联 ID，再查同一环境任务状态、日志、Provider 与 Worker 状态；不要粘贴用户输入或 Secret。
4. 重试：先确认原任务已终态、冻结点数已释放；按产品重试入口执行。对结果不明或已产生副作用的任务先核对回执，不盲目重新生成。
5. 停用：使用管理员用户状态接口 `/api/admin/users/status`（活动管理员身份），随后检查登录与现有会话访问已被拒绝。移除邀请名单只能阻止新建号。
6. 回滚：关闭新任务入口，按已有生产手册回到上一已验证 SHA，核对 API/前端/Worker 与任务冻结余额。数据库回滚不得用删表或删除审计记录代替。

## 恢复演练与 Beta 记录模板

下表为空白验收表，全部需要执行后填写，不能把脚本存在当作演练成功。

| 场景 | 所需证据 | 当前状态 |
| --- | --- | --- |
| 数据库恢复 | 受限备份位置、SHA-256、迁移版本、隔离库恢复/审计报告、耗时 | 待执行 |
| S3 产物恢复 | 合成产物原校验值、隔离前缀恢复后校验值、授权下载结果 | 待执行 |
| Worker 重启 | 重启前后任务状态、队列量、无重复结算、耗时 | 待执行 |
| 超时/断网/重试 | 用户提示、关联日志、退款/冻结释放、恢复动作 | 待执行 |
| 版本回滚 | 上一 SHA、三端版本、探针、登录/生成/下载结果 | 待执行 |

数据库使用现有 `pnpm db:backup:neon` 与 `pnpm db:restore:verify`；后者会重建目标 public schema，只能指向专用可丢弃的 restore/verify/drill 数据库，绝不能填生产或 DEV 业务库。先确认备份与独立恢复目标，不把生产数据复制进共享测试环境。对象存储只对演练前缀和合成文件操作。

邀请名单和反馈明细保留在私有记录中。每人记录 3 次任务的首次完成耗时、成功/失败、下载结果、重试意愿、成功任务模型成本。先收满至少 5 人和 15 次真实任务的证据，再判断 90% 成功率；不提前填写通过。

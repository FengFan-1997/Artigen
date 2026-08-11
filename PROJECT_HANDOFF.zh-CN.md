# Artigen 项目正式 Handoff

更新时间：2026-08-11（Asia/Shanghai）

文档性质：**GitHub 正式项目状态 / 持久事实总入口**

本文只保留已经确定并产生持久影响的架构、代码、配置、迁移、部署和正式决定。开发中的具体进度、临时尝试、失败调试和下一条命令只记录在被 Git 忽略的 `HANDOFF.local.md`，不进入本文。

> 本文不保存密码、API Key、Token、数据库连接串、OTP、恢复码或平台 Secret。账号标识、公开资源 ID、环境变量名称和密钥存放位置可以记录，秘密值不可以。

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

截至 2026-08-10 的已验证生产基线：

| 项目 | 正式状态 |
| --- | --- |
| GitHub 仓库 | `FengFan-1997/Artigen` |
| 生产代码 | `main`，SHA `529b73fffcd2f06323ccd373168a5e009f312b5a` |
| 生产前端 | Vercel `artigen-fengfan` |
| 生产后端 | Render `artigen-app-fengfan`，Service `srv-d9cr73r7uimc73etc4j0` |
| 生产部署 | Render deployment `dep-d9qsuam417fc7383uj70`，`live` |
| 生产数据库 | Neon PostgreSQL `neondb` |
| DEV 数据库 | Neon PostgreSQL `dev_artigen` |
| 对象存储 | 私有共享 S3 桶 `artigen-assets` |
| 数据库迁移 | `020_agent_secure_browser_relay` |
| GitHub 发布流水线 | run `31178240786`，Release gate `success` |

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

已验证运行状态：

```text
workerOnline=true
browserReady=true
egressVerified=true
desktopRelayReady=true
browserPublicEnabled=true
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

### 5.3 Agent 生图与付费主业务恢复（开发阶段）

用户已批准在 `codex/agent-image-generation` 实现以下正式变更：Agent 保持 owner-only，新增文生图、最多三张任务参考图和独立 `IMAGE` 交付；主业务在 readiness 全部通过后恢复 AI Design、Workshop、Task Worker 和爱发电支付，并向所有登录用户开放。`render.yaml` 继续保留安全关闭默认值，生产开关只能通过 Render Dashboard 覆盖。

当前阶段仅为功能分支实现与本地验证，尚未完成 PR、DEV 真实依赖 smoke、`dev → main` Release gate、生产发布或线上验收。当前生产基线、deployment 和开关状态仍以本文第 1 节以及实时 `/api/meta`、`/readyz`、`/api/agent/status`、`/api/generation/models` 为准，不得提前宣称已上线。

## 6. 已知风险与正式后续事项

- Render 使用 Free 实例，会休眠或重启，不提供商业级 SLA。
- Agent Worker 绑定当前 Mac；关机、合盖、退出登录或 Docker 停止会让任务排队。
- Agent 单并发，当前只开放给 owner。
- 当前没有自定义域名。
- 生产管理后台没有可用管理员，行为统计不能仅凭队列状态推断。
- 已有生产发布前逻辑备份，但定时备份和恢复演练仍需建立。
- 稳定 24×7 需要用户明确同意费用后升级 Render 并迁移 Worker 到专用 Linux 主机。
- 扩大 Agent Beta 前需要重新验证容量、失败率、S3 用量、沙箱清理和敏感输入隔离。

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

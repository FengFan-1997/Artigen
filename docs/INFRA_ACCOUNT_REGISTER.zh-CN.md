# Artigen 平台账号与接管报告

本报告是开发和运维必读的现行平台清单。核对日期：2026-09-22。它记录服务用途、登录入口、认证方式和核验状态；个人邮箱、账号标识、凭据和资源 ID 不进入公开仓库。实际账号与凭据通过项目所有者、既有平台会话或系统钥匙串核对。

旧 `ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md` 的工作树副本最后更新于 2026-08-07，已退出当前文档体系，其中 Neon 等记录不能覆盖后续迁移事实。本报告接替其账号接管用途；部署状态仍以[正式 Handoff](../PROJECT_HANDOFF.zh-CN.md)和实时平台为准。

## 平台清单

| 平台与入口 | Artigen 用途 / 环境 | 登录方式与接管位置 | 核验状态 |
| --- | --- | --- | --- |
| [GitHub](https://github.com/login) | 代码、PR、CI；DEV / 生产发布来源 | 现有 Chrome 会话或已认证 `gh` CLI；平台 Owner 由项目所有者管理 | 本轮确认 Chrome 和 CLI 均已登录；不据此推断其他平台的绑定关系 |
| [Aiven](https://console.aiven.io/login) | DEV PostgreSQL 18 | Chrome 控制台使用 Aiven Password 邮箱密码认证；用户提供的资料存于 macOS Keychain 的 `Artigen Aiven Console` 条目；数据库与控制台凭据分开 | 2026-09-22 已通过现有 Chrome 会话核实认证页面及现有 DEV 项目；服务为 PostgreSQL 18.6、Free 套餐、Running，主机及端口与 Worker 配置一致；未创建新账号或新服务 |
| [Neon](https://console.neon.tech/) | 旧报告记载生产 PostgreSQL 和 S3 对象存储 | 旧记录称绑定 GitHub，并曾有 Neon CLI 会话 | 历史信息，当前生产数据库所属项目、控制台身份与认证方式需重新核验；不得再据旧报告把 DEV 数据库标为 Neon |
| [Render](https://dashboard.render.com/) | DEV 同源 Web/API、生产 API 与平台 Secret | 本机已认证 CLI；旧报告记载 GitHub 登录，网页绑定待复核 | 本轮已通过平台只读配置核对 DEV 数据库与 Worker 配置一致；没有修改平台权限 |
| [Vercel](https://vercel.com/login) | 生产前端、Preview、邮件中继 | 既有 CLI / 浏览器会话；具体网页认证方式待核验 | 用途沿用现行部署文档；本轮未核验平台账号 |
| [Cloudflare](https://dash.cloudflare.com/) | Workers AI、Turnstile 和相关运行凭据 | 平台 Secret / Keychain；控制台登录方式待核验 | 不从 API Key、模型名称或 Keychain 标签推断账号 Owner |
| [SiliconFlow](https://cloud.siliconflow.cn/) | 模型服务与受控回退 | 平台 Secret / Keychain；控制台登录方式待核验 | 本轮未核验控制台账号或重新执行付费模型测试 |
| 邮件服务 | OTP 邮件，经 Vercel 中继连接 SMTP | SMTP 授权凭据与中继 Secret；由项目所有者接管邮箱 | 不把 SMTP 授权凭据当成邮箱登录密码；个人邮箱不写入本报告 |
| 支付服务 | 既有支付通道 | 平台 Secret 与既有支付后台；控制台入口、商户归属和认证方式待核验 | 用户要求保留支付；本轮不创建订单、不执行真实付款，不沿用旧报告中的“支付关闭”结论 |

“待核验”表示目前没有足够证据，不表示账号不存在或服务不可用。登录方式只能在实际完成登录或读取平台认证设置后升级为“已核验”。

## 数据与凭据边界

- DEV 数据库已确认属于 Aiven；控制台显示公网部署、IP allowlist 为 Open to all，服务 Running。本机 TCP 连接仍超时，API 配置与 Worker Keychain 身份一致；不能把故障归因于该服务的 IP 白名单或密码，也未修改网络访问规则。
- 2026-09-22 DEV Mac Worker 的失效启动路径已修复，独立 checkout 对齐已验证 DEV SHA，启动项加载待命且停止自动重试；尚未恢复心跳。数据库与控制台凭据仍保存在原 Keychain，未改账号、权限或存放机制。具体恢复和回滚流程见[Agent 运维手册](../AGENT_OPERATIONS_RUNBOOK.zh-CN.md#工作目录丢失后的恢复)。
- DEV 与生产的 S3 endpoint、bucket 当前相同，资产键没有环境前缀。文件存储尚未实现环境隔离；更换 bucket 前必须核对历史资产 URI 和兼容读取，不能直接切换导致旧文件失效。
- S3 合成对象的上传、备份、删除、恢复与授权下载已验收并清理；这不等于整桶灾备或真实业务数据恢复完成。
- 数据库连接串、CA、API Key、SMTP 授权凭据、支付密钥只存于平台 Secret、系统钥匙串或被忽略的本地环境文件。报告只记录变量名称、存储机制和接管步骤，不复制秘密值。
- 账号所有权、登录方式、凭据存放位置和应用运行状态是不同事实；任何一项的成功不能替代其他项的核验。

### Aiven 控制台凭据取用

在 macOS“钥匙串访问”中搜索 `Artigen Aiven Console`，条目的通用账户标签为 `console-login`，加密内容保存控制台邮箱与用户提供的密码，并标注该密码尚未重新登录验证。通过系统授权查看；不要把内容复制到本报告、Handoff、PR 或终端输出。保存已通过内存回读一致性校验；现有 Chrome 会话已核实为邮箱密码认证，但没有通过注销再登录验证钥匙串中的密码值。

控制台注册页提供 GitHub 入口，但当前认证设置显示 Aiven Password；不能把注册入口当成已有 GitHub 绑定。数据库连接凭据与控制台登录凭据是两套独立凭据，不互相替换。

## 账号或平台变更时必须同步

以下任一变化，都必须在完成该任务时同步本报告、受影响的 runbook 和正式 Handoff；有 PR 时放在同一 PR，不能只留在聊天或本地 Handoff：

1. 新增、替换、停用平台、账号、组织或项目，以及 DEV / 生产归属变化。
2. 登录邮箱、账号归属、GitHub / Google / SSO 绑定、MFA 或恢复方式变化。
3. 权限、凭据轮换、Secret / Keychain 存放位置、数据库或存储供应商变化。
4. 发现旧报告与现状不一致，包括已有配置或账号变更未被记录。

每次更新至少说明：平台用途、环境、公开登录入口、认证方式、凭据存放机制、核验日期、证据来源、待核验项和接管 / 回滚影响。个人身份或秘密发生变化时，只记录“已核实变更”及接管位置，不把实际值写入 Git。

没有相关变化的 PR，在 PR 检查清单写明不适用原因。历史副本无需逐个改写，所有当前开发入口必须指向本报告。尚未验证的信息保留明确状态，不用猜测补齐。

## 接管顺序

1. 先读本报告、[项目运维指南](../PROJECT_OPERATIONS_GUIDE.zh-CN.md)及[正式 Handoff](../PROJECT_HANDOFF.zh-CN.md)。
2. 复用项目所有者授权的现有浏览器或 CLI 会话，确认实际环境与服务；控制台登录不能通过数据库用户名推断。
3. 需要登录或额外权限时说明缺失的具体条件；不为诊断而新建账号、重置凭据或扩大访问范围。
4. 修改前准备可回滚的具体方案；修改后核验实际连接 / 登录 / 服务状态，并同步本报告的最终事实。

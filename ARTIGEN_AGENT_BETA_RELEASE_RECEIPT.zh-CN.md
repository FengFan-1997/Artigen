# Artigen 浏览器 Agent Production Beta 最终发布回执

> 历史回执免责声明（2026-09-02）：本文描述的是 2026-08-07 的旧版 Production
> Beta，旧的 SiliconFlow/Qwen、迁移与 deployment 信息已被后续变更取代，仅供审计留档。
> 当前模型、开关与发布状态以 `PROJECT_HANDOFF.zh-CN.md` 和 `HANDOFF.local.md` 为准。

生成时间：2026-08-07（Asia/Shanghai）

发布等级：**Production Beta / owner-only**

## 2026-08-07 历史快照（不代表当前线上状态）

Artigen 浏览器 Agent 当时已完成代码合并、生产部署和真实端到端验收。该段描述的是旧版
SiliconFlow/Qwen 文本链路；当前非生图文本已切换为 Cloudflare GPT-OSS，图片仍为 Kolors，
且统一候选尚未发布。

这不是 24×7 商业 SLA。Render 仍是 Free 实例，实际 Worker 在当前 Mac 上；Render 休眠、Mac 关机/合盖/退出登录或 Docker Desktop 停止时，新任务会排队。

## 最终发布凭据

| 项目 | 最终值 |
|---|---|
| GitHub `main` 提交 | `529b73fffcd2f06323ccd373168a5e009f312b5a` |
| 发布 PR | `https://github.com/FengFan-1997/Artigen/pull/14` |
| Render Service | `srv-d9cr73r7uimc73etc4j0` |
| Render Deployment | `dep-d9qsuam417fc7383uj70` |
| Render 状态 | `live` |
| GitHub 最终流水线 | `https://github.com/FengFan-1997/Artigen/actions/runs/31178240786` |
| GitHub Release gate | `success` |
| Vercel `artigen-fengfan` | `success` |

## 线上入口

| 用途 | 地址 |
|---|---|
| 站点 | `https://artigen-fengfan.vercel.app/artigen` |
| Agent 工作台 | `https://artigen-fengfan.vercel.app/artigen/agent` |
| 登录页 | `https://artigen-fengfan.vercel.app/login` |
| Render 后端 | `https://artigen-app-fengfan.onrender.com` |
| 版本 | `https://artigen-app-fengfan.onrender.com/api/meta` |
| 健康检查 | `https://artigen-app-fengfan.onrender.com/readyz` |
| Agent 状态 | `https://artigen-app-fengfan.onrender.com/api/agent/status` |

发布后复核结果：

```text
appEnv=production
gitSha=529b73fffcd2f06323ccd373168a5e009f312b5a
database.migration=020_agent_secure_browser_relay
storage.driver=s3
storage.shared=true
model=Qwen/Qwen3-8B
modelProvider=siliconflow
sandboxMode=local
browserMode=full-approval-v1
egressPolicy=restricted-v1
workerOnline=true
browserReady=true
egressVerified=true
desktopRelayReady=true
browserPublicEnabled=true
accessMode=owner-only-v1
availabilityNote=ready
queueDepth=0
```

`queueDepth=0` 只能说明当前没有等待中的 Agent 任务，不能据此判断网站有没有普通访客。访客统计应查看已配置的行为分析平台。

## Owner 登录

- Production Beta owner 邮箱：`876458930@qq.com`
- 登录方式：打开登录页，完成 Turnstile 验证后获取 QQ 邮箱一次性验证码。
- 当前账号是邮箱身份，没有可在文档中提供的站内明文密码。
- 密码、邮箱验证码、API Key 和恢复码不要发送到聊天，也不要写入 Markdown。
- 其他账号当前会被 `owner-only-v1` 拒绝；这是预期的 Beta 权限策略。

如果现有登录会话过期，只需重新走邮箱验证码流程。发送验证码接口已经启用，并要求真实 Turnstile 令牌；验收没有绕过验证码，也没有代替用户读取邮箱。

## Agent 运行方式

- 云端模型：硅基流动 `Qwen/Qwen3-8B`；没有下载本地 Qwen 模型。
- 本地沙箱镜像：`artigen/cua-xfce:0.1.15-tools-v2`，要求 `toolchain=v2`。
- Mac Worker：LaunchAgent `com.artigen.agent-worker-production`，单任务串行。
- Worker 日志权限：`0600`。
- 生产凭据：保存在 macOS Keychain 服务 `artigen-agent-production-worker`；不提交 Git，不写入本文。
- Render 与 Worker 通过临时 WebSocket 中继提供 noVNC 接管；VNC 只监听 Mac 回环地址。

## 真实生产验收

最终生产烟测完成：

```text
浏览网页
→ 人工接管登录
→ 加密保存单站会话
→ 恢复任务
→ 生成 Markdown 和 PDF
→ 独立校验摘要
→ 上传共享 S3
→ 撤销并擦除会话
→ succeeded
```

成功任务：

- 登录捕获：`0bfa9eef-a989-4400-9fcd-0bcb043c211d`
- 会话恢复：`20317cd5-77e8-40ca-ac74-ad845385bf96`
- 交付物：`artigen-login-session.md/.pdf`、`artigen-login-restore.md/.pdf`，共 4 个，全部通过摘要校验和 S3 下载验证。
- 精确测试密码没有出现在生产事件、步骤、审批、交付物、模型检查点或 Worker 日志中。

## 测试结果

- 后端完整测试：343 通过、38 跳过、0 失败，共 381。
- 前端单元测试：211/211。
- Agent/RFB/PostgreSQL 专项：68/68。
- Agent 质量集：40/40。
- 本地 Playwright 六项目矩阵：405 通过、3 条条件跳过、0 失败。
- 发布 PR 和最终 `main` 流水线：核心门、全部浏览器分片、Release gate 全部成功。
- CI 曾出现一次 WebKit 进程 `Page crashed`；同一 SHA 的正式 PR 分片成功，新 Runner 单独复跑也成功，确认是 Runner 资源抖动，不是业务断言回归。

## 备份与回滚

生产迁移前备份：

```text
/Users/fengfan/Library/Application Support/Artigen/backups/artigen-neon-2026-08-07T10-24-11-527Z.dump
SHA-256=e6383e2922c88ebbee8ea6bae08358774ffcb94cee8bf3b38552c4fd854e5baf
```

Render 旧版本在新部署健康前继续服务。回滚代码时选择已知健康提交重新部署；数据库回滚前必须先停止 Worker 和写流量，并优先做向前修复，不能盲目反向执行生产迁移。

## 已知限制

- Render Free 服务可能休眠、重启且不适合承诺正式生产 SLA：`https://render.com/docs/free`。
- Render 公网 WebSocket 可用于中继，但断线后必须重新申请一次性票据：`https://render.com/docs/websocket`。
- Mac Worker 必须接通电源、保持用户登录并运行 Docker Desktop。
- 当前只开放给 owner；扩大用户前应观察队列、失败率、对象存储成本和安全审计。

## 详细文档

- 完整交付说明：[`ARTIGEN_AGENT_BETA_DELIVERY.zh-CN.md`](./ARTIGEN_AGENT_BETA_DELIVERY.zh-CN.md)
- 运维手册：[`AGENT_OPERATIONS_RUNBOOK.zh-CN.md`](./AGENT_OPERATIONS_RUNBOOK.zh-CN.md)
- 浏览器安全与威胁模型：[`AGENT_BROWSER_SECURITY_AND_BETA_RELEASE.zh-CN.md`](./AGENT_BROWSER_SECURITY_AND_BETA_RELEASE.zh-CN.md)
- 基础设施与账号审计：[`ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md`](./ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md)

本回执只记录账号标识、登录入口和密钥存放位置，不包含任何密码、API Key、数据库连接串或验证码。

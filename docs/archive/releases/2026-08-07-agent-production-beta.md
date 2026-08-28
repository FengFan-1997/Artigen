# 2026-08-07 浏览器 Agent Production Beta

> **历史快照，不得用于当前部署或运维。** 本文是四份旧交付、发布回执、全量 Handoff 与基础设施账号审计的脱敏合并摘要。

## 当时的发布结论

2026-08-07，Artigen 首次把浏览器 Agent 作为受限 Production Beta 接入正式环境。该阶段使用硅基流动 `Qwen/Qwen3-8B`、本机 Docker/CUA Worker、PostgreSQL 持久队列、共享 S3、受限 HTTPS 出口和一次性远程桌面票据。

当时确认的能力包括：

- files、shell 与 browser 工具；
- HTTPS 443 受限出口、DNS/IP 检查和无 `DIRECT` 回退；
- 登录敏感字段由用户远程接管，模型不读取密码、OTP 或验证码；
- Markdown/PDF 交付经过格式、病毒、来源、字节数和 SHA-256 验证；
- 任务预算冻结、成功单次结算、失败释放和幂等执行；
- 登录会话按单 Origin 加密保存、恢复和撤销；
- 任务结束后删除沙箱、代理、控制容器和临时网络。

## 当时的限制

- Render 免费实例和绑定个人 Mac 的 Worker 不能提供 24×7 SLA。
- 浏览器能力采用小范围 Beta 访问策略，并非当前的公开访问状态。
- 数据库和运行时仍处于早期迁移阶段；后续已经增加子 Agent、图片交付、Runtime V2 durability 与更严格的 Harness。
- 真实付款闭环、定时数据库备份和隔离恢复演练当时仍不完整。

## 为什么退出当前文档

原文固定了旧提交、迁移、账号入口、运行记录、部署资源和当时的钱包/订单快照。继续把它们放在根目录会与当前生产和 DEV 状态冲突，并扩大公开信息面。

当前说明请使用：

- [`PROJECT_HANDOFF.zh-CN.md`](../../../PROJECT_HANDOFF.zh-CN.md)
- [`AGENT_OPERATIONS_RUNBOOK.zh-CN.md`](../../../AGENT_OPERATIONS_RUNBOOK.zh-CN.md)
- [`AGENT_BROWSER_SECURITY_MODEL.zh-CN.md`](../../../AGENT_BROWSER_SECURITY_MODEL.zh-CN.md)
- [`PRODUCTION_RUNBOOK.zh-CN.md`](../../../PRODUCTION_RUNBOOK.zh-CN.md)

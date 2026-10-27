# Artigen 换电脑与 Worker 接手

本文面向接管者，说明如何在旧电脑退出前保留访问、在新电脑接手 DEV Worker，以及 Windows 的已知限制。运行状态以目标环境接口和平台控制台的实时结果为准；本文不包含凭据。

## 先确认哪些能力依赖电脑

- DEV 网站和 API 在 Render，DEV PostgreSQL 在 Aiven，对象存储和模型由外部服务提供；浏览器可以从 Mac 或 Windows 访问。Worker 不在线时不能据此认为需要电脑执行的 Agent 任务可用。
- DEV Agent Worker 当前运行在本机 macOS，依赖该用户登录、Docker Desktop、CUA 虚拟环境、固定镜像、网络和 DEV 专用钥匙串。电脑关机、休眠、离职后无法使用、Docker 停止或网络不可达时，必须在另一台机器接手；云端数据库中的队列不等于 Worker 正在执行。
- 生产和 DEV 的 Worker、数据库、Secret 与身份各自核对，不把本手册的 DEV 操作套用到生产。DEV 与生产曾共用 S3 桶，必须按 [DEV 手册](../DEV_ENVIRONMENT_RUNBOOK.zh-CN.md) 的现行边界处理。

## 旧电脑退出前

1. 确保项目所有者能独立登录 GitHub、Render、Aiven、邮件、Cloudflare、对象存储及其他实际使用的平台；按[账号接管报告](./INFRA_ACCOUNT_REGISTER.zh-CN.md)逐项核验所有权、MFA、恢复方式和接收方权限。不能把公司电脑或个人 Chrome 会话视为交接完成。
2. 将 DEV 专用 Worker 所需凭据通过双方认可的安全方式交接，验证新机器能读取，禁止提交仓库或放进 Handoff。至少核对 `DATABASE_URL`、`DEV_DATABASE_EXPECTED_HOST`、`PG_SSL_CA_BASE64`、`AGENT_PAYLOAD_ENCRYPTION_KEY`、`AGENT_WORKER_RELAY_SECRET`、`AGENT_WORKER_RELAY_URL`、`S3_ENDPOINT`、`S3_BUCKET`、`S3_REGION`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`SILICONFLOW_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`AGENT_CLOUDFLARE_FREE_ACCOUNT_ID` 和 `AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED`；如目标环境启用 `S3_KEY_PREFIX` 也需一致。API 和邮件中继使用的平台 Secret、DEV 门禁口令及各平台恢复信息也要由所有者分别接管。`PG_SSL_CA_BASE64` 在 Aiven 严格 TLS 配置中需要；不要用跳过证书验证替代。
3. 盘点正在运行或等待中的任务、有效租约、预算与冻结额度，以及要保留的项目、资产和备份。执行一次经过批准的备份恢复演练；不要把线上业务库当作可重置的恢复目标。记录接管责任人、验证结果和回滚路径，不记录个人身份或秘密。
4. 在新机器准备完成且旧 Worker 空闲后切换，避免同一环境重复领取任务；保留旧配置作为回滚，直至新机器完成真实验收。若旧设备已不可用，先核验心跳过期、租约和队列，再启动替代 Worker。

## 新 Mac 接手 DEV Worker

1. 安装 Git、Node.js 24、pnpm 10.33.0、Python 3、Docker Desktop，启动 Docker。用项目所有者授权的账号取得仓库，在持久目录检出 **DEV 当前部署的完整 SHA**；不要用会随临时任务清理的目录。API 的 `/api/meta.gitSha` 与 Render live deployment 都要核对。
2. 在检出目录运行 `pnpm install --frozen-lockfile`，然后执行 `python3 -m venv backend/.venv-agent`、`backend/.venv-agent/bin/python -m pip install -r backend/agent_runtime/requirements.txt` 和 `backend/.venv-agent/bin/python -m pip check`。运行 `pnpm build:cua-image` 准备仓库固定的 CUA 镜像；构建过程需要网络和足够磁盘空间，失败时不得用不明镜像代替。
3. 打开 macOS「钥匙串访问」，在登录钥匙串中为第 2 节每个所需变量创建通用密码条目：名称为 `artigen-agent-dev-worker`，账户为变量名，密码为该变量对应的值；DEV 外层访问口令使用名称 `Artigen Dev Access Password`、账户 `artigen-dev` 的独立条目。通过接管者认可的安全渠道逐项获取值，勿粘贴到聊天、终端历史或仓库。条目和读取方式以当前 `backend/scripts/run-agent-worker-macos.js` 与账号报告为准，不复用生产凭据。
4. 核对系统到 DEV PostgreSQL 的严格 TLS、对象存储、模型服务和 Render 中继的网络访问。确认旧 Worker 已停止，且没有未完成的活动 Run、有效租约或不明预算占用后，按 [Agent 运维手册](../AGENT_OPERATIONS_RUNBOOK.zh-CN.md#工作目录丢失后的恢复)先前台运行 `pnpm --filter backend start:agent-worker:dev-mac` 并核验，然后退出前台进程并安装 DEV LaunchAgent：`pnpm --filter backend install:agent-worker:dev-mac`。按安装器输出加载并按需启动，DEV 默认不会开机自动运行。
5. 检查 `/healthz`、受保护的 `/api/meta`、`/readyz` 和 `/api/agent/status`：API SHA 与 Worker checkout 相同，数据库迁移就绪，唯一 Worker 在线，model、browser、egress、desktop relay 就绪，队列和预算状态合理。以合成数据执行经批准的登录、项目、上传/回读和 Agent 文件交付，再验证下载与任务收尾。平台密钥存在、接口返回 200 或 Worker 心跳均不能代替真实链路。
6. 失败时停止新 Worker，核对活动任务和租约后恢复旧配置；不能在两个 Worker 同时执行时强行切换。更改凭据、账号、平台或存放机制时，同步账号报告和受影响手册。

安装 Docker Desktop 前核对其[许可证条件](https://docs.docker.com/subscription-billing/desktop-license/)；部分组织的商业用途需要付费订阅，个人或符合条件的小企业用途可免费使用。是否符合条件由实际使用方确认。

## Windows 使用与接手边界

- 如果已有独立在线 Worker，Windows 只作为浏览器客户端，可按相同 DEV 地址与登录流程访问；浏览器访问成功不证明 Windows 能承载 Worker。
- 现有受管启动器使用 macOS Keychain、LaunchAgent 和 macOS Docker 路径；不能直接照搬到 Windows。仓库有通用 `pnpm start:agent-worker`，但当前没有经过真实 Windows 或 WSL2 的环境隔离、进程托管、网络、沙箱和恢复验收，因此目前没有可承诺的 Windows 一键接手流程。
- 若要评估 Windows 接手，可参考微软的 [WSL 安装说明](https://learn.microsoft.com/en-us/windows/wsl/install) 安装 WSL2，并按 [Docker Desktop WSL 集成说明](https://docs.docker.com/desktop/features/wsl/)启用对应发行版，再由工程人员在隔离 DEV 中配置 Node、pnpm、Python、Docker、目标 Secret 和严格 TLS。不要将生产 Secret 放入测试环境；通用 Worker、CUA、沙箱出口、登录接管、文件交付和异常恢复都须实测通过后才能认定 Windows 可接手。
- 若离职前无法完成 Windows 实测，应准备由所有者控制的另一台 Mac 作为接手 Worker，或另行设计并验收独立托管 Worker。长期方案须确认机器持续运行、费用、运维责任、数据隔离、备份与故障恢复。

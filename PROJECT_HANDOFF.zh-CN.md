# Artigen 项目正式 Handoff

更新时间：2026-09-03（Asia/Shanghai）

文档性质：**GitHub 正式项目状态与持久事实总入口**

本文只记录已经确定并产生持久影响的产品、架构、安全、发布和运行决策。开发中的候选方案、调试过程、临时分支、逐次 Run 和下一条命令只写入被 Git 忽略的 `HANDOFF.local.md`。

## 1. 当前状态

### 1.1 生产

2026-09-03 生产发布后重新核验结果：

| 项目 | 已验证状态 |
| --- | --- |
| 生产运行提交 | `952b624e9013d9bbb6a54d9a112a584191c9a098` |
| 数据库迁移 | `026_agent_live_eval_capacity_counter` |
| 访问模式 | `authenticated-v1` |
| 存储 | PostgreSQL + 共享 S3 |
| 文字模型 | Cloudflare Workers AI `@cf/openai/gpt-oss-120b` |
| 图片模型 | `Kwai-Kolors/Kolors` |
| Agent | Worker、浏览器、受限出口、桌面中继和子 Agent 已配置并在线 |
| 运营后台 | 生产关闭 |

本次发布使用 Render 手动部署到上述不可变 SHA，并将 Mac Worker 切换到同一 SHA；Vercel 生产域名实测返回同一 SHA。部署资源的内部 ID 仅保存在受保护的本地交接记录，不写入公开项目文档。后续如 `main` 继续前进，仍必须重新核验三端，不得把合并自动等同于生产部署。

生产精确状态始终重新读取：

```bash
curl --fail --silent https://artigen-fengfan.vercel.app/api/meta
curl --fail --silent https://artigen-fengfan.vercel.app/readyz
```

### 1.2 DEV

2026-08-28 本次文档发布前，`dev` 最新的运行时改动已合并至 PR [#140](https://github.com/FengFan-1997/Artigen/pull/140)，随后 PR [#141](https://github.com/FengFan-1997/Artigen/pull/141) 仅记录仓库外旧部署连接清理；两者合并后的 required checks 均成功。PR #141 不改变业务代码、CI 或运行时配置。

分支 SHA、迁移和部署状态会持续变化，不写成可长期复制的“当前值”。每次操作前从 GitHub、`/api/meta` 和 `/readyz` 交叉核验：

```bash
git fetch origin
git rev-parse origin/dev
curl --fail --silent https://dev-artigen-app-fengfan.onrender.com/api/meta
curl --fail --silent https://dev-artigen-app-fengfan.onrender.com/readyz
```

DEV 当前边界：

- Runtime V2 代码和 durability 已进入 `dev`，但公众开关、rollout 与生产 canary 继续关闭。
- 子 Agent、图片交付、Harness V3、受限出口和桌面中继已接线。
- DEV 与生产当前非生图文本链路均使用 Cloudflare Workers AI `@cf/openai/gpt-oss-120b`；图片链路继续固定使用 `Kwai-Kolors/Kolors`。两端 readiness 均已重新核验。
- DEV 使用独立数据库和 S3 命名空间，邮件 OTP 关闭；支付只允许安全的未付款/幂等验证，不执行真实付款。
- Runtime V2、公众 rollout 与 owner canary 继续关闭；本次生产发布仅切换已验证的文本 Provider/模型环境，不代表完整 24-slot 实机矩阵或图片盲审已通过。

## 2. 产品与模型边界

Artigen 的定位是“从一句话到可验证交付的统一创作 Agent”。用户从 `/artigen/create` 描述目标，系统在以下执行路径间分流：

1. 直接回答或设计咨询；
2. 浏览器本地隐私工具；
3. Kolors 图片生成；
4. 隔离 Computer Agent；
5. Creative Project 和现有高级工作台。

稳定模型边界：

- 文字理解、路由、规划、父 Agent、子 Agent 和验证只允许 Cloudflare Workers AI `@cf/openai/gpt-oss-120b`。
- 图片输出只允许 `Kwai-Kolors/Kolors`。
- 客户端使用产品 profile，不得提交或切换内部 Provider 模型 ID。
- Runtime V2、Planner、自适应推理和项目记忆均由服务端开关控制；关闭时不能通过客户端参数绕过。

## 3. 数据、资产与计费

- PostgreSQL 是用户、会话、钱包、账本、订单、任务、Run、资产元数据和审计事件的生产写源。
- 二进制产物进入共享 S3；数据库只保存 opaque URI、所有权、MIME、字节数、SHA-256、验证和生命周期元数据。
- 收费任务必须先获得服务端报价，再原子冻结预算；成功且产物验证通过后只结算一次，失败、取消、超时或持久化失败释放冻结。
- Provider、模型和工具调用使用持久回执、租约与幂等栅栏；无法证明是否执行的 ambiguous 状态保持 fail-closed，不自动重放副作用。
- prompt、项目需求、会话断点和需要保留的敏感 payload 使用 AES-256-GCM，加密 AAD 绑定所属对象；终态和到期清理遵循对应保留策略。
- 本地工具不要求登录、不上传、不扣点；只有用户明确选择云端执行路径时才上传附件或创建收费任务。

## 4. Agent 安全与运行不变量

- 每个 Computer Agent Run 在隔离 CUA 沙箱中执行；浏览器默认不能直接访问宿主机或任意网络。
- 受限出口只允许经过验证的公开 HTTPS/WSS，拒绝私网、环回、链路本地、云元数据、IP 字面量和 DNS 重绑定。
- 表单提交、发送、发布、删除和权限变更等外部副作用需要绑定具体动作的一次性审批。
- 密码、OTP、验证码、安全警告和付款由用户远程接管；模型不得读取、填写或记录。
- 桌面票据短时、一次性、绑定用户、Run、Worker 和沙箱；前端不接触 raw VNC 地址。
- 子 Agent 深度固定为一层，只能读取授权输入并运行能力交集内的离线工具；父 Agent 独占浏览器、图片、审批、外部连接和最终交付权。
- Run 成功前必须验证计划、预算、审批、来源、文件格式、对象存储、回执和验收项；部分产物或局部成功不能冒充完整交付。

完整威胁模型见 [`AGENT_BROWSER_SECURITY_MODEL.zh-CN.md`](./AGENT_BROWSER_SECURITY_MODEL.zh-CN.md)。

## 5. Runtime V2 DEV 硬化现状

PR #130–#140 已依次把以下持久规则合入 `dev`：

- Live Harness campaign 连接池、一次性 gate、真实 slot 完整性和中断收尾；
- campaign advisory lock 断连、keepalive 与 client checkout 隔离；
- 受限出口 sidecar 对常规连接重置的容错；
- heredoc、失败 Shell、成功动作、产物来源和声明纠错的有界循环控制；
- Runtime V1/V2 验证语义分离、S3 path-style DEV 验证和 text-only 交付契约；
- 信号中断时通过正式服务事务取消活动 Run，释放 hold 与预算而不删除审计回执。

这些改动均经过各自 PR 的 required checks 后进入 `dev`。它们仍不构成生产放行证据：此前真实 campaign 在首个 candidate failure 或基础设施中断后受控停止，没有形成新的完整 24-slot V1/V2 矩阵与 12 图匿名盲审通过结果。

Runtime V2 进入生产前必须同时满足：

1. Render DEV、Vercel Preview 和不可变 Mac Worker 对齐同一候选；
2. `pnpm check`、PostgreSQL/MinIO Harness、50 项 executable quality 和 chaos 通过；
3. 新候选签发一次性 exact-SHA gate；
4. 24-slot V1/V2 campaign 完整执行，无合成占位冒充完成；
5. 图片组完成匿名盲审并达到门槛；
6. 账务、回执、队列、子 Agent、沙箱和冻结余额收尾一致；
7. required GitHub checks 与人工证据审核通过。

任一条件缺失时，公众 rollout、owner canary 和生产发布继续关闭。

## 5.1 当前未发布候选（2026-09-04）

- 分支 `codex/live-gate-stats-role-fix` 在 `origin/dev` `9e5cbfc...` 上新增迁移 `027_agent_live_eval_capacity_aggregate`，以 `pg_stat_database.numbackends` 提供仅聚合、无会话内容的容量探针，兼容 Aiven 受限运行角色。
- 该迁移和对应代码尚未 push、创建 PR、合并或部署；生产与 DEV 当前仍以迁移 `026_agent_live_eval_capacity_counter` 运行。新 exact-SHA gate、24-slot 实机矩阵和图片盲审尚未重新执行。
- 原有 `026` 跨角色统计函数及其 `pg_read_all_stats` 安全回归保留，不能通过修改权限或删除审计记录绕过门禁。

## 6. 发布与分支规则

常规代码流：

```text
feature/fix branch → PR to dev → DEV smoke → dev PR to main → 人工生产发布
```

仅用于修正 GitHub 默认分支文档或紧急生产问题的 hotfix：

```text
latest main → hotfix/* → PR to main → main → dev 同步 PR
```

硬规则：

- 不直接 push `dev` 或 `main`，不使用管理员绕过 required checks。
- 不执行 `dev → main` 来发布纯文档 hotfix，避免携带未发布开发提交。
- PR 必须明确“已更新正式 Handoff”或填写具体不适用原因。
- `main` 合并、Vercel 构建、Render 部署和 Mac Worker 切换是独立状态；没有实时证据不能写成已上线。
- Cloudflare 等仓库外非 required 状态必须如实记录，但不能冒充 Artigen Release gate。

## 7. 重大里程碑

| 日期 | 里程碑 | 持久结论 |
| --- | --- | --- |
| 2026-08-07 | 浏览器 Agent Production Beta | 建立 CUA、受限出口、接管、S3 交付和计费安全基线 |
| 2026-08-17 | 子 Agent 与验证交付 | 父子权限分离、来源验证和多格式交付进入生产基线 |
| 2026-08-20 | 统一 Agent 工作台生产发布 | Create、Agent、Run Detail 共享三栏工作台和 Composer |
| 2026-08-21 | Runtime V2 开始在 DEV 硬化 | V2 保持关闭，必须通过真实 campaign 才能讨论发布 |
| 2026-08-27 | 双语图文 README | GitHub 默认入口改为中文产品首页，并提供完整英文版 |
| 2026-08-28 | 旧部署连接清理 | 断开已弃用的 Workers Builds、旧 Vercel/Railway source 和 legacy GitHub Pages；保留正式发布链路与历史记录 |
| 2026-08-28 | 文档治理收口 | 现行文档、脱敏归档、链接/隐私检查和 PR Handoff 门禁统一 |

## 8. 文档治理

现行文档总入口是 [`docs/README.md`](./docs/README.md)。正式文档必须描述稳定行为或带日期的已验证事实，不保存：

- 临时候选、逐次调试、Run UUID 或本地工作树路径；
- 真实邮箱、用户标识、余额、订单、平台资源 ID或秘密值；
- 会因下一次提交立即失效的“当前 main/dev SHA”；
- 已被更晚证据替代的测试数字和部署流水。

信息冲突时按以下优先级处理：

1. 当前线上 `/api/meta`、`/readyz`、状态接口和平台 deployment；
2. GitHub 分支、PR 与 required checks；
3. 当前代码、迁移和环境示例；
4. 本文与现行专题文档；
5. `HANDOFF.local.md`；
6. 历史归档、聊天和旧分支。

发现冲突时必须在同一修复任务中更正文档，不能只修改更新时间。

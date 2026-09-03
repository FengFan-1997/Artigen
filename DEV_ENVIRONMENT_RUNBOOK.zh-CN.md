# Artigen DEV 测试环境

DEV 是受保护的线上集成环境，不是生产，不承载正式用户数据。动态提交、迁移和能力状态必须从实时接口读取。

## 1. 地址与边界

- 服务：`dev-artigen-app-fengfan`
- 地址：<https://dev-artigen-app-fengfan.onrender.com>
- 部署分支：`dev`
- 数据库：独立 DEV PostgreSQL
- 资产：独立 DEV S3 命名空间
- 访问：HTTP Basic 首次认证后签发短时安全 Cookie

DEV 口令只存 Render Secret 和本机安全存储，不写入 Git、文档、命令历史或截图。

## 2. 安全配置

DEV 当前用于真实集成 smoke，因此部分能力可以开启，但必须满足：

- 只使用合成用户、合成输入和 DEV 钱包；
- 邮件 OTP 关闭，不调用生产邮件中继；
- 支付只验证套餐、未付款订单、跳转、pending、幂等和钱包不入账，禁止真实付款；
- Qwen/Kolors 可以用于获批的真实 Provider smoke，但不得冒充生产结果；
- 数据库、S3、Cookie、加密密钥和 Worker 身份与生产隔离；
- 页面显式显示 DEV 标记，外层访问门禁始终开启。

Render Dashboard 的实际变量可能覆盖 `render.dev.yaml` 的安全默认值。变更变量后必须重新部署，并以 `/readyz` 而不是模板推断状态。

## 3. 本机开发

```bash
pnpm install --frozen-lockfile
pnpm db:local:setup
pnpm dev
```

```bash
curl --fail --silent http://localhost:8080/healthz
curl --fail --silent http://localhost:8080/readyz
```

本机数据库与 DEV/生产都隔离。除专门的只读审计外，不把云端连接串复制进普通本机开发环境。

## 4. 云端只读核验

浅健康检查无需 DEV 口令：

```bash
curl --fail --silent \
  https://dev-artigen-app-fengfan.onrender.com/healthz
```

受保护接口使用从安全存储读取的短时变量：

```bash
curl --fail --silent --user '<dev-user>:<dev-password>' \
  https://dev-artigen-app-fengfan.onrender.com/api/meta

curl --fail --silent --user '<dev-user>:<dev-password>' \
  https://dev-artigen-app-fengfan.onrender.com/readyz
```

期望：

- `appEnv=dev`；
- `gitSha` 等于本次 `dev` 目标提交；
- `readyz.ok=true`；
- database、storage、payload、provider 和受影响能力符合本次配置；
- 当前 migration 与目标代码的 pending migration 集合一致；
- 关闭的 auth/mail/Turnstile 能力明确 skipped，而不是伪造通过。

## 5. 当前 Agent DEV 姿态

- Agent 访问模式为已登录用户模式。
- files、shell、browser、图片生成和子 Agent 可按 readiness 暴露。
- 子 Agent 使用独立 Qwen3 上下文，权限仍受父 Run、预算和沙箱交集约束。
- Runtime V2 durability Schema 已存在，但公众 Runtime V2、rollout 与生产 canary 保持关闭。
- Worker、browser、egress、desktop relay、subagents 和 queue 状态必须从 `/api/agent/status` 读取；环境变量存在不等于 Worker ready。

## 6. 发布到 DEV

```bash
git fetch --prune origin
git switch -c feat/short-name origin/dev
git push -u origin feat/short-name
gh pr create --base dev --head feat/short-name
```

required checks 通过后合并。等待 Render 自动部署，再确认 `/api/meta.gitSha` 对齐。未对齐时不要启动 smoke、Worker 或 Provider campaign。

## 7. smoke 矩阵

按影响范围选择：

### 通用

- `/artigen`、`/artigen/create`、`/artigen/agent` 和受影响页面；
- `/api/meta`、`/readyz`；
- 登录/权限、控制台错误、移动端溢出；
- 数据库和 S3 写入是否只落 DEV。

### 图片与工具

- `GET /api/generation/models` capability；
- 标准图 0 参考、商品图 1 参考，额外参考在 Provider 前拒绝；
- 报价、hold、单次结算、失败退款和资产回读；
- 本地工具不上传、不扣点。

### Agent

- `GET /api/agent/status`；
- files/shell、受限浏览器、桌面接管、图片与子 Agent；
- Markdown/PDF、XLSX、PPTX、网站或图片按任务验证；
- 取消、恢复、租约、回执、预算和沙箱清理；
- 最终 active Run、hold、reservation、queue、subagent 和冻结余额一致。

仓库提供的 DEV smoke/评测入口以 `backend/package.json` 和根 `package.json` 为准，包括 Agent、relay、login、image、subagent、Design Conversation 与 live-eval 工具。没有凭据或授权时使用 fixture/mock，不把 skipped 写成真实通过。

## 8. Runtime V2 发布前证据

Runtime V2 候选必须额外具备：

1. 同一不可变 SHA 的 Render、Vercel Preview 与 Mac Worker；
2. `pnpm check`；
3. PostgreSQL 16 + 固定 MinIO Harness；
4. 50/50 executable quality；
5. chaos；
6. 一次性 exact-SHA live gate；
7. 完整 24-slot V1/V2 campaign；
8. 图片匿名盲审；
9. 账务、回执、队列、沙箱和冻结余额收尾。

局部 report、合成占位、旧 SHA 报告或中断 campaign 不能通过放行门槛。

## 9. 数据与清理

- 测试数据使用明确前缀或合成身份；合成邮箱只使用 `.invalid` 域。
- 任务清理走正式取消、结算、过期和 GC 服务，不直接删账本或钱包行。
- ambiguous receipt 是审计证据；只要没有活动 hold/reservation 就不为制造“全零”而删除。
- 临时 Docker/MinIO 资源按精确身份清理，不使用宽泛递归命令。

## 10. DEV 证据记录

记录到 PR/Handoff 的只有：

- 目标 commit 与部署对齐结论；
- `/api/meta`、`/readyz` 和受影响状态；
- 实际执行的 smoke、结果和未验证项；
- 风险、回滚与是否产生真实 Provider 成本。

不记录口令、真实账号、Run UUID、部署资源 ID、余额、订单或本机绝对路径。

完整流程见 [`PROJECT_OPERATIONS_GUIDE.zh-CN.md`](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

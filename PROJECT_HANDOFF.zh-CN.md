# Artigen 项目正式 Handoff

更新时间：2026-08-12（Asia/Shanghai）

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

截至 2026-08-12 的已验证生产基线：

| 项目 | 正式状态 |
| --- | --- |
| GitHub 仓库 | `FengFan-1997/Artigen` |
| 生产运行时代码 | `main`，SHA `49618cf603a1f4f18b5ec4b454fef489dc4c7a39` |
| 生产前端 | Vercel `artigen-fengfan`，deployment `dpl_BMb4TusD75y2mmQ3EH4L9zQTUE3C`，`READY` |
| 生产后端 | Render `artigen-app-fengfan`，Service `srv-d9cr73r7uimc73etc4j0` |
| 生产部署 | Render deployment `dep-d9u0ntqjobas73e0uho0`，`live` |
| 生产数据库 | Neon PostgreSQL `neondb` |
| DEV 数据库 | Neon PostgreSQL `dev_artigen` |
| 对象存储 | 私有共享 S3 桶 `artigen-assets` |
| 数据库迁移 | `020_agent_secure_browser_relay` |
| GitHub 发布流水线 | run `31567870806`，Release gate `success` |
| 生产功能开关 | 付费、支付、AI Design、Workshop、Task Worker 与 Agent 生图已开放 |

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
| Agent 图片能力 | `Kwai-Kolors/Kolors` 统一承担文生图和单参考图图生图；DEV 与生产均已真实验证 |
| Agent 图片计价 | 文生图 8 点；单参考图 12 点；任务总额仍受报价与 `maxCredits` 约束 |
| 严格模型白名单 | `Qwen/Qwen3-8B` 负责文字理解/拆解/工具决策，`Kwai-Kolors/Kolors` 负责全部图片；DEV 与生产均已真实验证 |
| 图片交付 | `IMAGE`，PNG/JPEG/WebP；允许独立满足任务完成条件 |

上表的双模型边界已在第 1 节列出的不可变运行 SHA 上发布，并由生产文生图与单参考图 Run 复核实际模型、点数、S3、SHA-256 和交付验证状态。

已验证运行状态：

```text
workerOnline=true
browserReady=true
egressVerified=true
desktopRelayReady=true
browserPublicEnabled=true
imageGenerationPublicEnabled=true
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
→ 或生成、验证独立 IMAGE 图片设计稿
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

### 5.3 Agent 生图与付费主业务恢复（历史上线证据）

Agent 生图、独立 `IMAGE` 交付、主业务付费工具、任务 Worker 和爱发电下单链路已完成 DEV、Release gate 和真实生产验收。运行时代码最终经 PR [#18](https://github.com/FengFan-1997/Artigen/pull/18) 至 [#25](https://github.com/FengFan-1997/Artigen/pull/25) 逐步合入，生产运行 SHA 为 `ca75dce39ef5eebd27154029ef19ad1cc25b5758`。Render 与 Vercel 使用该不可变代码发布，生产 Mac Worker 也从同一 SHA 重新安装并启动。

正式生产配置：

- Agent 继续为 `owner-only-v1`；主业务付费工具向所有登录用户开放；
- `PAID_FEATURES_ENABLED=true`、`PAYMENTS_ENABLED=true`、`AI_DESIGN_TASK_V2_ENABLED=true`、`AI_DESIGN_TASK_V2_ROLLOUT_PERCENT=100`、`WORKSHOP_AI_TASK_V2_ENABLED=true`、`TASK_WORKER_ENABLED=1`；
- `AGENT_PUBLIC_CAPABILITIES=files,shell,browser,generate_images`，`imageGenerationPublicEnabled=true`；
- 当时纯文生图与参考图曾使用不同图片模型；2026-08-12 起两者统一由 Kolors 执行，参考图上限收紧为 1 张，历史 Run 继续作为结算与持久化证据；
- `render.yaml` 仍保留安全关闭默认值，生产值由 Render 环境覆盖；
- 定价、冻结、结算、退款、幂等和 S3 边界保持服务端控制；没有新增数据库迁移。

DEV 真实依赖验收：

- 七个付费 executor 全部 success；标准文生图、商品参考生成与其他五个既有操作均完成 S3、尺寸、SHA 和单次结算验证；
- Agent 文生图 Run `cf2af670-074e-4ab4-b4d6-32d0ac478e30`：图片工具 8 点，总计 13 点，1024×1024 PNG，验证 passed；
- Agent 参考图 Run `30273e85-8445-4baf-9658-601ac6579246`：图片工具 12 点，总计 19 点，960×1200 PNG，验证 passed。

生产真实验收：

- 该次验收时两个 profile 均为 available；严格模型白名单发布后仍保持 `standard-v1.available=true`、`product-reference-v1.available=true`，后者 `maxReferences=1`；
- 七个主业务 executor 全部 success 且各自只结算一次：视觉方向 `4ad2e104-2ffe-4f36-a0e1-e049123a78a9`、标准文生图 `f9ce713d-5150-4b9d-9813-d902a42afbd8`、商品参考 `51c89f88-1d6b-4f77-868a-566411d7ee98`、老照片 `9ad73581-8961-4651-8473-d2a4ef36a75b`、证件照 `f46e3202-82b3-4a12-a053-7b7af937dd51`、背景场景 `baa8e32b-ec30-468e-a8a2-b43cfeb5c98b`、配料整理 `863a21e3-05e0-4b17-ab64-16b35d3f4168`；合计 100 点；
- 未支付爱发电订单 `c10996c8-8e20-4c2a-ab4e-a07d0ce84ca4` 已取得跳转链接，保持 `pending`，钱包未入账，幂等重放没有重复建单；没有执行真实付款；
- Agent 文生图 Run `b277a1d1-1195-4462-8828-89314600878c`：图片工具 8 点，总结算 12 点，1024×1024 PNG，S3 与 SHA-256 验证 passed；
- Agent 参考图 Run `eaae124b-1064-44e2-b8e4-f7b46a0b39a4`：图片工具 12 点，总结算 18 点，960×1200 PNG，S3 与 SHA-256 验证 passed；
- 两个生产 Agent Run 均只结算一次，结束后 Worker online、浏览器/出口/桌面中继 ready、queueDepth=0。

最终验证：`pnpm check` 通过；Playwright 411 通过、3 条条件跳过；后端 355 通过、39 条条件跳过；Agent/CUA 定向测试 59/59 通过；PostgreSQL 支付集成测试 7/7 通过。生产发布后再次核验 Render 与 Vercel `/api/meta` 均返回运行 SHA `ca75dce39ef5eebd27154029ef19ad1cc25b5758`。

### 5.4 严格模型白名单（2026-08-12）

- 运行时只允许 `Qwen/Qwen3-8B` 与 `Kwai-Kolors/Kolors`：前者负责所有文本理解、任务拆解、提示词与工具决策，后者负责所有图片输出，包括文生图、商品参考、老照片、职业形象和 AI 背景。
- SiliconFlow 官方 Kolors 契约支持通用 `image` 字段，但额外的 `image2`、`image3` 属于其他编辑模型。因此 Agent 和主业务最多接受 1 张参考图，2 张及以上在供应商派发前返回 `REFERENCE_IMAGES_NOT_SUPPORTED`。
- `standard-v1.maxReferences=0`，`product-reference-v1.maxReferences=1`；两者运行时内部图片模型均固定为 Kolors。Agent `generate_image.references.maxItems=1`，参考路径仍必须精确命中本次 Run 的已扫描输入。
- 老照片、职业形象、AI 场景背景继续使用单张输入图并统一调用 Kolors；四方向分析、配料原文整理和 Agent 编排统一调用 Qwen3-8B。
- 不新增数据库迁移；历史 SKU 与 profile ID 保留。任何客户端模型参数都不能改变服务端双模型白名单。
- 运行时代码经 PR [#28](https://github.com/FengFan-1997/Artigen/pull/28) 合入 `dev`；模型证据与可重复 DEV smoke 经 PR [#29](https://github.com/FengFan-1997/Artigen/pull/29) 合入；图片交付物禁止编造未观察来源的修复经 PR [#30](https://github.com/FengFan-1997/Artigen/pull/30) 合入。当前已验证 DEV SHA 为 `f42152eacd8bb73522409ccb8c3550349b140f86`，Render deployment `dep-d9u0768ae00c73bo0rd0` 为 `live`。
- DEV 文生图 Run `f4c76b79-acde-412b-901d-2be134c63e12` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，0 张参考图，图片调用 8 点、总计 12 点；PNG 1024×1024、1838340 bytes、SHA-256 `80dc3ae7ff3904fe337f53ccf773a4af55edf42e62849c2d60a2a29c76a2d417`，S3 与 verification passed。
- DEV 单参考图 Run `3d849ca5-ec6c-4ba9-8380-ee86240d65e8` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，1 张 `product` 参考图，图片调用 12 点、总计 19 点；PNG 960×1200、1575449 bytes、SHA-256 `623bef6bc3927a59848997d011b685cbd30f1e6e3b0e0d580b92e7ee9ab7db02`，S3 与 verification passed。
- 首次 DEV 文生图 Run `ef16b5fd-2022-49c3-bd68-eb595f81510d` 正确使用 Qwen3 与 Kolors，但 Qwen 在交付声明中编造了未观察来源，最终以 `AGENT_ARTIFACT_SOURCE_NOT_OBSERVED` 失败；图片调用 8 点只结算一次，其余冻结释放。PR #30 将“无实际观察 URL 时 sources 必须为空”固化到系统指令、工具 schema 说明和 smoke 目标，随后两条 Run 均通过。
- 两张成功图片已下载到被 Git 忽略的 `.artifacts/dev-two-model-image-smoke-2026-08-12T05-27-39-597Z/` 并人工查看；无空图、损坏或明显裁切问题。该次单参考图使用合成素材，只证明单图输入、Kolors 路由、角色、持久化和结算，不把真实商品身份保持质量作为本轮通过条件。
- 上述 smoke 结束后 DEV Worker online，浏览器、受限出口和桌面中继 ready，`queueDepth=0`；活动 Agent Run、工具任务和 held budget 均经数据库复核为 0。
- Release PR [#32](https://github.com/FengFan-1997/Artigen/pull/32) 的分支策略、Core、八组桌面/移动 E2E 与 Release gate 全绿后合入 `main`；不可变生产运行 SHA 为 `49618cf603a1f4f18b5ec4b454fef489dc4c7a39`。
- Render deployment `dep-d9u0ntqjobas73e0uho0` 为 `live`，Vercel production deployment `dpl_BMb4TusD75y2mmQ3EH4L9zQTUE3C` 为 `READY` 并 alias 到 `artigen-fengfan.vercel.app`；两者与 `/api/meta` 均对应上述 SHA。生产 `/readyz` 为 `ok=true`，`standard-v1.maxReferences=0`、`product-reference-v1.maxReferences=1` 且两者均 `available=true`。
- 生产 Mac Worker 已从同一 SHA 重新安装并启动；最终 `workerOnline=true`、`browserReady=true`、`egressVerified=true`、`desktopRelayReady=true`、`imageGenerationPublicEnabled=true`、`queueDepth=0`。
- 生产文生图 Run `47fd3b28-459e-4e25-97f3-301b363bc097` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，0 张参考图，图片调用 8 点、总计 14 点；PNG 1024×1024、1927956 bytes、SHA-256 `dd92ed33b1a52deeec9c08bfa2aa755720305c1896aaf582bae925313bf8ee85`，S3 与 verification passed。
- 生产单参考图 Run `e55352bf-30cd-49b3-b1df-da1c136608f1` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，1 张 `product` 参考图，图片调用 12 点、总计 17 点；PNG 960×1200、1665333 bytes、SHA-256 `ef52822da46bb0071fa4b97b3acb09f0faf70dcfea998dc3bc8bb33661efb1de`，S3 与 verification passed。
- 两张生产产物保存在被 Git 忽略的 `.artifacts/production-two-model-image-smoke-2026-08-12T06-09-26-477Z/`，已人工查看且无空图、损坏或明显裁切。参考输入为合成抽象图，本次只把它作为单图输入、Kolors 路由、角色、持久化与结算证据，不把真实商品身份保持质量列为通过项。
- 生产 smoke 后数据库再次确认活动 Agent Run、活动工具任务、held Agent budget 与 held tool credit 均为 0。源码硬审计未发现 `Qwen/Qwen-Image-Edit-2509`、Gemini 或其他第三模型的生产引用；全部运行时模型字面量仅保留 Qwen3 与 Kolors。

### 5.5 对话式设计 Agent 主入口（生产已发布）

2026-08-12 从 `origin/dev` SHA `ccff8a94450d972bac19d26ec26d056c9e6341c3` 建立 `codex/design-conversation-entry`，实现统一设计入口 `/artigen/create`。运行时代码与 DEV 修复经 PR [#35](https://github.com/FengFan-1997/Artigen/pull/35)、[#36](https://github.com/FengFan-1997/Artigen/pull/36)、[#37](https://github.com/FengFan-1997/Artigen/pull/37) 合入 `dev`；首轮 DEV 验收 SHA 为 `918ba05c23a7adc1f3140ea03c9b8e1e31b177b8`，最终修复、发布和实时生产证据见本节末尾。

持久架构与接口变更：

- 新增迁移 `021_design_conversations`，分别保存 30 天过期的加密会话与消息、执行引用、附件、游标事件、持久化规划队列和会话授权；消息使用实体、行与角色绑定的 AES-256-GCM，不复用仅适用于 Agent 运行载荷的 `agent_run_payloads`。
- 新增 `/api/design-assistant/status` 与 `/api/design-conversations` 会话、消息、附件、执行、预算、取消、游标 SSE 和授权接口；每个执行只能关联一个 `toolTaskId` 或 `agentRunId`，跨用户读取统一返回资源不存在。
- 服务端规划模型硬锁为 `Qwen/Qwen3-8B`，所有图片工作流硬锁为 `Kwai-Kolors/Kolors`。路由只允许 `reply | local_tool | tool_task | agent_run` 及服务端工具目录中的合法操作；最多一轮、两项关键澄清。
- 文生图和单参考图进入现有 AI Design/Kolors 工作流；老照片、背景、证件照和配料整理进入对应专项工作流；图片压缩、PDF 转换等本地任务通过五分钟、单次使用的浏览器内 handoff 打开准确工具；调研、浏览器、Shell 和多格式交付进入 Computer Agent。
- 附件默认只保留在浏览器，规划确定云端执行后才上传。Kolors 路径只选择第一张兼容 PNG/JPEG/WebP，其余文件保持本地；本地工具不会静默上传。
- 自动执行默认最高 50 点，先取得服务端真实报价再创建；超预算或余额不足不创建、不冻结。提高预算只影响当前执行，SSE 预算更新只刷新状态，仍需用户再次点击启动。
- Agent 新增 `authenticated-v1` 访问模式，允许全部已登录且状态正常的账户；继续保留单用户活动任务限制、全局队列、限流和服务端权限校验。Mac Worker 目标并发为 2，但 CPU、内存、浏览器出口或桌面中继不满足条件时自动回退到 1。
- 第三方写操作授权精确绑定会话、HTTPS origin 和动作类型，30 分钟闲置失效并可撤销；当前动作必须先通过一次性审批，之后才能保存持续授权。密码、OTP、验证码、支付、安全绕过和受监管决定不能被会话授权覆盖。
- 主导航“创作”和营销首页创作 CTA 指向 `/artigen/create`；游客发送时进入登录，成功后自动续发草稿。现有 `/artigen/ai` 和 `/artigen/agent` 继续作为高级工作台。
- `render.yaml` 与示例环境中的对话入口、规划 Worker 默认保持关闭；DEV 和生产只能在完成迁移、真实依赖 smoke 和发布门禁后通过平台环境显式开启。

本地验证已覆盖消息加密、跨用户隔离、路由分类、模型硬限制、澄清上限、工具白名单、单参考图上传边界、50 点预算、授权范围、事件清理、Worker 并发回退、登录续发、桌面/移动布局、预算 SSE、失败恢复、焦点管理和无障碍状态。PostgreSQL 迁移集成测试已在本机开发库通过；独立实现与视觉复审最终为 PASS。完整 `pnpm check` 通过，其中 Playwright 为 441 passed / 3 skipped / 0 failed；PR #36 与 #37 的 GitHub Core、全部浏览器分片及 Release gate 均通过。两个不属于必需门禁的 Cloudflare Workers 外部构建仍无注解失败，本次未修改 Cloudflare 服务。

DEV 真实依赖与部署验收（2026-08-13）：

- Render DEV deployment `dep-d9uq4j0ae00c738ktqdg` 为 `live`，`/api/meta.gitSha` 精确等于 `918ba05c23a7adc1f3140ea03c9b8e1e31b177b8`；`/readyz` 为 `ok=true`，数据库迁移为 `021_design_conversations`，共享 S3、对话规划 Worker、Agent Worker、浏览器、受限出口和桌面中继 ready。
- `/api/design-assistant/status` 显示入口与规划 Worker 开启、自动上限 50 点、保留 30 天、授权闲置 30 分钟；`/api/agent/status` 为 `accessMode=authenticated-v1`、Worker online、queueDepth=0；`/api/generation/models` 显示标准文生图与单参考图均 available，最大参考图分别为 0/1。
- 跨进程 smoke 暴露并修复了 Render DEV 与 Mac DEV Worker 的 Agent payload key 漂移，以及 DEV Worker 缺少独立 task payload key。密钥通过 macOS Keychain 与 Render Secret 安全同步，未写入仓库或交接文档；生产 Secret 和生产 Worker 未触碰。
- Mac DEV Worker 目标并发 2，但本机可用内存未达到安全门槛，按设计自动回退并发 1；真实双用户提交观察到一条 active、一条 queued，第一条结束后第二条取得租约，未阻断排队。
- 对话快速生图 execution `8b6194ca-31e6-4e1e-a334-77db56b856e8` / task `3276901b-ff7b-45b4-9290-c43072e40c4f` succeeded：规划模型 `Qwen/Qwen3-8B`，图片模型 `Kwai-Kolors/Kolors`，标准文生图、10 点且只结算一次；PNG 1024×1024、1769719 bytes、SHA-256 `b2a297c4d02a3e9375235851497c6ba6977239de35d25dba044bdeb9aadb8aa2`，共享 S3 验证通过。
- 双用户 Computer Agent Run `9d3c3b4b-0ec9-486f-9828-f5d8d900581a` 与 `91a130aa-f7eb-4e2b-ae86-1943d4cc3207` 均 succeeded，模型均为 `Qwen/Qwen3-8B`，各结算 6 点。每条 Run 都交付一份 Markdown source 与一份 PDF，四个产物均 `verificationStatus=passed`、S3、大小与 SHA-256 复核通过；每条 Run 只有一条 settled budget hold、一条 hold 账本事件和一条 release 事件，无重复结算。
- 完整机器证据保存在被 Git 忽略的 `.artifacts/design-conversation-dev-smoke-2026-08-13T11-15-41-711Z/`，包含 `evidence.json`、Kolors PNG、两份 Markdown 与两份 PDF。smoke 结束后数据库再次确认 active Agent Run=0、active tool task=0、held Agent budget=0、held tool credit=0；Worker online、queueDepth=0。
- 真实 smoke 还推动了两个小模型契约硬化：`declare_artifact.mimeType` 只能从验证器实际支持的 allowlist 中选择；`browser_dom` 的 `snapshot + 非空 HTTPS URL` 在保持同一 origin allowlist 的前提下规范化为 navigate，避免页面仍停留在 `about:blank`。HTTP、私网和未授权 origin 仍拒绝。

后续修复与生产发布（2026-08-13）：

- 真实 Agent 文件任务发现中文“提案”会被规划器误加为 `presentation`，即使用户只明确要求 Markdown 与 PDF，也会在已生成两个合格文件后因缺少 PPTX 失败。PR [#45](https://github.com/FengFan-1997/Artigen/pull/45) 将演示文稿识别收紧为明确的 PPT/PPTX/PowerPoint/幻灯片/路演稿等意图；规划器擅自增加的 `presentation` 会被服务端过滤。定向回归与完整 `pnpm check` 均通过，其中 Playwright 为 441 passed / 3 skipped / 0 failed。
- 修复后的 DEV SHA `d1abdb0984a69c49ab5ddf1deae3ed40a7e21d15` 部署为 Render `dep-d9utire7bikc73b8igq0` 并 live；Mac DEV Worker 同 SHA。最终真实 smoke 保存在被 Git 忽略的 `.artifacts/design-conversation-dev-smoke-2026-08-13T15-11-05-537Z/`：Kolors 图片 execution `63851dab-db02-4cb7-a9b0-3187907ca5c9` / task `e6735de3-e353-4035-913e-ecc458cabc7d` succeeded、10 点且只结算一次；Computer Agent Run `76bd01cc-47c2-4ce8-abe0-9b0b750d69b4` 与 `7b18a7ea-49cb-48c3-aa15-67ec09d67c71` 均 succeeded、各 6 点且只结算一次，四个 Markdown/PDF 产物全部 verification passed。并发安全回退为 1 时观察到队列最大深度 1，最终 queueDepth=0。
- `dev → main` PR [#46](https://github.com/FengFan-1997/Artigen/pull/46) 的 Core、分支策略、Chromium 桌面/移动、Firefox、WebKit 桌面/平板和 Release gate 全部通过；生产不可变 SHA 为 `b4b5b828efed80aeb9d2f5acde632c3de9d63f53`。
- Render production deployment `dep-d9uu7rijobas73bqesm0` 已核验为 `Deploy succeeded | Live`，来源 SHA 为 `b4b5b828efed80aeb9d2f5acde632c3de9d63f53`；Vercel production deployment `6M5KxnhCdLhpZDarEDv347vbTcXR` 为 `Ready / Production / Current`，同 SHA 并指向 `artigen-fengfan.vercel.app`。生产 Mac Worker 已从同一 SHA 重启。
- 生产 `/api/meta` 返回上述 SHA；`/readyz` 为 `ok=true`、迁移 `021_design_conversations`、共享 S3、SiliconFlow、支付、Agent 与对话入口全部 ready；`/api/design-assistant/status` 显示 Qwen3 规划、Kolors 图片、50 点自动上限、30 天保留、队列 0；`/api/agent/status` 为 `accessMode=authenticated-v1`、Worker online、浏览器/受限出口/桌面中继 ready、image generation public enabled、并发安全回退 1、queueDepth=0；两个图片生成模式均 `available=true`，参考图上限保持 0/1。
- 2026-08-14 的最终生产文件任务发现了更窄的否定意图边界：目标明确写“不要 PPT/PPTX/PowerPoint/幻灯片”时，旧归一化逻辑仍会因为这些词出现而接受规划器附加的 `presentation`。会话 `d2f5468c-c75d-4ea8-a206-534af70366b8` / execution `1c0a1ec4-af47-41cd-b81a-dcefb2dc8bfd` 在报价、创建 Run 或冻结前被安全取消，状态为 `cancelled`，点数变化 0。修复会先移除中文“不要/无需/不需要/禁止”等和英文 `no/without/do not` 的演示文稿否定短语，再判断显式 presentation 意图；Qwen 仍可为真正明确要求 PPT 的任务选择 `presentation`。新增中英文回归后完整 `pnpm check` 通过：441 passed / 3 skipped / 0 failed。

## 6. 已知风险与正式后续事项

- Render 使用 Free 实例，会休眠或重启，不提供商业级 SLA。
- Agent Worker 绑定当前 Mac；关机、合盖、退出登录或 Docker 停止会让任务排队。
- Agent 已开放给所有状态正常的登录用户；当前 Mac Worker 因本机资源安全门槛自动回退并发 1，额外任务会排队而不是被拒绝。
- 当前没有自定义域名。
- 生产管理后台没有可用管理员，行为统计不能仅凭队列状态推断。
- 已有生产发布前逻辑备份，但定时备份和恢复演练仍需建立。
- 稳定 24×7 需要用户明确同意费用后升级 Render 并迁移 Worker 到专用 Linux 主机。
- 扩大 Agent Beta 前需要重新验证容量、失败率、S3 用量、沙箱清理和敏感输入隔离。
- 爱发电本轮只验证了未支付订单创建、跳转、pending、钱包不入账和幂等；真实付款 webhook 入账仍需在单独获批的验收中完成。

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

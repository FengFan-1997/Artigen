# Artigen 项目正式 Handoff

## 2026-09-21 Owner Canary 受控路由候选（未发布）

- 候选分支 `owner-canary-20260920` 基于最新 `dev`，当前 exact SHA 为 `8f78d2514972c4fe0b929afc109915ff8e60fb58`，已推送到 PR #212。生产和 DEV 均未切换，Runtime V2、公众 rollout、Provider fallback 与 Canary 熔断开关保持关闭。
- 默认文本 Provider 仍为 Cloudflare `@cf/openai/gpt-oss-120b`。Owner-Canary 路由只允许在 Run 启动前 readiness 明确判定 Provider 不可用时切换固定 `siliconflow/Qwen/Qwen3-8B`；模糊回执、工具契约、权限/安全拒绝、已产生副作用和 TaskSpec/Verifier 失败保持 fail-closed，不自动重试或切换。
- Worker 先完成无副作用 Provider 探测，再把最终 Provider/model 写入 Run 和 `model.route.selected` 事件；硬安全事件可打开 Canary 熔断，新 Run 被阻断，恢复必须带人工操作者标识。
- 本轮后续修复已将 Owner Canary 熔断持久化到迁移 `030_agent_canary_circuit_state`：Worker 在每次领取前从 PostgreSQL 刷新状态，硬事件以事务方式计数/打开，重启或多 Worker 不会丢失；受保护的 `/api/admin/agent/canary-circuit` 查询与 `/recover` 恢复接口要求管理员身份，并记录恢复操作者与时间。开关仍默认关闭。
- 本轮验证：Agent runtime `141 passed / 0 failed`（含跨 Worker 重启持久熔断回归），readiness 定向回归 `28 passed / 0 failed`，前端 type-check/lint、后端 lint、workspace 检查和 deterministic quality `50/50` 通过；GitHub Quality Gate run `35562838044` 对 exact SHA 的核心门禁、5 类 Harness、Chaos、Chromium/Firefox/WebKit 桌面与移动/平板矩阵、Release gate 和 Vercel 全部成功。启用本地 PostgreSQL 集成时因测试库未执行完整迁移、缺少 `user_entitlements` 等表而阻断，不能作为本地集成门禁通过证据；DEV exact-SHA、24-slot V1/V2、图片盲审、真实主备故障切换、cleanup=0 和 Owner Canary 演练仍未完成。
- `ui-review/` 沿用仓库边界，未读取、进入、修改、删除、暂存或提交。

更新时间：2026-09-21（Asia/Shanghai）

## 2026-09-18 当前发布汇总

- `main` 已合入 PR #203、#205、#206：后台设计任务可跨页面、刷新和浏览器重启恢复；设计会话和消息由 migration `028_design_conversation_permanent_history` 永久保存，直到用户主动删除；安全测试工作区由 migration `029_secure_console_test_sessions` 提供管理员签发、一次性兑换和撤销能力。
- PR #206 修复安全测试票据兑换时用户 id 覆盖会话 id 的问题，票据现在只能成功兑换一次；受控 `secure_test_unlimited` entitlement 只适用于合成测试用户，不代表真实支付、钱包余额或生产用户权益。
- Cloudflare GPT-OSS 在明确返回免费配额耗尽（错误码 `3036`）时最多回退一次到 SiliconFlow `Qwen/Qwen3-8B`；容量不足、超时、5xx、认证失败和模糊错误不触发跨供应商重放。
- PR #179、#183、#190、#196 已进入发布主线，分别覆盖 GPT-OSS 工具回执兼容、Live Harness 轮询存活、工作台交互、Provider 配额回退。具体生产部署状态仍须以 `/api/meta`、`/readyz` 和平台 deployment 实时核验。

以下较早章节保留为历史证据；其中的候选、DEV SHA 和部署判断不覆盖本节的当前发布汇总。

## 2026-09-16 安全测试工作区发布基线（历史记录）

- 发布候选包含迁移 `029_secure_console_test_sessions`、管理员签发/撤销一次性测试会话、受控 `secure_test_unlimited` entitlement，以及安全测试模式前端标识；后续 PR #203、#205 已将其纳入 `main` 发布线。

更新时间：2026-09-18（Asia/Shanghai）

## 2026-09-14 后台任务恢复与永久会话历史（历史候选，已由后续发布列车覆盖）

- 候选提交 `6180a3f`（后续发布候选 SHA 以 DEV 合并后的不可变提交为准）新增页面离开后的会话恢复：路由切换、窗口切换、刷新或关闭浏览器不会主动取消服务端任务；重新进入工作台会恢复最近会话、Agent Run 事件流和 tool task 轮询。
- 新增迁移 `028_design_conversation_permanent_history`：设计会话和消息默认永久保存，直到用户主动删除；Render DEV/生产配置 `DESIGN_CONVERSATION_RETENTION_DAYS=0`，上传资产仍遵循资产自身生命周期。
- 原候选已通过 PR #199、#200、#201 和 #203 进入 `dev` 与 `main`；发布验证继续以目标提交的 DEV smoke、`/readyz` 和平台 deployment 为准。Runtime V2 继续关闭。

## 2026-09-11 Cloudflare 配额降级（历史候选，已由后续发布列车覆盖）

- 候选分支 `release-readiness-20260911` 实现：Cloudflare GPT-OSS 仅在明确返回免费额度耗尽（错误码 3036）时，最多切换一次到 SiliconFlow `Qwen/Qwen3-8B`；容量不足、5xx、超时、认证失败和模糊回执不触发跨供应商重放。
- 该变更已通过本地静态检查、前端/后端/邮件中继测试和 Agent 质量集，并通过 PR #196 进入发布主线；真实 Provider fallback、Worker 对齐和生产状态仍以实时接口核验，Runtime V2 继续关闭。

## 2026-09-07 Live Harness 进程存活修复（历史 PR #183）

- 候选分支 `live-eval-process-liveness` 基于 DEV `7ddbb38eb97a6a67d4c15a80c99f5f31e7251ebf`，提交 `8464904e1ba0b2cf5adbe2e9558f8507a97b47fc`。修复长时间未收敛的 Planner job 使 Live Harness 进程无声退出、slot journal 停留 `running` 的问题：保留单飞处理 Promise，同时持续执行数据库轮询和有界超时；不改变 Provider 重试、回执、租约或计费语义。
- 新增回归确认永不 resolve 的 `processNextJob()` 不会阻断轮询，Planner 不会重复调用。候选本地 `pnpm check:core` 退出码 0，`pnpm test:integration` 为 `543 passed / 3 skipped / 0 failed`；PostgreSQL 16 + 固定 MinIO deterministic `50/50`、chaos `31/31`。
- PR #183 已合入 `dev`，并随后续发布列车进入 `main`；完整 24-slot 真实 Qwen/Kolors 矩阵、图片盲审与生产 canary 仍是独立门禁，不能用该修复单独宣称通过。

## 2026-09-04 Cloudflare GPT-OSS 强制工具 envelope 兼容修复（历史 PR #179）

- Cloudflare Workers AI 的 `@cf/openai/gpt-oss-120b` 在服务端强制指定工具时，偶发将精确工具名与参数序列化到 `message.content`，而不是结构化 `tool_calls`；此前真实 Agent 任务可能因此在参数解析阶段以 `AGENT_MODEL_TOOL_ARGUMENTS_INVALID` fail-closed。
- 候选修复只在三项同时成立时恢复一次工具调用：响应是 JSON envelope、`name` 精确等于服务端刚选择的函数名、该函数仍属于当前阶段白名单。其他内容不恢复为调用，继续按普通文本/安全失败处理；原 envelope 不会写回对话上下文。
- PR #179 仅包含该兼容逻辑及 Runtime 回归测试，模型硬锁、Shell 禁止策略、预算、回执和模糊调用边界均未改变；已随后续发布列车进入 `main`。

## 2026-09-04 DEV 实机验收与来源边界修复（候选）

- PR #177 已合入 `dev`，DEV 当前可部署基线为 `69af78db2b27fe0956e48d9b300ca42b9cb7049f`；Render、Vercel Preview 与 Mac DEV Worker 已按该 SHA 对齐，迁移为 027，文本模型为 Cloudflare Workers AI `@cf/openai/gpt-oss-120b`，图片模型为 `Kwai-Kolors/Kolors`。Runtime V2 与公众 rollout 继续关闭。
- exact-SHA live gate 已通过数据库连接容量检查（Aiven `dev_artigen`，PostgreSQL 18，max_connections=20，实测可用连接 6，门槛 4）。完整 24-slot 实机矩阵尚未通过：V2 纯文本定向重测成功；完整矩阵在调研报告槽位因真实 `AGENT_BROWSER_URL_FORBIDDEN` 中止，图片盲审未执行，因此不得宣称可进入 owner canary。
- 后续候选 `browser-origin-correction`（基于上述 SHA，尚未合入/部署）严格保持 HTTPS 与 origin allowlist，并为被拒浏览器 URL 增加一次 bounded 纠错 Observation，携带本 Run 已观察的精确 URL；新增回归测试已通过。该候选待 required CI 与新的 exact-SHA 实机证据后再决定是否合入。
- 生产环境未在本轮修改或切流；不得将 DEV 的局部真实成功等同于生产 Agent 或 24-slot 门禁通过。`ui-review/`、网络代理与 Karing/B2U2 配置均未读取或修改。

文档性质：**GitHub 正式项目状态与持久事实总入口**

## 2026-09-09 UI 工作台交互硬化（历史 PR #190）

- 候选分支 `ui-interaction-hardening` 基于最新 DEV；改动覆盖工作台左栏可恢复展开、动态无障碍状态、项目页样式隔离、点数/账户语义链接和项目页交互回归。
- 候选本地验证已通过前端 type-check 与 218/218 单元测试，PR #190 已进入发布主线；生产 SHA、模型、计费、数据库和 Worker 的实时状态仍按发布门禁核验。

## 2026-09-08 V1 纯文字意图安全收口（已合入 DEV）

- 真实 DEV 浏览器运行确认：V1 Computer Agent 在用户明确要求“只返回文字、不生成文件”时，模型仍生成了网站源文件和预览文件；该运行已由用户停止，点数已释放，作为失败审计证据保留。
- 候选修复在报价和创建入口增加服务端 fail-closed 意图门禁：V1 且无交付物时，明确纯文字目标直接返回 `AGENT_TEXT_ONLY_USE_DESIGN_CHAT`，不启动数据库事务、不上传附件、不冻结点数；V2 的受验证文本终态不受影响。前端提供对应引导文案。
- 修复已通过 PR [#185](https://github.com/FengFan-1997/Artigen/pull/185) 合入 `dev`，当前 DEV exact SHA 为 `3b08adca58130540b66f088cd6e0ac33a1459f5f`；Render `/api/meta` 实测返回该 SHA，`/readyz` 与 `/api/agent/status` 均 HTTP 200，数据库、S3、Cloudflare GPT-OSS-120B、Kolors、浏览器、受限出口、桌面中继和定价均 ready，队列为 0，Runtime V2 与 rollout 均为 0。
- 回归证据：候选 `node --test backend/tests/agent-runtime.test.js` 为 `136/136`；完整 required CI run `34198576728` 全部通过（包括 Playwright `543 passed / 3 skipped`、quality `50/50`、chaos `620/620` 和 Release gate）。V1 纯文字目标现在在报价/创建前 fail-closed，转入免费设计对话，不冻结点数；有交付物的 V1 任务行为不变。
- DEV Mac Worker 已从与上述 SHA 对齐的新隔离 worktree 启动，`workerOnline=true`、`workerModelReady=true`、`queueDepth=0`、`pricingReady=true`；本节不构成生产发布、24-slot 实机矩阵或图片盲审证据。

## 2026-09-08 DEV 工作台左栏可恢复展开（已合入 DEV）

- PR [#186](https://github.com/FengFan-1997/Artigen/pull/186) 修复桌面左栏收起后隐藏唯一展开入口的问题：收起状态保留可访问的“展开左栏”按钮，并调整窄栏内品牌标记与按钮尺寸避免遮挡。
- PR #186 required CI run `34205303773` 全部通过；本地完整 `pnpm check` 为 Playwright `543 passed / 3 skipped / 0 failed`，目标 Chromium Design Conversation 为 `10 passed`，lint、type-check 与 `git diff --check` 均通过。
- DEV Render `/api/meta` 实测 exact SHA 为 `e5a12bb806daf69eb3a7e7c473cb736814d06c43`；`/readyz` 与 `/api/agent/status` 均 HTTP 200，Worker、浏览器、受限出口、桌面中继、GPT-OSS-120B、Kolors、pricing 与队列均 ready/0，Runtime V2 与 rollout 仍为关闭/0。
- DEV Mac Worker 已从与该 SHA 对齐的独立 worktree 启动。真实 Chrome 回归确认：左栏收起后“展开左栏”可见且可点击，展开后恢复完整历史栏；同一 DEV 会话完成一次免费设计咨询（未创建付费任务）和一次 IMAGE Agent Run，交付物验证通过、结算次数为 1、最终冻结为 0。
- 本节不构成生产发布、完整 24-slot V1/V2 实机矩阵或图片匿名盲审证据；生产/main、owner canary 与公众 rollout 未修改。

## 2026-09-07 登录验证码流程修复（已提交，待 DEV 验收）

- 邮箱登录发送验证码后，验证码输入现在留在同一 `/login` 页面面板内，不再跳转到独立验证页；验证码会话在刷新后仍可恢复，`accepted` 与 `unknown` 交付状态均保留对应提示。
- 验证码、密码和 Google 登录成功后，默认回到 `/artigen`；若入口带有 `redirect`，继续回到原触发页面。独立 `/login/verify` 深链接保留兼容，但成功后也不再自动打开账户页。
- 前端回归覆盖同页验证码、刷新恢复、未知投递状态和成功跳转，共 `4/4` Chromium OTP 用例通过；`vue-tsc`、前端单测 `218/218` 和生产构建通过。该修复尚未部署生产，需随 feature→dev PR 完成 DEV 验收。

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
- Agent Run 在中间交付摘要和右侧文件面板使用一致的文件类型、大小/版本及验证状态；内部 `pending`、`passed`、`failed` 状态映射为当前语言的用户文案与语义标签。
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

## 5.1 DEV GPT-OSS 强制工具回执兼容修复（2026-09-04）

- PR #179 已在 required CI 与 Release gate 全绿后合入 `dev`，merge SHA 为 `ccdcc055bb51f8ac6814fd30a8272f353053b9ed`。修复针对 Cloudflare GPT-OSS 在强制工具选择时把合法 JSON 放入 `message.content`、却返回空 `tool_calls` 的上游兼容问题；服务端仅在 `name` 精确匹配当前 allowlist 与被强制工具时恢复调用，不匹配继续 fail-closed。
- PR #180 与 PR #181 已在 required CI 与 Release gate 全绿后合入 `dev`；当前最终不可变 DEV SHA 为 `650388a73061e4a2bdce0da33a94b381f70a625f`。Render DEV `/api/meta`、`/readyz`、`/api/agent/status` 实测 HTTP 200 且精确运行该 SHA；Vercel Preview deployment `6263239827` 状态为 `success`。迁移 `027_agent_live_eval_capacity_aggregate`、Cloudflare `@cf/openai/gpt-oss-120b`、Kolors、数据库/S3、Worker/browser/egress/desktop relay 与 pricing 均 ready。
- Mac DEV Worker 使用 exact-SHA worktree 保持单实例运行，`workerOnline=true`、`browserReady=true`、`egressVerified=true`、`desktopRelayReady=true`、`queueDepth=0`、`concurrency=1`；LaunchAgent 仍存在 Docker readiness 竞态，不将 LaunchAgent 本身当作在线证据。生产 Worker 与部署未修改。
- Runtime V2 仍关闭、rollout=0；`650388a…` 尚未签发新的 live-eval gate，完整 24-slot V1/V2、真实 Kolors 和图片匿名盲审仍未完成，因此本节不构成生产放行或 owner canary 证据。先前真实失败/ambiguous 审计回执继续保留，活动 Run、hold、reservation、queue 与冻结余额已按正式清理路径归零。

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

### 2026-09-14 migration 028 deployment compatibility
Migration 028 now explicitly drops legacy `expires_at` NOT NULL constraints before moving design conversation and message expiry to `NULL`, allowing existing DEV/production schemas to adopt permanent history safely during startup migration.

## 2026-10-14：Agent 工作区前三批本地候选（未发布）

本轮完成状态与恢复、会话生命周期、主视觉与无障碍三批。阶段为本地候选，尚未 push、创建 PR 或部署；不能视作 DEV/Production 当前状态。

- Run 首次读取的加载/错误独立展示；503 可重读，401/404 有准确入口，历史读取失败不挡当前任务。完成进度来自已保存 plan；失败/取消保留成果，结算/退还/释放采用实际 budget 字段，不从错误码推测。手机持续显示任务名、状态和当前费用。
- Design 对选择、刷新、发送、SSE 与创建执行使用身份/revision 检查，保留执行原始关联；工具 success 终态、切换/卸载清理轮询，最终刷新失败不重新挂计时器。自动启动意图能跨普通并发刷新保留且只启动一次；旧 Run 回执不覆盖更新终态。阅读旧内容时保留位置并提供回到底部入口。
- 文本草稿按账号/任务保存在本机，最多 20,000 字符。guest 登录保持当前非空草稿，账号/任务切换恢复各自草稿；成功回执只清匹配的原稿。文件重载后重新选择，文件与凭据不进入该存储。
- 起点问题/输入/建议成组，未使用 Inspector 默认收起，用户明确偏好优先。共用 760px 阅读轴、正确历史日期、12px 元信息、手机 16px 输入/44px 点击区；浅色语义/焦点独立，焦点采用完整内侧描边。native summary/select/textarea、权限标签、命令搜索和 DEV 标识碰撞完成回归。
- 审批展示依据、影响、撤销；真实 expiresAt 到期自动失效，点击时重查，到期/提交中不能重复批准或接管。服务端继续决定权限、执行和结算；没有新增后端状态或第二套业务真相。

验证：前端 228/228 单元、联合系统 Chrome E2E 78/78、追加 Run 输入锁定/重载草稿 1/1；type-check、production build、lint、docs/workspace 与 diff 检查通过。7 个 Vue detector primary 0；10 个 neutral shadow/scrim advisory 经核对，不计作产品问题。实际主题 token 的焦点及语义对比度通过；11 组本机实际渲染对照无 pageerror/整页横向溢出，使用合成 API 数据。

验证基于当前工作树并保留原有未提交内容，尚未在清洁 dev checkout/CI 中验证。没有新增依赖、环境变量或迁移；用户原有未提交内容保留。本轮回退使用隔离的本地提交，不改变数据库/平台。旧两份审查记录只规范审查员名称，解决文档路径检查误判，没有弱化门禁。

第 4–7 批共享 Run Composer/附件、调用分组、成果后续任务与真实 DEV 发布尚未实施。没有重新验证真实 Worker/模型/存储/结算或 Production；backend 全量与完整跨浏览器测试不属于此次前端候选验证。


## 2026-10-15：Agent 输入、附件与工具记录（本地候选，未发布）

- Create、Agent Workbench 与 Run 统一使用 ComposerBox；Enter 发送、Shift+Enter 换行，输入法确认不发送。提交中可继续写文字，迟到回执只清匹配原稿；Run 同一失败输入重试复用服务端 inputId，后续主动发送使用新标识。终态输入保持禁用。
- 启动前附件连续追加、按元信息去重、逐个移除；超出数量或执行器大小限制整体拒绝新选择并保留原文件，不再替换或静默截断。报价包含交付物、能力、站点与附件范围，修改后重新报价；上传有状态反馈，失败保留选择，创建失败重试复用已上传附件和请求标识。
- 运行中 input API 仍仅接收文字与审批；不展示虚假的运行中附件入口，明确新文件需在新任务中添加。文件不写入草稿持久存储；未增加后端接口、依赖、迁移、环境变量或另一套运行状态。
- 主会话的执行记录按实际持久事件 callId/runId/subagentId 关联开始与完成回执；缺失 ID 不猜测配对，缺少布尔结果不推断成败。展开可查看公共工具名、状态、时间、调用与事件标识；完整审计保留在检查器。参数、命令与私有输出不进入此 UI。
- 删除 Run 的旧 Composer、重复最近动作与旧事件流展示；保留真实计划、审批、成果与完整审计。新事件在阅读旧内容时不抢位置，并提供回到底部入口；手机审批与子任务控件继续满足 44px 点击区。

验证：前端单元 244/244；五份相关系统 Chrome E2E 联合 99/99（含新增 20 项输入/附件/调用场景）；type-check、lint 与 production build 通过。独立代码复核无未解决 Critical/Important；5 个 Vue detector primary 0，3 个既有中性阴影 advisory 保留，未新增忽略规则。10 组同视口/主题/合成 API 数据的真实 Vue 前后截图，无页面错误或整页横向溢出。

这是本地候选的验证，保留了用户原有工作树改动；没有 push、PR、合并或部署，也没有重新验证真实 Worker、模型、对象存储、结算、跨浏览器或 Production。构建仍有既有 empty echarts/large chunk 提示。第 6–7 批成果后续工作流、电脑连接及真实发布尚未完成。


## 2026-10-15：Agent 工作空间复刻（本地候选，未发布）

按依赖形成五个本地提交；未 push、PR、合并或部署。用户原有工作树保留，不代表清洁 CI 或线上验收。

### 工作空间数据基础

导航投影沿用项目、设计会话及独立 Run，执行关联不重复展示；所有权校验约束改名和归属调整。迁移032增加公开消息键、项目文件、不可变版本与仓库绑定。文件沿用现有资产，保存验证基础版本和哈希，冲突409；原资产/历史版本不复制、不被常规GC误删。空文本只在显式编辑器路径接受。

GitHub 项目绑定复用既有 OAuth；仓库请求固定 GET，保留分页和文件patch，不产生提交、推送、PR或合并。OAuth 尚未在本机配置，真实授权仓库未验收。应用回退保留数据，032拒绝破坏性down。

### 公开消息与文件修改契约

模型实际公开回合与最终正文进入加密payload；稳定键和租约校验防重复及旧Worker写入。SSE只发引用，分页游标保留数据库微秒。私有分析、工具参数与凭据不公开，缺失历史不补造。

文件目标校验选中上传资产、归属、大小、UTF-8、哈希和云来源，服务器分配明确候选文件名，保持原工具schema与冻结Runtime兼容。V2每回合及恢复保留契约；最终产物经既有验证后携带来源关系。完成Run通过关联设计会话继续，不改变运行中input的附件限制。

### 文件与内容组件

共享组件提供项目树、公开内容流、授权图片/Markdown、安全静态HTML/PDF、多标签、云端版本和CodeMirror编辑/差异。Markdown关闭原始HTML并限制协议，外链图片不加载；HTML预览采用净化、CSP与隔离iframe。新增渲染/编辑依赖及许可证清单同步。

Chrome目录由用户主动选择，按需展开；目录连接不上传。账号/项目/根目录隔离句柄与草稿，草稿5MiB、文本1MiB，敏感文件不缓存或进入上下文。明确逐文件确认后才写回，磁盘哈希变化拒绝覆盖；保留当前编辑会话内撤销。保存中的新编辑、冲突草稿和对象URL生命周期均单独处理。

### 三栏工作空间接入

创建、Agent工作台和Run接入56px功能栏、项目会话树、连续会话与资源区，保留Artigen颜色和明暗主题。项目、资源、资源内目录分别隐藏，分栏可拖动并恢复偏好；窄屏采用抽屉/单主区，手机保留44px控件。原环境、计划、子Agent、电脑与专业文件验证收纳到任务入口，不丢失既有能力。

新会话继承项目；账号/项目切换拒绝迟到响应和旧私有内容。文件主动加入会话只暂存在内存，发送后上传；不支持的运行中附件不偷偷追加。原共享输入、IME、草稿、计费、预算、审批与阅读位置行为保留。

### 验证、边界与回退

前端249项单元通过；后端默认650项通过、98项条件跳过；独立PostgreSQL16迁移、真实本地文件存储/GC与Runtime集成15项通过、无跳过。系统Chrome桌面联合85项通过，截图采集用例单独执行；追加授权图片专项1项、手机专项5项通过。类型、前后端lint、构建、docs/workspace和diff检查通过。设计扫描7个组件primary为0，4条既有中性阴影/遮罩advisory经核对保留，没有新增忽略规则。独立静态复核无剩余P1/P2。

真实Chrome原生目录选择、服务读写、外部修改冲突和磁盘保护单独实测；这不是完整模型写回验收。交付17组34张真实Vue前后截图，业务API、消息、文件及PR使用合成数据，尺寸/哈希与边界随图册记录；新增能力无旧版对应时展示真实旧页面。

未验证真实OAuth仓库、真实模型/Worker候选全链路、远程S3、DEV/Production和完整跨浏览器。构建仍有既有empty echarts/large chunk提示。未新增平台账号或Secret，无账号报告变更；供应商、模型、支付和生产Free决定均保持原范围。

回退按本轮依赖反序revert应用提交，保留文件/消息数据；不reset用户工作树，不对032执行破坏性down。发布须另走现有DEV/Production门禁。配置及接口说明见 `docs/AGENT_WORKSPACE.zh-CN.md`。


## Agent 多尺寸与大工作量修复（2026-10-15，本地候选，未部署）

- 项目导航改名表单紧邻头部并聚焦；长文件标签独立滚动，目录开关保留，支持键盘切换、关闭焦点及模式返回位置。相同资产多路径按精确文件ID打开。
- 共享输入框附件/长文限高；窄屏Grid和短屏零状态可达；宽Markdown表格局部滚动。编辑器改用Artigen明暗语义色，采样深色最低对比度从1.43:1提升至6.21:1。
- GitHub记录详情替换长列表，返回恢复焦点；刷新负责释放当前busy状态，旧回执不覆盖新状态。Shell保留实际抽屉触发焦点，取消拖动结束resize，分隔条暴露实际宽度；短屏命令可滚动，编辑器搜索Escape不再同时关资源区。平板coarse pointer控件至少44px。
- 直接声明已有的`@codemirror/language`及`@lezer/highlight`，离线零下载、零新增包，MIT清单同步。无后端、账号、Secret或供应商变更。
- 前端单元249项通过；既有四组浏览器回归86通过、1个采图用例跳过；新增压力验收11项通过，覆盖12尺寸42状态、60消息、120会话、12标签、10附件及250文件/5000行文本。三项改前失败断言在改后通过。类型、lint、生产构建及docs/workspace检查通过。
- 详见`docs/AGENT_RESPONSIVE_AUDIT.zh-CN.md`及独立压缩图册16组32张。截图来自真实Vue生产构建与合成API数据，不作为真实模型、GitHub OAuth或线上通过证据；未执行物理移动设备、Firefox/Safari完整回归及后端集成。

## 2026-10-23 PDF 预览页码导航精修（本地候选，未部署）

- PDF 工具条从两枚文字按钮和裸页码收敛为紧凑的分段导航控件，使用 Artigen 中性表面与主题边界；补充前后页的无障碍名称、可见键盘焦点和窄屏触控尺寸。
- 加载中不显示 `1 / 0`，预览失败时显示 `— / —` 并禁用翻页，避免无效页码状态看起来可操作。原有 PDF.js 加载、绘制和清理生命周期未改变。
- 回归验证：系统 Chrome 下 PDF.js 渲染/关闭、页码状态及失败状态共 6 项通过，覆盖 1440px 深色桌面和 390px 浅色触屏；目标 ESLint、Prettier、`vue-tsc -b` 通过。测试文件为合成 PDF 与工作区 API 数据，不代表 DEV 或真实用户数据。
- 改前/改后截图保存在本机 `Artigen-agent-chrome-polish/artigen-pdf-navigation-polish-20261023`，两张均为真实本地 Vue 页面截图；本轮没有部署、push、创建 PR 或合并。

## 2026-10-23 Markdown 表格预览层级精修（本地候选，未部署）

- Markdown 预览表格的表头现在使用主题中性的 raised surface 和加重字重，数据行保留轻分隔线，最后一行去掉多余尾线；没有增加外框或卡片层级，沿用现有横向滚动和明暗主题。
- 系统 Chrome 回归覆盖 1440px 深色桌面和 390px 浅色手机；断言表头与内容行背景有可见区分、文字对比度不低于 4.5:1，页面不产生横向溢出。原项目树、文件保存/冲突、候选差异及只读 GitHub 工作流回归通过。
- 目标 ESLint、Prettier、前端 type-check、Vite production build 与 `git diff --check` 通过。构建仅有既有 empty echarts 和大 chunk 提示。
- 同视图改前/改后截图保存在本机 `Artigen-agent-chrome-polish/artigen-markdown-table-20261023`；均为真实本地 Vue 页面和合成工作区数据，不代表 DEV 或生产验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 命令面板键盘选择精修（本地候选，未部署）

- Agent 工作区命令面板现在使用可访问的 combobox/listbox 选择模型。首项默认选中，方向键循环浏览，鼠标悬停同步当前项，Enter 执行；筛选变化重置首项，无匹配项时显示空状态。Escape 仍恢复打开前焦点。
- 选中行使用主题 raised surface，快捷键采用紧凑按键样式；没有快捷键的操作不渲染空按键。深浅主题维持各自边界与文字对比。
- 系统 Chrome 工作区回归 22 项通过。新增命令面板断言覆盖焦点恢复、键盘循环、鼠标同步、筛选重置、空结果、Enter 导航、浅色对比度和 390px 边界/横向溢出；前端 type-check 与目标 ESLint 通过。
- 改前/改后截图保存在本机 `Artigen-agent-chrome-polish/artigen-command-palette-keyboard-20261023`。截图来自真实本地 Vue 页面和合成 API 数据，不代表 DEV 或生产验收；本轮未部署、push、创建 PR 或合并。

## 2026-10-23 已保存运行消息的复制交互（本地候选，未部署）

- Agent 运行详情中，已保存的会话消息现在提供复制正文操作。桌面端仅在悬停或键盘聚焦时显示，触屏布局始终显示并保留 44×44px 点击区域；成功和失败均有可访问播报，失败时可重试。切换运行、账号变化或卸载会清除临时反馈状态。
- 本地系统 Chrome 工作区回归 12 项通过、1 项仅截图采集用例按需跳过；新增覆盖 Markdown 原文复制、成功提示、剪贴板拒绝提示、键盘聚焦和真实 390px 触屏上下文。目标 ESLint、前端 type-check 通过。数据使用合成工作区 fixture，非真实 DEV 用户/任务。
- 同视图改前/改后全页截图及消息裁剪图保存在本机 `Artigen-agent-chrome-polish/artigen-message-copy-20261023/`。截图来自本地 Vue 页面和合成 API 数据，不代表 DEV 或生产验收；本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 文件树图标层级（本地候选，未部署）

- 文件树目录行现用固定箭头槽表达展开状态，并单独显示文件夹图标；文件类型图标与名称保持列对齐。当前打开文件通过 `aria-current="page"` 暴露状态，并仅以主题强调色区分类型图标，不添加连接线或额外边框。
- 系统 Chrome 的项目树/保存/冲突/候选差异/GitHub 回归与新增文件树状态测试 2/2 通过；新增测试验证目录展开语义、当前文件语义及类型图标层级。前端 type-check、目标 ESLint、文档检查和 `git diff --check` 通过。
- 同视图 1920×1080 深色改前/改后截图保存在本机 `Artigen-agent-chrome-polish/artigen-file-tree-icons-20261023/`，使用真实本地 Vue 页面和合成工作区 API 数据，不代表 DEV 或生产验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 空白页任务建议操作提示（本地候选，未部署）

- 空白工作区的任务建议继续保持轻量文本行；鼠标悬停或键盘聚焦时出现共享箭头图标，触屏下常显。点选会把建议内容填入目标输入框，并将焦点和光标移至末尾，便于继续改写。
- 输入框聚焦时只保留 Composer 外层焦点环，避免 Shell 的通用焦点样式在输入区内再画一层描边。
- 系统 Chrome 桌面与 390px 触屏模拟回归 2/2 通过；覆盖动作提示、建议填充、焦点、末尾插入点和焦点环。`frontend/DESIGN.md` 已记录交互约束。
- 改前/改后截图保存在本机 `Artigen-agent-chrome-polish/artigen-agent-suggestions-20261023/`，是真实本地 Vue 页面与合成 API fixture，不代表 DEV 或生产验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 长动作进度摘要（本地候选，未部署）

- 运行详情的当前动作摘要固定为单行；长文本省略显示，并保留完整原生提示及 DOM 可访问文本。步骤计数和展开图标不再被长动作挤到下一行。
- 系统 Chrome 使用合成运行事件验证 390px 深色触屏视口：摘要高度从 108px 降到 48px，步骤数与展开入口保持可见，页面没有横向溢出。完整动作保留在 DOM 可访问文本和已有的可展开执行记录中，并由原生标题提示提供悬停查看入口。
- 改前/改后真实浏览器截图保存在本机 `Artigen-agent-chrome-polish/artigen-run-action-summary-20261023/`；只代表本地 Vue 页面与合成 API 数据，不代表 DEV 或生产验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 运行终态下一步入口（本地候选，未部署）

- 成功、失败和取消的终态运行不再显示整块不可用的空输入框，改为紧凑状态栏，说明任务记录仍可查看，并提供“新建任务”入口；关联项目时，新任务沿用当前 `projectId`。
- 如果运行结束时已有未发送草稿，仍保留原只读输入框和草稿内容，避免状态切换隐藏用户文字。活动运行输入、未读更新跳转与 Run API 行为未改变。
- 系统 Chrome 桌面深色与 390px 移动浅色回归覆盖成功、失败、取消、44px 点击目标、项目上下文和未发送草稿恢复，定向用例 2/2 通过；前端类型、目标 ESLint、Impeccable detector、docs/workspace 检查通过。
- 改前/改后截图保存在本机 `Artigen-agent-chrome-polish/terminal-state-20261023/`。数据来自真实本地 Vue 页面和合成工作区 API，不代表 DEV 或生产验收。
- 整个 `agent-input-tools.spec.ts` 的桌面与移动组合回归为 41/42；唯一失败是移动端“20 次工具调用”用例未打开隐藏的资源抽屉就寻找“任务”标签，与本轮终态区分支无关。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 工具调用回执行对齐（本地候选，未部署）

- 展开工具调用后，时间、过程说明和事件编号在桌面与窄屏保持同一行列；长说明只在中间列换行，时间和事件编号使用次级等宽数字，便于连续核对调用回执。
- 系统 Chrome 定向回归覆盖 1440px、390px 和 360px；回执行对齐、未知回执保护及阅读位置/新内容跳转共 9/9 通过，无横向溢出。
- 改前/改后截图保存在本机 `Artigen-agent-chrome-polish/agent-activity-trace-20261023/`，使用真实本地 Vue 页面和合成事件 fixture，不代表 DEV 或生产验收。
- 前端类型检查、目标 ESLint、文档与 workspace 检查通过；未改事件数据、API 或审计记录。本轮未部署、push、创建 PR 或合并。

## 2026-10-23 Agent 项目会话当前项可见性（本地候选，未部署）

- 项目会话导航的当前项在浅色主题使用白色选中表面，在深色主题继续使用中性悬停表面；当前标题采用中等字重。没有新增边框或品牌色大面积底纹。
- 当前会话链接提供 `aria-current="page"` 和完整原生标题提示，列表截断时仍可查看完整名称。
- 系统 Chrome 工作区回归 14 项通过、1 项已有截图用例跳过；新增覆盖浅色桌面与深色 390px 历史抽屉的选中背景、当前页语义和标题提示。前端 type-check、目标 ESLint、文档检查与 `git diff --check` 通过。
- 改前/改后真实浏览器截图保存在本机 `Artigen-agent-chrome-polish/session-selection-20261023/`。页面使用本地 Vue 和合成工作区数据，不代表 DEV 或生产验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-26 Agent 审批卡信息层级精修（本地候选，未部署）

- 运行详情中的审批依据、影响、撤销从三张嵌套底色块改为紧凑的标签/内容行；次级标签改用中性文字色，保留审批卡本身的风险提示。
- 真实系统 Chrome 1440×960 深色视图中，三条简短事实的审批按钮由初始滚动视区之外收回到视区内；窄屏原有 44×44px 审批按钮约束保持不变。
- 回归：桌面审批信息布局与初始按钮可达、拒绝原因标签及单一主要动作通过；手机审批/子任务触控目标通过，共 2 项。前端类型检查、目标 ESLint、文档和工作区配置检查通过。整文件 Prettier 检查因仓库现有 Vue/E2E/Markdown 格式不符合默认 Prettier 而告警，本轮没有批量改写。
- 改前/改后截图：`Artigen-agent-chrome-polish/approval-card-20261026/`。页面是真实本地 Vue 与合成运行/审批数据，不代表 DEV、真实模型或生产验收。没有部署、push、创建 PR 或合并。

## 2026-10-26 子 Agent 状态与执行元数据对齐（本地候选，未部署）

- 运行详情右侧的子 Agent 卡片现在在名称行显示带文字的状态和语义色点；步骤与点数分开对齐，不再把状态重复塞进同一条元数据。步骤和点数单位按中英文界面切换。
- 状态文本不是仅靠颜色传达：队列/取消使用中性或危险语义，运行、完成与失败使用主题语义色。明暗主题下的状态文字对比度均由浏览器回归检查达到 4.5:1。
- 系统 Chrome 桌面与 390px 触屏项目子 Agent 状态/取消回归 2/2 通过；前端 type-check、目标 ESLint、文档检查、workspace 检查与 `git diff --check` 通过。
- 改前/改后真实浏览器截图保存在本机 `Artigen-agent-chrome-polish/subagent-status-20261026/`。页面使用本地 Vue 页面与合成 Run fixture，不代表 DEV 或 Production 用户/任务验收。本轮未部署、push、创建 PR 或合并。

## 2026-10-26 内容容器禁用装饰性彩色边框（本地候选，未部署）

- 产品设计硬约束已写入 `frontend/DESIGN.md` 和开发必读 `AGENTS.md`：内容容器严禁装饰性彩色边框及单侧装饰边框、色条；使用内阴影、渐变或伪元素模拟也属于禁用样式。结构性中性分割线与完整键盘焦点轮廓继续保持清晰。
- Agent 工作区的交付、审批、重试、授权、预算与错误提示移除单侧彩色内阴影；保留整体表面、状态文案和图标，移除原本为色条补偿的左侧额外内距。
- 系统 Chrome 桌面与 390px 手机交付文件回归 2/2 通过；前端 type-check、目标 ESLint、文档与 workspace 检查通过。改前/改后截图保存在本机 `Artigen-agent-chrome-polish/delivery-accent-ban-20261026/`，使用真实本地 Vue 页面和同一合成 Run fixture；没有部署或远端操作。

## 2026-10-26 网站预览标题与移动端焦点修复（本地候选，未部署）

- 网站预览标题与入口采用单行省略，完整文件名保留在标题提示与无障碍名称中；关闭按钮不参与压缩，手机保持至少 44px 点击区，避免长文件名把标题栏撑成多行。
- 原来的预览 section 位于移动抽屉设置为 inert 的会话背景内，导致预览虽然可见，关闭按钮却无法获得焦点。改用原生 modal dialog 进入浏览器顶层，删除手写 Tab 循环与全局 Escape 监听；原生模态负责焦点隔离，关闭后返回原入口。ZIP 读取、CSP、iframe sandbox 与 referrerpolicy 保持原有边界。
- 系统 Chrome 的 1440px 桌面和 390px 手机、深浅主题回归共 4/4 通过，覆盖标题几何、完整名称、顶层模态、关闭按钮初始焦点、背景不能抢焦点、Escape/按钮关闭和焦点返回。前端 type-check、目标 ESLint、文档与 workspace 门禁通过。
- 真实本地 Vue 页面对照图保存在本机 `Artigen-agent-chrome-polish/preview-header-20261026/`；使用合成 Run 和实际解压的测试 ZIP，不代表 DEV/Production 或真实模型任务。本轮未部署、push、创建 PR 或合并。

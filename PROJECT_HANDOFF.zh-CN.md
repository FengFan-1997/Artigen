# Artigen 项目正式 Handoff

## 2026-09-24 设计对话上下文进入 Agent Run（已部署 DEV，未发布生产）

- 静态审计发现，设计对话规划器能看到此前消息，但创建 Computer Agent Run 时只把本轮一句话作为执行目标；“按刚才的受众继续修改”这类后续要求会失去前文约束。
- Agent Run 现在会附带最近 6 条同一对话的用户/助手文字记录，历史最多占 6,000 字符，整体目标不超过 20,000 字符。本轮要求放在最前并优先；历史只作背景，不构成新的外部操作授权。历史附件不自动注入，仍需用户显式选择。
- 执行卡片会显示带入的历史文字条数，并提示本轮要求优先、历史附件需另行选择。PR [#232](https://github.com/FengFan-1997/Artigen/pull/232) 已通过 required CI（核心质量门、Agent Harness、混沌测试及 Chromium/Firefox/WebKit 桌面、移动和平板 E2E）和 Vercel Preview，并合入 `dev`。
- Render DEV `/api/meta` 精确返回 SHA `a2af69125b8d9396025be94aeea71cc6127c7e4c`；该部署为 live，`/healthz` 正常，`/readyz` 的数据库、S3、payload、Provider 配置、认证密钥、邮件、Turnstile、Agent、定价与设计对话检查均通过。Agent Provider scheduler 按配置为未启用，readiness 标记为非必需并跳过。
- 本地验证：设计对话 service 定向测试 31/31，前端单测 233/233，后端 697 通过 / 100 跳过，`pnpm check:workspace`、`pnpm lint`、前端类型检查及生产构建、Agent 质量集校验全部通过。规划 Provider 之前返回限流，本次未再次调用真实模型或创建 Run；因此真实模型是否正确遵循跨轮上下文仍待 Provider 可用后在 DEV 验收。readiness 只表示配置与依赖检查通过，不代表真实模型调用或支付成功。
- 没有修改数据库迁移、账号、平台配置、支付或 Production。

## 2026-09-24 Agent 会话附件刷新恢复（已部署 DEV，未发布生产）

- 设计对话已上传的输入文件会保存在会话资产关联中；刷新后浏览器内的原始 `File` 对象消失。此前执行准备只遍历本机内存 `File`，因此即便对象存储资产仍可用，也可能错误地要求重新选择文件或没有把已有资产交给任务。
- 执行准备根据执行计划中的客户端文件 ID，优先复用当前会话已登记的资产 ID；仅对尚未登记且本机仍有文件对象的输入上传；已有服务端资产和本机文件都缺失、或上传回执没有覆盖全部输入时，任务保持未启动并要求补全附件。输入次序和去重由独立解析函数确定。
- PR [#230](https://github.com/FengFan-1997/Artigen/pull/230) 已通过 required CI（核心质量门、Chromium/Firefox/WebKit 桌面与移动/平板 E2E、Agent Harness 和 Release gate）及 Vercel Preview，并于 2026-09-24 合入 `dev`。Render DEV `/api/meta` 精确返回 SHA `4572c7be261fbf192ec108be63712fff61da2901`；部署状态为 live，`/healthz` 与 `/readyz` 返回正常，数据库、S3、Provider、Agent 和设计对话 readiness 均通过。
- 本地 `pnpm --filter personal test` 通过（63 个文件、233/233）；资产恢复与设计对话 service 定向测试 13/13；前端 type-check、变更文件 ESLint、production build、`pnpm check:docs`、`pnpm check:workspace`、`git diff --check` 全通过。规划 Provider 当前限流，本次没有执行真实带附件任务，因此实际在线附件执行/下载链路仍待 Provider 恢复后验收。该变更未发布生产，未做支付测试，也未调整账号、凭据或平台配置。

## 2026-09-24 同会话跨运行文件续做（已部署 DEV，未发布生产）

- 目标回到主要产品工作流：用户在同一设计对话中明确选中已完成任务的产物并要求续做时，将真实源文件交给新的电脑 Agent Run；服务端校验同用户、同会话、已成功 Run、已验证产物、活动资产归属与有效期，再把资产纳入新 Run 的加密输入。没有选中的历史文件不会自动注入。
- 新表 `agent_run_source_artifacts` 持久化源产物与新 Run 的关系。Agent 新产物在唯一匹配源文件时写入父产物关系并递增版本；界面显示源文件、版本与续做关系，用户可以从产物卡片发起续做。
- 设计规划器对明确的文件编辑/电脑操作要求，在格式化响应反复无效时采用受限恢复；纯文字请求与否定的交付类型仍优先。选择既有 PDF、文档、表格、演示、网站或图片续做时，尽量保持源格式；不向规划器暴露资产 ID。
- PR #224 已合入 `dev`；本轮只读核对 DEV `/api/meta` 为 `87a5d6df2312629d5db75b78d6d13e51498a7e62`，`/readyz` 正常且数据库迁移为 `031_agent_run_artifact_lineage`。这只证明 API 与迁移已部署，不代表 Mac Worker、跨 Run 资产续做、版本链、浏览器下载与恢复均已验收；生产不在本次范围。
- 首次 DEV 复验在临时沙箱生成文件后失败，未留下持久化产物；PR #225 部署后再次执行，两个文件已登记并通过独立验证，但 Run 仍在收尾时以 `AGENT_PLAN_INVALID` 失败并释放冻结费用。只读检查确认后续产物留在对象存储，Provider 回执内容加密，未读取或记录原始模型参数。
- Worker 计划保存回调的无效更新分支已由 PR #226 修复并合入 `dev`；DEV API 的 `/api/meta` 返回 `c45a86d6b7162b0213288dc2a542134dd5f4f558`，DEV Mac Worker 亦已切换到同一 SHA。`/readyz` 与 Worker 状态均正常，队列为空，生产未动。
- PR #227 已将规划 Provider 错误归一为不含响应正文、URL 或原始传输错误的错误码，并保留筛选后的状态与耗时。其部署后再次尝试小预算规划时，数据库记录为 `AGENT_CLOUDFLARE_RATE_LIMITED`，约 20 秒内出现 9 次失败调用；规划没有完成，因此没有创建 Agent Run 或冻结点数。调用记录没有保留 Cloudflare 内部状态码，无法判断是每日免费配额耗尽还是暂时容量繁忙；公开状态页正常也不能证明特定账户可用。该次复验没有启动第二个任务或把中间产物表述为成功。

## 2026-09-24 Agent V1 无效计划收尾保护（已部署 DEV，真实工作流仍待通过）

- Provider 已保留最近一份有效计划并在重复无效更新后关闭 `update_plan`；DEV 真实 V1 任务仍显示，Worker 回调的计划校验错误能在模型层恢复后再次从计划保存边界逃逸。Worker 现在从持久 checkpoint 初始化最后有效计划，并在已有有效计划时将后续 `AGENT_PLAN_INVALID` 作为可忽略的计划更新返回；保留旧计划、写入内容受限的 `plan.update.ignored` 事件并继续执行。没有先前有效计划时仍按原行为拒绝，避免绕过首次计划校验。
- PR #226 的 Worker 级回归覆盖持久计划存在时的稳定 ID 无效与步骤数不足两类更新；两者都保留旧计划并继续执行，没有有效计划时仍保持拒绝。PR #226 已通过完整 required CI 并合入 `dev`，DEV API 与 Worker 已按同一精确 SHA 对齐。
- 真实工作流尚未通过终态、刷新恢复和产物下载验收：当前阻塞出现在创建任务前的 Cloudflare 规划调用；没有创建 Agent Run、没有冻结点数。未修改数据库迁移、账号、平台配置、支付或生产。

## 2026-09-24 规划 Provider 限流重试保护（已部署 DEV，主要任务仍受 Provider 限制）

- PR #227 已通过 required CI 并合入 `dev`，Render DEV 部署 SHA 为 `77116c301286c158e56a2f3348c3b16d7db256d2`；保留不含上游响应正文、URL 与传输原文的规划错误分类和筛选后的状态/耗时。
- DEV 真实规划曾在约 20 秒内得到 9 次 `AGENT_CLOUDFLARE_RATE_LIMITED` 失败调用：模型内部重试与规划队列重放相乘。数据库未保留 Cloudflare 内部状态码，不能断言是每日免费配额耗尽还是暂时容量不足。
- PR #228 将 `AGENT_CLOUDFLARE_RATE_LIMITED` 作为当前规划 job 的终止错误：不重试当前模型请求，也不自动重排 durable planning job；超时、传输和上游 5xx 仍保留既有限次重试。规划错误提示用户模型受到限流或容量限制，并明确规划阶段没有创建 Agent Run 或冻结点数。未改变 Agent Runtime、Provider/model 配置、fallback、环境变量、迁移、账号、支付或生产。
- PR #228 已通过 required CI run `35976458398`（Core、Agent Harness、chaos、全部 Chromium/Firefox/WebKit E2E 与 Release gate），并于 2026-09-24 合入 `dev`。Render DEV `/api/meta` 精确为 `41842d2fa1171c11b8702a300cfdcd92dfb8e6a2`；`/readyz` 全部检查通过，迁移 `031_agent_run_artifact_lineage`，Cloudflare GPT-OSS 与 Kolors readiness 通过，Provider fallback 仍关闭；`/api/agent/status` 显示 Worker / 模型 / browser / egress / desktop relay 在线、queue=0。
- 合并后仅提交了一次虚构文本文件需求。页面显示限流/容量提示，未产生 plan/quote 或 Agent Run，也未冻结点数；真实任务仍没有成功。此请求未能验证 5 点报价边界、Worker 沙箱、文件登记、刷新恢复、下载或最终账务，因为规划调用在任务创建前就失败。
- Cloudflare 实际限流原因仍不确定，公开状态正常不能证明单一账号配额或容量情况。没有登录/修改 Cloudflare 账户、开通付费或启用 Provider fallback；Production 未触碰。

## 2026-09-22 主工作流协作记录与执行中补充（开发候选，未部署）

- 用户明确将主要工作流作为上线核心：自然语言进展、真实工具调用、可恢复记录与上下文。新增现行协作工作流规范并接入产品文档入口，运维与邀请不替代产品验收。
- 设计对话和运行详情按服务端事件展示时间顺序的进展、可展开工具、用户补充、审批和结果；移除静态模拟进展。新增 owner 鉴权历史接口，通过统一服务门禁取得实例，路由回归覆盖实际 handler、登录和游标转发；独立 HTTP 游标分页恢复，与 SSE 按事件标识去重；详情切换任务时重建连接并隔离旧请求。
- 主要输入框在一个 Agent 任务执行中将文字补充发给该任务，失败保留草稿并复用幂等标识；多个未完成任务或新增附件明确提示。用户原文仍以加密 payload 保存，鉴权后按事件关联还原；旧事件与过期 payload 不伪造原文。
- 默认兼容模型执行循环在安全边界消费新输入，并把消费标识持久化到 checkpoint。公开模型文字与工具事件分开保存；不展示 reasoning 字段。新要求清除旧交付和语义验证缓存，收尾检查未消费输入并暂停，防止忽略补充后直接完成。最终验证已开始时保留用户草稿并拒绝插入。
- 定向上下文回归 8/8，连同 Runtime 回归 200/200；两个相关页面的六配置浏览器回归 210/210，其中新增用例 24/24，另有任务切换及停止确认重置回归 6/6；`pnpm check:core` 通过（前端 224、后端 687 passed / 100 opt-in skipped、邮件 7，含类型、lint 与构建）。浏览器为 mock，真实 DEV 模型与部署尚未验收。
- 本轮闭合单次运行内的协作；跨运行自动继承文件、版本关系与完整执行上下文仍待实现，执行中暂不接收新增附件，旧 OpenAI Responses 执行器尚未接入输入回调。没有环境变量、迁移、账号、权限、存储、支付或生产配置变化。

## 2026-09-22 通用文件完成判定修复（已部署 DEV，未发布生产）

- DEV `275dcdbd8295a50228c993f280e58b1770395ef6` 已修复报价并通过 live smoke；真实文件任务可以创建、执行、上传并通过单文件校验，但 CSV 这类未归入预设交付类型的文件被最终完成检查误判为纯文字任务，报 `AGENT_VERIFICATION_INCOMPLETE`。失败预算已释放，没有付费冻结或残留 reservation。
- 纯文字完成路径仅适用于 Runtime V2、零实际产物且零文件要求的任务；存在 CSV/TXT 等产物时走正常文件完成检查。V1 Worker 的最低文件数量明确为 1；仍要求全部文件校验通过、存在主要或可编辑产物、满足预设格式、轨迹与预算检查通过，V2 继续要求持久语义校验。
- 新回归先复现 V1 / V2 通用文件的错误拒绝；覆盖通用文件成功、缺少文件、校验失败、仅预览、CSV 不满足 XLSX、V2 语义校验、纯文字路径及重复完成不重复结算。相关 Runtime 定向测试 201/201、pnpm check:core 均通过；完整 CI 与候选部署后的真实复验以 PR 回执为准。
- PR #221、#222 完整 CI 通过并合入 dev；DEV API 与独立 Worker 对齐 `dbf39cfd8a0afaf9d2590d832f22da8898ed35d9`，live smoke 通过。真实合成 CSV 任务五步完成，刷新后记录与产物仍在；对象存储读回 57 字节，内容与 SHA-256 核对成功，预算已结算且无遗留冻结、reservation 或活动租约。尚未取得浏览器原生下载落盘证据。
- 没有修改历史失败任务状态、跳过验证、修改权限、凭据、支付或生产配置。平台账号记录未变化。

## 2026-09-22 DEV Worker 恢复与报价修复（报价修复候选，未发布生产）

- DEV 启动项的工作目录及 runner 路径失效，launchctl 无 PID 且报 `EX_CONFIG`。已保留私有回滚副本，修复路径，独立 Worker checkout 对齐已验证 DEV `d1bc100d39059d498ac24020a360504f857f6259`；按 DEV 原有按需启动策略保持 `RunAtLoad=false`、`KeepAlive=false`。
- 本机普通直连数据库超时，原有网络客户端缺少有效线路；经用户授权，从本机备份仅恢复原有线路并保留当前配置副本及其他设置。严格 TLS PostgreSQL 18 只读查询通过，没有更改数据库凭据、白名单、证书校验或防火墙保护。该证据证明连接已恢复，不足以确定直连路径上具体故障点。
- 启动前活动 Run、未过期租约、held / reserved 预算和近期在线 Worker 均为零。前台验证成功并正常退出后，启动唯一 DEV LaunchAgent；实际 API 确认 workerOnline、browserReady、egressVerified、desktopRelayReady 全为 true，同版本 DEV live smoke 通过。因可用内存不足，按既有策略降为并发 1；未开放 Runtime V2、subagents 或 scheduler。
- 真实任务在报价阶段暴露 `planToken` 未定义：校验代码误放在不接收该参数的 `quote` 中，导致普通报价 500，实际创建任务反而没有校验所提交的计划令牌。修复将令牌验证移到 `createRun`，在数据库访问和预算冻结前校验签名、用户、目标、修订与有效期；无令牌的既有入口保持兼容。
- 新增回归先复现普通报价失败及无效计划进入数据库的问题，覆盖报价与可负担性、无写入、伪造 / 过期 / 跨用户 / 目标或修订变化令牌拒绝，以及有效令牌和无令牌入口。定向回归 151/151、pnpm check:core 均通过；修复代码连接真实 DEV 数据库的只读报价验证通过。真实浏览器任务仍需候选部署后复验，不能将 Worker 就绪等同于端到端任务完成。
- 生产、支付和线上 S3 前缀未变；账号接管报告与运维手册已同步实际网络依赖和恢复方式。

## 2026-09-22 S3 新文件命名空间（开发候选，未启用）

- 新增可选 `S3_KEY_PREFIX`：新资产与直传 staging 同步使用配置前缀，保存的旧 URI 仍可读取；默认空值保持现有键格式。S3 适配器阻止前缀外的覆盖、删除和分片操作，避免 DEV 写操作触碰旧共桶对象；不替代独立存储凭据或 IAM。
- Mac Worker 支持从其环境专属 Keychain 读取该可选配置；启用前必须协调 API / Worker 版本及配置，并排空旧上传会话和已签发 URL。旧资产删除 / GC 暂受保护，需单独迁移。未修改任何线上存储配置、历史对象或数据库 schema。
- Worker 启动时清除继承自 shell 的 `S3_KEY_PREFIX`，仅使用所选环境 Keychain 的值，防止 DEV shell 把前缀带入生产 Worker；隔离启动回归验证 DEV 取其配置、生产未配置时保持空值。
- Aiven 已通过现有 Chrome 会话确认邮箱密码认证和现有 DEV PostgreSQL 服务。服务 Running、主机端口匹配、IP allowlist 开放；本机 TCP 仍超时，未将其误判为账号 / 白名单故障，也未扩大权限或修改网络配置。
- 定向资产与上传回归 14/14 通过；独立 PostgreSQL 16 + 固定版本 MinIO 验证带前缀的单文件 / 分片上传、恢复、取消、持久 URI、旧对象读取和越界删除拒绝，1/1 通过，临时容器已清理。该证据不代表线上命名空间已启用或 Worker 已恢复。
- `pnpm check:core` 通过：前端 221、后端 660、邮件 7，后端 100 项外部依赖 / opt-in 测试跳过；另行执行上述真实 S3/PG 集成。浏览器矩阵和完整 required CI 以候选 PR 的结果为准。
- 使用现有云端存储凭据和唯一临时前缀对新适配器做合成对象 smoke：前缀内写入/读取/删除、旧格式对象读取、前缀外删除拒绝与对象内容保持不变均通过；演练对象已清理、既有业务对象触碰数为零。API / Worker 的线上前缀配置仍未启用。

## 2026-09-22 平台账号接管与同步规则

- 新增现行 `docs/INFRA_ACCOUNT_REGISTER.zh-CN.md`，接替已退出当前文档体系的旧账号报告；开发必读规则、文档导航、运维指南、贡献规则和 PR 模板统一指向新报告。
- 新增或更新平台、账号、登录方式、权限、凭据存放位置、数据库 / 存储归属，以及发现旧记录过期时，必须在同一 PR 同步账号报告、受影响的 runbook 和正式 Handoff。报告记录核验日期与证据边界，个人身份、凭据和资源 ID 不进入 Git。
- 账号报告补充 DEV Aiven PostgreSQL 18、当前控制台认证待核验项及 DEV / 生产 S3 共桶事实；运维指南不再把尚未完成的 S3 命名空间隔离写为现状。没有更改平台权限、运行配置或生产部署。
- 用户提供的 Aiven 控制台登录资料已保存到 macOS Keychain，账号报告仅记录安全取用位置与“认证未核验”状态；凭据保存不代表注册、登录或数据库接管成功，未修改数据库凭据。

## 2026-09-22 PostgreSQL 同版本恢复工具（开发候选，未发布）

- 备份和只读审计增加 `PG_OPS_EXPECTED_MAJOR`：默认保留生产/本地 16，托管 DEV 显式选择 18；不改变生产启动或 DEV 数据库权限/TLS 边界。客户端查找优先匹配选定主版本，显式 `PG_BIN_DIR` 仍需版本验证。
- 恢复根据备份 manifest 校验源版本、pg_dump 版本、pg_restore 和目标库同主版本；清空目标前验证 SHA-256、字节数和归档可读性。新增 `NEON_DATABASE_URL` 源库保护，不允许恢复目标等于任何已配置源库或 manifest 源库；不提供跨版本迁移。
- 新增可重复 PostgreSQL 16/18 Docker 隔离演练并接入 Core CI，使用完整迁移和合成数据验证恢复内容、序列、额外 schema、账务审计，以及损坏文件不清空目标。普通单测默认跳过 Docker 演练，需显式运行。
- 本地版本与边界单测 22/22、两版本真实数据库恢复演练 2/2 通过；`pnpm check:core` 通过（前端 221、后端 655、邮件 7，后端 100 项外部依赖/显式 opt-in 检查跳过）。默认浏览器端口被其他进程占用，浏览器矩阵在独立端口与 PR CI 验证，最终结果以 PR 检查记录为准。线上备份、线上数据隔离恢复、S3 恢复、Worker 重启和生产回滚仍未验收，不能用合成数据通过替代。

## 2026-09-21 联合修复 DEV 验证记录（未发布生产）

- PR #215、#216、#217 已合入 `dev`，联合版本 `278427e243427fc691029327157c78ad31d8f812` 的 DEV `/api/meta`、healthz、readyz 和只读 smoke 通过；支付保持启用，商城四个套餐购买按钮正常且无整条不可用横幅。未创建订单或执行真实付款。
- 既有真实登录完成纯文字需求：返回三条文字，页面显示未创建付费任务，未出现图片执行卡；刷新后登录状态、同一会话和完整结果自动恢复。该证据不等同于账本审计或内容质量验收。
- 平台只读核对 DEV 与生产仍为 Free 实例；一次 DEV 冷启动期间 smoke 失败，唤醒后同 SHA 复核通过。Worker 状态仍为离线，生产仍未切换；上述证据不证明三端同 SHA 或常驻托管已完成。

## 2026-09-21 登录完成后的工作台刷新恢复（已部署 DEV，未发布生产）

- 修复 Cookie 验证完成但用户 ID 不变时，工作台缓存登录状态未失效的问题；Header 订阅登录事件后同步一次当前状态，刷新无需切换路由即可显示账户。
- 设计对话在异步登录完成后恢复 URL 指定或本机保存的最近会话，并加载历史；恢复请求单飞，已有会话和正在提交的草稿不会被恢复流程替换。临时读取失败保留会话 URL；可见性监听不再依赖登录是否赶在页面挂载前完成。
- 发送请求前设置规划状态，完成事件早于 POST 响应时不会重新显示处理中；消息按服务端标识去重，不重复插入已经由事件同步的消息。
- 同一用户 ID 登录/退出状态单测 2/2；Header、延迟登录、URL/最近会话、临时读取失败及新任务覆盖旧恢复请求在六个浏览器配置中 30/30 通过，加上文字执行边界/事件先后时序与既有设计对话，共 102/102 浏览器回归通过；`pnpm check:core` 通过。全部 API 使用 mock，不包含真实登录或生产发布证明。


## 2026-09-21 设计对话文字输出约束修复（API 已部署 DEV，Worker 未验收，未发布生产）

- PR #215 已通过完整 required CI 并合入 `dev`；DEV `/api/meta` 返回 `fd7466f6658c0e4ebd6ca177492e2ca597a21314`。该证据只证明 API 版本，不证明 Mac Worker 同 SHA 或真实模型链路已验收；支付策略误报由后续联合候选修正。

- 明确的纯文字要求优先于 Planner 与关键词路由修复；即使 Planner 返回图片、电脑 Agent 或本地工具路线，仍只保存终态文字回复，不授予附件上传或执行权限。
- 中文“不生成/请勿生成”和英文图片排除指令约束图片路由及 Agent 生图能力；没有明确的其他交付物时不再虚构报告，明确要求的非图片报告与正常图片请求保持原路径。
- 定向单测 23/23、临时 PostgreSQL 16 集成 3/3、Chromium/Firefox/WebKit 与桌面/移动/平板共 6 个浏览器配置的付费执行器回归通过；既有设计对话回归 60/60。回归先复现错误再验证修复，覆盖所有执行路线、中文/英文否定、附件不代表执行同意、正向交付物、终态持久化及报价拒绝；不包含真实模型、账户、扣费或生产验证。

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

## 2026-09-21 会话存储异常恢复（已部署 DEV，未发布生产）

- PR #214 已合入 `dev`，部署验收记录确认 Render 与 `/api/meta` SHA 为 `828db5dce3561be2761d34b58f117eae7ea722fb`，稳定后 `checkBetaSmoke` 通过；部署切换时一次 `/readyz` 502 后复核正常。该证据不包含 Worker 在线证明，DEV 数据库直连与 Worker 切换仍未完成，生产未发布。

- `/api/auth/session` 原先把会话存储暂时不可用也返回为匿名会话并清除 Cookie；现在服务端解析失败为 5xx 时返回 `503 SESSION_STORE_UNAVAILABLE` 并保留 Cookie，下一次检查可以正常恢复。真实失效或过期仍清除 Cookie，不改变权限检查。
- 后端会话回归 3/3、前端会话回归 10/10 通过；完整 core 通过（前端 219、后端 646、邮件 7；后端 97 跳过），隔离端口 OTP Chromium 回归 4/4 通过。默认 `pnpm check` 的浏览器阶段被已占用端口阻断，完整浏览器矩阵以本 PR CI 为准；覆盖暂时不可用、下一次恢复与真实过期；不将此问题认定为本轮浏览器短暂显示未登录的已确认根因。

## 2026-09-21 邀请制 Web Beta 发布契约（已部署 DEV，未发布生产）

- 首阶段为邀请制 Web Beta；密码注册、OTP 与 Google 自动建号都在账户创建层检查邀请，现有用户仍可登录，停用账号使用管理员入口。生产、DEV 与未知环境的公开注册默认关闭，环境变量不能越过发布策略开启。
- `/api/meta` 区分发布策略与实际配置：返回版本、API SHA、环境、配置能力与 `releasePolicy.violations`。配置不等于 readiness，也不能证明前端和 Worker 已部署相同 SHA。
- 自助支付统一使用已有 `PAYMENTS_ENABLED`；支付 API、readiness 与 metadata 共用解析器。删除此前只用于展示、未接入运行时的同义开关。Runtime V2 沿用 `AGENT_RUNTIME_V2_ENABLED`，实验能力若被实际开启会出现在策略漂移中。
- 蓝图增加邀请 Secret 声明，支付开关由平台管理、不由 Beta 模板强制关闭，并固定浅探针，生产使用常驻 starter。生成和 OTP 等开关仍待真实依赖验证后开启，蓝图不代表已完成供应商配置。
- `pnpm check:release-config` 检查蓝图并运行 smoke 工具回归；`pnpm smoke:beta` 按完整 SHA、环境与非 skipped readiness 进行只读检查。发布、管理员操作和恢复记录模板见 `docs/RELEASE_V0_CHECKLIST.zh-CN.md`。
- PR #213 已合入 `dev`，Render DEV 已部署 `9890ac57651a4d60fec2b7f1ac42a5796becbcfd`；平台 deployment 与 `/api/meta` 一致。该版本曾按旧范围关闭支付与子 Agent 并通过 smoke；当前支付决定见本节下方更新，子 Agent 仍关闭；非受邀注册实测返回 `403 INVITE_REQUIRED`。已配置受邀测试账户并完成 OTP 登录、项目创建、资料保存和重新加载；标准文生图实际生成成功，图片结果已进入项目版本列表，下载文件为有效 1024×1024 PNG；该文件作为风格素材重新上传成功，页面刷新后素材及版本仍在。仍不代表 Agent Worker 或恢复演练通过。
- 验证：独立工作树未复制本地 `.env`，`pnpm check:core` 通过（前端 218、后端 645、邮件 7 项测试通过，后端 97 项依赖外部环境的测试跳过）；认证/支付/元数据定向 98/98、smoke 工具 8/8、OTP 浏览器回归 4/4。真实恢复、Worker 重启、生产部署和邀请用户完整任务仍未验收。
- 本轮生产只读复核：Vercel 与 Render 的 `/healthz`、`/readyz` 正常，API 元数据均为 `47cc56b1e6f94713119e806220ac598c79362435`，仍是旧契约；不包含本 PR，也不证明前端构建或 Worker 的 SHA。

## 2026-09-21 保留既有支付能力（已部署 DEV，未发布生产）

- 用户确认既有爱支付能力保留，本轮仅不执行真实付款测试。Beta 策略与只读 smoke 不再要求 `selfServePayments=false`；DEV 与生产蓝图的 `PAYMENTS_ENABLED` 使用平台管理值，防止后续部署再次因 Beta 计划关闭支付。
- 商城移除整条“付费功能当前不可用”横幅；套餐读取期间与真实不可用时，购买按钮仍按服务端状态显示并禁用，不绕过支付校验。支付供应商、下单、回调和入账逻辑保持不变。
- 验证：`pnpm check:core` 通过，发布 smoke 回归 9/9；真实付款测试未执行。
- 仅恢复先前关闭的 DEV 支付开关；生产配置不变。本轮不创建付款订单，不发起真实支付，也不把套餐可读取表述为付款链路已重新验收。

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

# Artigen 协作规范

## 30 秒速览

**默认长期分支**：`main` 和 `test`。

**部署方式**：Railway 前端和后端分开部署，`main` 合并后自动触发线上部署；`test` 是团队测试分支，用来在上 `main` 前集中验证。

**协作方式**：所有非紧急改动先通过 PR 合入 `test`，验证通过后再从 `test` PR 到 `main`；每个 PR 至少 1 人 Review 通过后再合并。

**环境变量**：真实 key 只放在 Railway 或本地 `.env`，不提交到仓库。

**最低门禁**：合并前说明改了什么、影响哪里、怎么验证；涉及接口、环境变量、部署、点数、支付、鉴权的改动必须写清风险。

---

## 协作原则

1. **小步提交**：一个 PR 只解决一个清晰问题，避免把无关重构、功能和文档混在一起。
2. **先说明再改动**：PR 描述必须让另一个人不用猜就知道背景、改动、影响和验证方式。
3. **线上安全优先**：`main` 会自动部署，合并前默认把它当线上发布处理；`test` 用来承接日常测试和联调。
4. **文档同步**：接口、环境变量、部署方式、协作流程变化时，同步更新 README、PRD 或本文件。
5. **默认不直推长期分支**：除非线上事故需要紧急恢复，否则不要直接向 `main` 或 `test` push。
6. **不提交真实密钥**：任何 API key、SMTP 密码、支付密钥、管理员密码都不能进入 git。

---

## 分支规范

长期分支：

| 分支 | 作用 | 规则 |
| --- | --- | --- |
| `main` | 线上发布分支，Railway 自动部署。 | 只接收从 `test` 验证通过后的 PR，或紧急 `hotfix/*`。 |
| `test` | 团队测试分支，用于前后端联调和上线前验证。 | 接收日常功能、修复、文档 PR；验证通过后再合入 `main`。 |

日常开发从最新 `test` 拉分支：

```bash
git fetch origin
git switch test
git pull origin test
git switch -c feat/short-name
```

分支命名：

| 类型 | 格式 | 场景 |
| --- | --- | --- |
| 功能 | `feat/xxx` | 新页面、新功能、新接口。 |
| 修复 | `fix/xxx` | bug 修复。 |
| 文档 | `docs/xxx` | README、PRD、规范等文档。 |
| 重构 | `refactor/xxx` | 不改变功能行为的结构调整。 |
| 紧急修复 | `hotfix/xxx` | 线上问题快速修复。 |

命名要求：

- 使用英文小写、数字和短横线。
- 名字描述目的，不写人名和无意义词。
- 示例：`feat/credits-orders`、`fix/login-token`、`docs/contributing`。

---

## 提交规范

提交信息使用简化 Conventional Commits：

```text
type: summary
```

常用类型：

| 类型 | 含义 |
| --- | --- |
| `feat:` | 新能力。 |
| `fix:` | 修 bug。 |
| `docs:` | 文档。 |
| `refactor:` | 重构。 |
| `test:` | 测试。 |
| `chore:` | 工程杂项。 |
| `build:` | 构建或依赖。 |
| `revert:` | 回滚。 |

示例：

```bash
git commit -m "feat: add credits order filters"
git commit -m "fix: keep login token after refresh"
git commit -m "docs: add collaboration rules"
```

提交要求：

- summary 用一句话说清结果。
- 不写 `update`、`fix bug`、`改一下` 这类不可追踪描述。
- 同一个提交里不要混入无关改动。

---

## PR 规范

PR 是进入 `test` 或 `main` 前的最小审查单元。每个 PR 必须说明：

- 背景：为什么要改。
- 改动：具体改了什么。
- 影响范围：影响哪些页面、接口、部署、环境变量、数据。
- 验证方式：跑了哪些命令，看了哪些页面，请求了哪些接口。
- 风险：是否影响线上、支付、点数、登录、生成、文件访问。

PR 标题格式：

```text
type: summary
```

示例：

```text
fix: repair password login route
docs: add Artigen collaboration rules
refactor: remove legacy non-Artigen routes
```

### PR 描述模板

复制下面模板到 PR 描述里：

```markdown
## 背景

- 

## 改动

- 

## 影响范围

- 前端页面：
- 后端接口：
- 环境变量：
- 数据目录：
- Railway 部署：

## 验证

- [ ] `pnpm --dir frontend run type-check`
- [ ] `pnpm --dir frontend run test`
- [ ] `pnpm --dir frontend run build`
- [ ] `find backend -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check`
- [ ] 关键页面 smoke：
- [ ] 关键 API smoke：

## 风险和回滚

- 风险：
- 回滚方式：
```

如果是纯文档改动，可以只保留：

```markdown
## 背景

## 改动

## 验证

- [ ] 已阅读全文，确认没有旧项目或错误部署说明
```

---

## Review 规范

默认规则：

- 所有非紧急 PR 至少需要 1 人 approval。
- 作者不能把自己的 Review 当作 approval。
- Review 通过后再合并到目标分支。

目标分支规则：

- 日常功能、修复、文档：feature/fix/docs/refactor 分支 -> `test`。
- 上线发布：`test` -> `main`。
- 线上事故：`hotfix/*` -> `main`，必要时再同步回 `test`。

Review 重点：

1. **功能正确性**：是否解决 PR 描述的问题。
2. **线上风险**：是否影响 Railway 自动部署、线上环境变量、前后端连接。
3. **接口兼容**：请求字段、响应字段、认证方式、错误码是否清楚。
4. **点数和支付**：是否可能误扣点、漏扣点、重复入账、错误发放点数。
5. **登录和权限**：是否可能绕过用户鉴权或管理员鉴权。
6. **文件访问**：`/files/*` 是否仍满足游客、用户、管理员访问规则。
7. **删除范围**：删除文件时是否确认不是 Artigen 主链路。
8. **环境变量**：新增变量是否写入 README 或 PRD，是否没有真实 key。
9. **文档同步**：行为变化是否更新了相关文档。

Review 反馈建议使用明确语气：

- `blocker`：必须改，否则不能合并。
- `suggestion`：建议改，不阻塞。
- `question`：需要作者解释。
- `nit`：小问题，不阻塞。

---

## Railway 发布规范

当前部署事实：

- Railway 中前端和后端分别部署。
- Railway 环境变量在平台内配置。
- `main` 合并后会触发部署。
- `test` 是上线前测试分支；是否绑定 Railway 测试环境以 Railway 当前项目配置为准，文档默认不要求必须有独立测试环境。
- 本地没有线上 API key 时，AI provider 接口不通是正常现象。（因为本地环境没有配置 API key，所以不能请求 AI provider。）

合并到 `main` 前必须确认：

- 本次改动不依赖本地 `backend/memory` 数据。
- 没有提交真实 API key、SMTP 密码、支付密钥、管理员密码。
- 如果新增环境变量，已在 README 或 PRD 中写清变量名和作用。
- 如果改了 API base、CORS、`/api`、`/files`、登录、支付、点数，PR 中必须写清 Railway 影响。
- 前后端分离部署下，前端不能硬编码本地后端地址或线上私有地址。
- `test` 上相关页面和 API 已完成 smoke，且 PR 描述记录了验证结果。

发布后 smoke：

| 对象 | 检查 |
| --- | --- |
| 前端 | `/`、`/artigen`、`/artigen/ai`、`/artigen/tools`、`/login`、`/console` 可打开。 |
| 后端 | `/api/meta`、`/api/health`、`/api/credits/costs` 可返回。 |
| 登录 | 邮箱验证码、密码登录或 Google 登录至少确认一条可用链路。 |
| 生成 | 有线上 key 时确认 `/api/generate` 或 `/api/img2img` 关键链路。 |
| 文件 | 生成图片后的 `/files/*` 可访问。 |

---

## 前后端协作规范

### 接口变更必须写清

新增或修改接口时，PR 里必须说明：

- Method 和 path。
- 请求字段。
- 响应字段。
- 认证方式。
- 常见错误码。
- 是否影响点数、支付、图片历史、审计、usage ledger。

接口现状以 `PRD.md` 为准。接口变更后同步更新 `PRD.md`。

### 前端规则

- 统一通过 `frontend/src/utils/api.ts` 构造 API 地址。
- 不在页面里硬编码线上 API 域名。
- 不把 Railway 后端地址写死在组件里。
- 涉及登录态时使用现有 session/token 工具。
- 涉及点数时优先读取 `/api/credits/costs`，不要在页面里散落成本常量。

### 后端规则

- 不依赖本地 `backend/memory` 里的已有数据。
- 不新增未记录的环境变量。
- 不绕过 `assertAuthUserMatches` 或 `assertAdmin`。
- 支付、点数、登录、文件访问相关改动必须保留可审计记录。
- 新增路由时注意限流、认证和错误响应。

---

## 环境变量规范

环境变量分三类：

| 类型 | 存放位置 | 说明 |
| --- | --- | --- |
| 线上变量 | Railway 环境变量 | 真实 key、密码、支付密钥、管理员密码。 |
| 本地变量 | `backend/.env` 或本机 shell | 只在开发机使用，不提交真实值。 |
| 文档变量 | README / PRD | 只记录变量名、用途和默认行为。 |

新增环境变量时必须：

1. 使用清晰命名。
2. 在 README 或 PRD 写明用途。
3. 在 PR 描述中标注 Railway 是否需要新增。
4. 不提交真实值。

禁止提交：

- `GEMINI_API_KEY` 真实值。
- `SILICONFLOW_API_KEY` 真实值。
- `QQ_SMTP_PASS` 真实值。
- `ADMIN_KEY` 真实值。
- `CONSOLE_ADMIN_PASSWORD` 真实值。
- 支付或 webhook 私钥。

---

## 测试门禁

按改动类型选择测试，不要求每个纯文档 PR 都跑全量构建。

### 前端改动

```bash
pnpm --dir frontend run type-check
pnpm --dir frontend run test
pnpm --dir frontend run build
```

页面 smoke 至少覆盖相关页面。例如：

```text
/artigen
/artigen/ai
/artigen/tools
/artigen/image-workshop
/artigen/image-editor
/login
/console
```

### 后端改动

```bash
find backend -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
```

API smoke 按影响范围选择：

```bash
curl -sS http://localhost:8080/api/meta
curl -sS http://localhost:8080/api/health
curl -sS http://localhost:8080/api/credits/costs
curl -sS http://localhost:8080/api/auth/google/config
```

涉及生成和图片时，补充：

```text
POST /api/generate
POST /api/img2img
GET /files/*
```

本地没有线上 key 时，记录 provider 配置缺失即可，不把它当作代码失败。

### 文档改动

文档 PR 至少检查：

- 没有写入真实密钥。
- 没有描述已经剔除的旧项目为当前功能。
- Railway 前后端分离部署和 `main` 自动部署描述准确。
- 相关链接和文件名存在。

---

## 紧急修复流程

线上事故优先恢复服务。

允许使用：

```bash
git switch main
git pull origin main
git switch -c hotfix/short-name
```

紧急修复仍然需要：

- PR 描述事故现象。
- 写清修复点和影响范围。
- 至少做和事故相关的最小验证。
- 合并后在 Railway 验证线上恢复。
- 修复后把 `main` 的 hotfix 同步回 `test`，保持两个长期分支不分叉。

如果必须先恢复再补文档，修复后补一个文档或复盘 PR，写清：

- 事故原因。
- 修复方式。
- 影响范围。
- 后续防止方式。

---

## 禁止事项

以下行为默认不能合并：

- 提交真实密钥、密码、token、支付私钥。
- 非紧急情况直接 push 到 `main`。
- 非紧急情况直接 push 到 `test`。
- 绕过 Review 合并非紧急改动。
- 把本地 `backend/memory` 运行期数据当作业务代码提交。
- 删除 Artigen 主链路文件但不说明原因。
- 前端硬编码 Railway 或 localhost API 地址。
- 后端新增接口但不说明认证方式。
- 点数、支付、登录、文件访问改动没有验证说明。
- PR 描述只有“改了一下”“修复 bug”。

---

## Artigen 主链路保护清单

这些能力属于当前 Artigen 主链路，改动时必须在 PR 中明确说明影响和验证：

- `/artigen/*`
- `/console/*`
- `/login/*`
- `/api/generate`
- `/api/img2img`
- `/api/auth/*`
- `/api/login/*`
- `/api/credits/*`
- `/api/pay/*`
- `/api/images/history/*`
- `/api/admin/*`
- `/api/usage/*`
- `/api/collection/event`
- `/api/proxy/image`
- `/files/*`
- AI 配料表链路：`agentimg_ingredient_label`、`ingredient_label`、`IngredientLabel.vue`、`IngredientLabelTypeSelect.vue`、`ingredientLabel.ts`

---

## 文档维护规则

文档分工：

| 文档 | 负责回答 |
| --- | --- |
| `README.md` | 项目是什么、怎么启动、从哪里读代码。 |
| `PRD.md` | 产品模块、前后端连接、接口、认证、点数、支付、生成和数据约定。 |
| `CONTRIBUTING.md` | 分支、提交、PR、Review、发布、测试和协作规则。 |

触发文档更新的情况：

- 新增或修改接口。
- 新增或修改环境变量。
- 修改 Railway 部署方式。
- 修改登录、支付、点数、文件访问、生成链路。
- 新增重要页面或删除重要页面。
- 协作流程变化。

---

## 合并前自检

合并前问自己：

1. 这个 PR 的目的是否一句话能讲清。
2. 是否包含无关改动。
3. 目标分支是否正确：日常改动进 `test`，发布改动从 `test` 进 `main`。
4. 是否影响 Railway 自动部署。
5. 是否新增或依赖环境变量。
6. 是否影响登录、点数、支付、生成、文件访问。
7. 是否需要更新 README、PRD 或 CONTRIBUTING。
8. 是否已经写清验证方式。
9. 是否有人 Review 通过。

如果以上有任何一个答案不确定，先在 PR 里写清楚，不要让 reviewer 猜。

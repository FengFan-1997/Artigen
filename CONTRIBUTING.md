# Artigen 协作规范

完整环境、接入、发布和回滚说明见
[《Artigen 项目、环境与发布总手册》](./PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

## 1. 分支模型

长期分支：

| 分支 | 用途 | 部署 |
| --- | --- | --- |
| `dev` | 集成与线上测试 | 自动部署到 DEV |
| `main` | 已验证的正式代码 | 不自动发布；生产需人工确认 |

`test` 已废弃。`codex/artigen-overhaul` 是迁移期生产来源，完成迁移后不再接收日常改动。

日常开发：

```bash
git fetch origin
git switch -c feat/short-name origin/dev
```

允许的分支名：

- `feat/*`
- `fix/*`
- `docs/*`
- `refactor/*`
- `chore/*`
- `hotfix/*`
- Codex 工作分支可使用 `codex/*`

除紧急恢复外，不直接 push `dev` 或 `main`。

## 2. 标准流程

```text
功能分支
  -> PR 到 dev
  -> CI 通过
  -> 合并并自动部署 DEV
  -> DEV smoke 通过
  -> dev PR 到 main
  -> Release gate 通过
  -> 合并 main
  -> 人工发布生产
```

DEV 没有验证记录，不能创建 `dev -> main` PR。

## 3. 提交代码

提交信息使用：

```text
type: summary
```

示例：

```bash
git status --short
git add <明确的文件>
git diff --cached
git commit -m "feat: add image workflow"
git push -u origin feat/image-workflow
```

常用 `type`：

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `build`
- `revert`

一个提交只做一件事，不混入无关格式化或用户本地改动。

## 4. 本机门禁

代码改动：

```bash
pnpm check
```

开发过程可先运行：

```bash
pnpm check:core
```

纯文档改动至少运行：

```bash
pnpm check:workspace
git diff --check
```

新增环境变量时同步更新：

- `backend/.env.example`
- README 或对应 runbook
- PR 的“环境变量”小节

真实值不能提交。

## 5. 进入 DEV

```bash
gh pr create --base dev --head <功能分支>
```

PR 必须通过仓库 CI。合并后 Render 自动部署：

- URL：<https://dev-artigen-app-fengfan.onrender.com/artigen>
- Service：`dev-artigen-app-fengfan`
- Database：`dev_artigen`

DEV 验证必须记录：

- commit SHA
- deploy ID
- `/api/meta`
- `/readyz`
- 受影响页面/API
- 浏览器控制台
- 未验证能力

DEV 默认关闭真实支付、邮件 OTP 和收费 AI。关闭的能力显示 skipped 不等于真实链路通过。

## 6. 进入 main

只有 DEV 通过后：

```bash
gh pr create --base main --head dev --fill
```

允许进入 `main` 的来源：

- `dev`
- `hotfix/*`
- 迁移期一次性允许 `codex/artigen-overhaul`

必要条件：

- `Release gate` 成功
- DEV 证据完整
- Review 对话已解决
- 风险和回滚写清
- 数据库迁移已在 DEV 应用

合并 `main` 不会自动发布生产。

## 7. Review 重点

必须关注：

1. 功能是否符合 PR 描述。
2. 是否影响登录、Cookie、CSRF、管理员权限。
3. 是否可能误扣点、重复结算或错误入账。
4. 是否改变 PostgreSQL 结构或迁移顺序。
5. 是否可能泄露 prompt、图片、文件或用户信息。
6. 是否新增生产环境变量。
7. 是否把本机/DEV 地址硬编码到生产。
8. 是否提供回滚方式。

反馈标签：

- `blocker`：必须修复
- `suggestion`：建议改进
- `question`：需要解释
- `nit`：非阻塞小问题

## 8. 生产发布

生产部署从 `main` 选定不可变 commit，人工发布 Vercel 和 Render，并做生产 smoke。

迁移期生产仍跟踪 `codex/artigen-overhaul`。在 PR #2 和 PR #1 完成前，不从落后的
`main` 发布，也不擅自修改生产分支设置。

详细命令、平台 ID、健康检查和回滚见总手册。

## 9. 禁止事项

- 提交密码、Token、数据库 URL、API Key 或平台 Environment Export。
- 直接 push `main` 或绕过 `Release gate`。
- DEV 未验证就发布生产。
- 前端提交客户端价格或硬编码生产 API。
- 绕过 Cookie/Origin/CSRF、管理员复核或资产所有权检查。
- 直接修改生产钱包余额代替账本化补偿。
- 把 `backend/memory` 当生产业务数据。
- 在不了解影响时执行破坏性数据库命令。

## 10. 文档同步

以下变化必须更新文档：

- 平台或域名
- 分支和 CI
- 环境变量
- 数据库迁移
- 登录、支付、点数、生成、文件
- 发布或回滚流程

总入口：

- `PROJECT_OPERATIONS_GUIDE.zh-CN.md`
- `README.md`
- `PRD.md`
- `DEV_ENVIRONMENT_RUNBOOK.zh-CN.md`
- `PRODUCTION_RUNBOOK.zh-CN.md`

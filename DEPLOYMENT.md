# Artigen 部署说明

最后核验：2026-07-27

## 当前生产拓扑

| 层 | 平台与地址 |
|---|---|
| 用户前端 | Vercel：<https://artigen-fengfan.vercel.app/artigen> |
| API 与任务 | Render：<https://artigen-app-fengfan.onrender.com> |
| 健康检查 | <https://artigen-app-fengfan.onrender.com/healthz> |
| 数据库 | Neon PostgreSQL，项目 `Artigen Production` |
| 图片 | Neon Object Storage，S3 兼容 |
| 邮件中继 | Vercel：<https://artigen-mail-relay.vercel.app> |
| DEV | Render：<https://dev-artigen-app-fengfan.onrender.com/artigen> |

生产前端项目为 `artigen-fengfan`；生产 Render 服务为 `artigen-app-fengfan`，区域 Virginia；DEV 服务为 `dev-artigen-app-fengfan`。Render 免费实例可能冷启动。

## 分支关系

- `codex/artigen-overhaul`：当前生产来源。
- `dev`：开发环境来源。
- `main`：GitHub 默认分支；在迁移完成并人工确认前，不应被误认为当前生产来源。

更完整的账号、环境变量、备份、恢复和回滚说明位于生产分支的 [`PRODUCTION_RUNBOOK.zh-CN.md`](https://github.com/FengFan-1997/Artigen/blob/codex/artigen-overhaul/PRODUCTION_RUNBOOK.zh-CN.md) 与 [`ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md`](https://github.com/FengFan-1997/Artigen/blob/codex/artigen-overhaul/ARTIGEN_INFRA_ACCOUNT_AUDIT.zh-CN.md)。

真实密钥只保存在 Render、Vercel、Neon 或 macOS Keychain，不进入 GitHub。

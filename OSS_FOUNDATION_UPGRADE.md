# Artigen 开源底层升级运行手册

本文记录 `codex/oss-foundation-upgrade` 相对 `codex/artigen-overhaul` 的部署顺序、开关、回滚路径和验收基线。升级不改变登录、支付、价格、点数账本、Provider 产品逻辑，也不改变 `/api/tool-tasks*` 与 `/api/assets/:id` 的既有响应结构。

## 升级前后基线

基准提交为 `origin/codex/artigen-overhaul` 的 `10c1524`。同一台开发机使用 Node 24、pnpm 10 和相同命令采样；构建时间是本地单次墙钟值，只用于发现明显回退，不作为跨机器 SLA。

| 指标 | 升级前 | 当前分支 | 结果 |
| --- | ---: | ---: | --- |
| 前端单测 | 53 files / 195 tests | 56 files / 203 tests | 新增 Dexie、codec 和上传覆盖，不删除旧覆盖 |
| 后端单测 | 300 tests | 301 tests（本地 264 pass / 37 integration skips） | PostgreSQL/MinIO 用例由 CI 提供服务后执行 |
| 首屏 JavaScript gzip | 75.6 KiB | 85.3 KiB | +9.7 KiB，低于 250 KiB 门禁 |
| 生产构建墙钟 | 17.57 s | 17.19 s | 无明显回退 |
| 默认任务并发 | 每实例 2，最大 8 | 保持每实例 2，最大 8 | 行租约继续保证 Provider 单次派发 |

jSquash、Uppy 和 Dexie 不进入首屏同步依赖：Uppy 在文件直传时加载，Dexie 随相应业务路由加载，codec JavaScript/WASM 只在 Worker 中按需加载。

## 部署与迁移顺序

1. 先部署代码并执行 PostgreSQL 迁移 `012_asset_upload_sessions`，保持 `TASK_QUEUE_DRIVER=legacy`、`DIRECT_ASSET_UPLOADS=0`。迁移只新增上传会话表，不回填旧任务、资产或浏览器数据。
2. 在 staging 将 `TASK_QUEUE_DRIVER=pgboss`，确认 `pgboss` schema 可创建、`artigen-tool-task-v1` 可消费，并验证多实例、进程退出恢复、取消、dead letter、冻结过期及启动对账。
3. 仅在共享 S3/R2 与 CORS 配好后，将 `DIRECT_ASSET_UPLOADS=1`。分别 smoke 单 PUT、multipart 恢复/取消、重复完成、越权、伪造类型、像素炸弹和暂存清理。
4. 前端 TanStack Query、Dexie 与 codec Worker 无生产开关；它们保持原 service/type 签名、IndexedDB schema 和 Canvas 回退，可与前两项后端开关独立发布。
5. staging 指标稳定后，再分别启用生产 pg-boss 与直传。不要一次同时切两个服务端开关。

## 环境变量与回滚

| 能力 | 开启 | 回滚 |
| --- | --- | --- |
| pg-boss | `TASK_QUEUE_DRIVER=pgboss` | 改回 `legacy` 并滚动重启；业务任务仍以 `tool_tasks` 为准 |
| pg-boss worker | `TASK_WORKER_ENABLED=1` | 设为 `0` 停止当前实例消费，不删除业务任务 |
| pg-boss schema/pool | `PGBOSS_SCHEMA=pgboss`、`PGBOSS_POOL_MAX=5` | 回滚驱动后 schema 可保留，禁止在回滚窗口直接删除 |
| 直传 | `DIRECT_ASSET_UPLOADS=1` 且 `ASSET_STORAGE_DRIVER=s3`/`r2` | 设为 `0`；浏览器自动回退原 multipart 路径 |
| S3 兼容 | `S3_ENDPOINT`、`S3_BUCKET`、region 与 credentials | 回滚直传前不要撤销正在使用的凭证；暂存 GC 会继续清理 |

切回 legacy 不需要把 pg-boss job 数据复制回业务表。关闭直传不影响已完成 asset，也不改变任务 `inputAssets`。Dexie 直接读取原数据库，回退旧前端仍能读取相同 store；版本变化或写入失败时当前页面会话保留并产生明确的 `artigen-storage-error` 事件。

## 验收清单

- `pnpm check` 全绿，包括 Chromium、Firefox、WebKit、两种手机尺寸与 iPad 尺寸。
- PostgreSQL 16 并发测试证明多个实例只派发一次 Provider；已设置 `provider_dispatched_at` 的任务不会自动重发。
- CI MinIO 覆盖单 PUT、multipart、恢复、取消、幂等完成、所有权、内容伪造、像素限制和暂存清理。
- Dexie 测试先通过原生 IndexedDB 写入旧 schema，再验证项目、资产和待恢复任务可读。
- codec 覆盖 PNG/JPEG/WebP 魔数、目标尺寸、alpha 输入、EXIF orientation 策略、取消和内存上限；不比较跨浏览器完全一致的输出字节。
- 首屏 JavaScript gzip 不超过 250 KiB；构建输出中 jSquash WASM 保持独立资源。

## 外部检查边界

GitHub 上若继续出现 Cloudflare Workers 相关检查，它不属于当前 Vercel 前端、Render 后端和 PostgreSQL 部署链。本分支不修改 Cloudflare 项目、GitHub 仓库设置或生产环境，也不把该外部检查混入代码改造；在 Draft PR 中单独记录状态，由仓库管理员决定是否移除或重配检查。

# 2026-07 开源底层升级记录

> **历史快照，不得用于当前部署或运维。** 本文压缩自旧 `OSS_FOUNDATION_UPGRADE.md`，只记录当时的架构迁移意图。

该阶段引入或加固了：

- pg-boss PostgreSQL 任务投递；
- S3/R2 单 PUT 与 multipart 直传；
- TanStack Vue Query、Dexie 与 Worker 内按需图片 codec；
- 服务端 magic-byte、像素和对象持久化校验；
- PostgreSQL 业务表继续作为任务、计费和资产元数据真源。

升级时采用先迁移、再灰度队列、最后启用直传的顺序，并保留能力开关作为回滚手段。当时的分支名、测试数字、迁移序号和构建体积只适用于该历史提交，不能推断当前状态。

当前依赖与许可证见 [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md)，现行部署与回滚流程见 [`PROJECT_OPERATIONS_GUIDE.zh-CN.md`](../../../PROJECT_OPERATIONS_GUIDE.zh-CN.md)。

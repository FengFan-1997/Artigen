# 账号体系与按账号记忆隔离（Token 认证）- 开发记录

**日期：** 2026-01-05  
**范围：** Backend 账号/记忆 API + Frontend 请求携带 token

## 1. 本次做了什么

### 1.1 后端：把登录/注册返回的 token 变成“真实会话”

- `/api/auth/register`：注册时生成 `sessionToken`，写入 `backend/memory/users.json`，并在响应里返回同一个 token。
- `/api/auth/login`：登录时生成新的 `sessionToken`（覆盖旧 token），写入 `users.json`，并在响应里返回该 token。

这样 token 不再是“前端存着但后端不认”的占位字段，而是可以用来保护账号数据访问的凭证。

### 1.2 后端：对账号相关数据接口做“按账号隔离”校验

对以下接口增加校验逻辑：

- `GET /api/user/:userId`
- `POST /api/user`
- `GET /api/chat/history/:userId`
- `GET /api/memory/:userId`
- `POST /api/memory/ingest`
- `POST /api/chat`（当 userId 不是 guest_ 时）

规则：

- `userId` 以 `guest_` 开头：允许无 token（仍然按该 userId 单独落文件）。
- 非 `guest_`：必须携带 `Authorization: Bearer <token>`，并且 token 必须属于同一个 `userId`，否则返回 401/403。

### 1.3 前端：把已保存的 token 带上去

- 新增 `getAuthToken()` 读取本地 token。
- Agent 的后端请求统一在 header 上携带：`Authorization: Bearer <token>`（存在才携带）。

覆盖调用点：

- `POST /api/chat`
- `GET /api/user/:userId`、`POST /api/user`
- `GET /api/chat/history/:userId`
- `POST /api/memory/ingest`

## 2. 关键文件

- 后端： [server.js](file:///g:/AvuePro/newPro/backend/server.js)
- 前端 auth： [index.ts](file:///g:/AvuePro/newPro/frontend/src/auth/index.ts)
- 前端 Agent 请求： [aiService.ts](file:///g:/AvuePro/newPro/frontend/src/agent/services/aiService.ts)
- 前端本地记忆上报： [useLocalMemory.ts](file:///g:/AvuePro/newPro/frontend/src/agent/composables/useLocalMemory.ts)

## 3. 接口用法摘要

### 3.1 登录/注册

- `POST /api/auth/register` → 返回 `{ userId, name, token }`
- `POST /api/auth/login` → 返回 `{ userId, name, token }`

### 3.2 访问受保护资源（非 guest_）

所有请求需加 header：

- `Authorization: Bearer <token>`

并且 URL/Body 中的 `userId` 必须等于 token 对应的 `userId`。

## 4. 下一步计划（2-5 个模块内）

1. 给后端补一个 `POST /api/auth/logout` 用于主动失效 token（可选，但对多端/安全更完整）。
2. 让前端在 token 失效时自动回退到 guest_ 会话，并提示“需要重新登录”。
3. 把 `GET /api/memory/:userId` 接入 AgentDebug（方便确认“当前账号读到的记忆文件是谁”）。


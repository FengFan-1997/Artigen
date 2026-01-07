# Agent 开发简报：国内模型加载策略 + 全局账号基础（2026-01-05）

时间：2026-01-05

## 本次做了什么

### 1) HuggingFace 资源代理：增强国内可用性与可观测性

- 后端 HF 代理默认候选源扩展为：`hf-mirror.com` → `hf.co` → `huggingface.co`（按顺序尝试）
- `/api/hf/:owner/:repo/resolve/:ref/*` 支持通过查询参数指定偏好源：`?preferBase=mirror|hf|huggingface`（或 `?base=`）
- `/api/hf` 代理失败时，响应里会带上 `status / preferBase / triedBases`，便于定位是哪个上游不可用
- `/api/health` 增加 `hf.resolveBases / hf.apiBases / hf.baseHealth`，方便在 Zeabur 上直接看 HF 代理的健康状态与冷却状态

说明：清华 TUNA 的 `hugging-face-models` 镜像已在 2021 年移除，当前更现实可用的是 `hf-mirror.com` 或者在部署侧配置可访问 HuggingFace 的代理出口。

### 2) 全局账号系统：从 Agent 内迁出并兼容旧 key

- 新增全局模块 `frontend/src/auth`，提供 `getUserId / loginUser / registerUser / logoutUser / isLoggedIn`
- 新增全局 `frontend/src/utils/api`，提供统一的 `buildApiUrl`（同时兼容 `VITE_API_BASE` 与 `VITE_AGENT_API_BASE`）
- `frontend/src/agent/utils/user.ts` 变为“转发出口”，保持现有 Agent 代码不需要大改
- 兼容老的 localStorage key：自动读取/写入 `agent_user_id`，避免旧用户数据断档

## 你现在可以怎么用（部署/本地）

### HF 代理（推荐）

- 前端尽量使用 `/api/hf/...`（当前 VRM/Live2D 默认已走这个代理）
- 如需强制指定镜像优先级：
  - `/api/hf/...?.preferBase=mirror`
  - `/api/hf/...?.preferBase=huggingface`

### Zeabur 环境变量建议

- `HF_RESOLVE_BASES=https://hf-mirror.com,https://hf.co,https://huggingface.co`
- 若 Zeabur 侧访问外网也受限，再额外设置：
  - `HTTPS_PROXY=...`（需要你有可用的代理出口）

## 目前仍做不到但确实需要的东西（留痕）

- 彻底“国内无外网也可用”的模型加载：需要把 VRM/Live2D 资源迁移到可国内直连的对象存储/CDN（或自建镜像/缓存层）。仅靠前端改 URL 无法保证稳定。

## 下一步准备做什么（2-5 个模块）

1) 增加后端“模型文件缓存层”（按文件哈希落盘 + TTL/上限控制），减少对外网依赖与加速二次访问  
2) 在 AgentDebug 增加“一键检测模型加载链路”面板：检测 `/api/health`、校验 `resolve` 可用性、输出诊断包  
3) 完善全局账号体系 UI 路由（补齐 `/auth` 路由与跳转），并将用户 profile 编辑能力接入到通用页面


# Agent 逻辑补强简报：HF 落盘缓存 + 调试自检面板（2026-01-05）

时间：2026-01-05

## 本次开发的模块（2 个）

### 模块 A：后端 HuggingFace 代理的落盘缓存（核心逻辑）

目标：在国内/弱网环境减少对 HuggingFace 的实时依赖，让 VRM/Live2D 资源二次加载稳定且更快。

已完成：

- 在 `backend/server.js` 的 `/api/hf/:owner/:repo/resolve/:ref/*` 增加落盘缓存
  - 先尝试从本地缓存命中（支持 `HEAD` 与 `Range` 请求）
  - 未命中时走上游拉取；对 `GET + status=200 + 非 Range` 的响应进行“边转发边落盘”
- 增加淘汰策略（按 mtime 近似 LRU）：
  - 超过 `HF_CACHE_MAX_BYTES` 或 `HF_CACHE_MAX_FILES` 会删除最旧文件
- `/api/health` 增加 HF 缓存状态与占用数据，便于 Zeabur 上排障

可配置环境变量（后端）：

- `HF_CACHE_DIR`：缓存目录（默认 `backend/cache/hf`）
- `HF_CACHE_TTL_MS`：缓存有效期（默认 7 天；`0` 表示永不过期）
- `HF_CACHE_MAX_BYTES`：缓存最大字节数（默认 1GB）
- `HF_CACHE_MAX_FILES`：缓存最大文件数（默认 2000）

### 模块 B：AgentDebug 增加“模型加载链路”自检面板（核心胶水）

目标：让你可以在浏览器里不写代码就判断“模型为什么加载失败/走了哪个镜像/是否命中缓存”。

已完成：

- `frontend/src/views/AgentDebug.vue` 增加“模型加载链路”面板
  - 一键拉取 `/api/health`
  - 对指定 HF 资源做 `HEAD` 测试
  - 对指定 HF 资源做 `Range bytes=0-1023` 测试（更接近真实加载场景）
  - 一键复制测试 URL
- 导出的反馈包 JSON 中补充 `backendHealth` 与 `hfTestResult` 字段，方便复现排查

## 你现在可以怎么验证（最短路径）

1) 打开 `/agent-debug`  
2) 在“模型加载链路”里点：
   - `刷新 /api/health` 看 `hf.cache.usage` 是否增长
   - 先 `HF HEAD`，再 `HF Range`，看响应状态码与 headers
3) 若 Zeabur 国内访问仍失败：
   - 检查 `HF_RESOLVE_BASES` 是否包含 `hf-mirror.com` 置顶
   - 若 Zeabur 本身无法出海，则必须配置可用的 `HTTPS_PROXY` 或迁移资源到国内可直连存储

## 下一步计划（候选 2-5 个模块）

1) 增加“缓存命中/回源”指标：在 `/api/health` 中给出命中率与最近命中样本  
2) 增加后端“缓存预热”接口：启动后按配置预拉取常用 VRM/Live2D 文件  
3) 在 Agent 侧提供“模型切换时自动跑 Range 自检”的轻量流程，失败时给出可读错误与建议


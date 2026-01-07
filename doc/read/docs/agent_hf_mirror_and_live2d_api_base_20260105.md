# Agent 开发简要记录：HF 镜像与 Live2D 资源加载基址修复

时间：2026-01-05

## 本次完成

1. Live2D 资源基址统一走 API Base
   - Live2D 默认资源基址从固定相对路径调整为根据 `VITE_API_BASE / VITE_AGENT_API_BASE` 生成的绝对地址，避免前后端分离部署时浏览器请求打到错误的域名。
   - 相关实现：`frontend/src/agent/components/Live2DWidget.vue`

2. Cubism2 资源 URL 规范化后补全 API Base
   - 当 Live2D 模型配置里出现 `https://huggingface.co/...` / `https://hf-mirror.com/...` 等绝对 URL 时，会先转换为 `/api/hf/...`，再补全为带 API Base 的绝对 URL，保证跨域部署一致可用。
   - 相关实现：`frontend/src/agent/live2d-widget/cubism2/LAppModel.js`

3. 后端 HF 列表接口增加 `hf.co` 作为备用 API Base
   - `/api/hf-list` 获取模型元信息时，增加 `https://hf.co` 作为候选，提升在不同网络环境下的成功率。
   - 相关实现：`backend/server.js`

## 影响范围

- 主要影响 Live2D（Cubism2/Cubism3）模型资源的拉取路径；VRM 的 `/api/hf` 代理路径此前已使用 API Base，不在本次变更范围内。

## 下一步准备做

1. 在 Zeabur 环境验证：
   - 前端设置 `VITE_API_BASE` 指向后端服务域名；
   - 打开 `/agent-debug` 执行 HF HEAD / Range 测试；
   - 切换 Live2D 模型并确认贴图/动作资源均能加载。

2. 若国内仍不可用：
   - 在 Zeabur 后端环境变量中显式设置 `HF_RESOLVE_BASES` / `HF_API_BASES`，将可用镜像域名放在最前（例如 `https://hf-mirror.com,https://hf.co,https://huggingface.co`）。

## 必要但目前无法保证的点

- 任何镜像域名（包括 `hf-mirror.com` / `hf.co`）的可用性受网络与服务方策略影响，代码侧只能通过“多候选 + 回退 + 缓存”尽量提高成功率，无法做到 100% 永久在线可用。


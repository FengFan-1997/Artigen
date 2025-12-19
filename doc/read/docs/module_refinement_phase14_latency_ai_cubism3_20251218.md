# 模块优化 Phase14：交互延迟审计 + AI 节流去重 + Cubism3 性能优化（2025-12-18）

## 本次完成

### 1) Agent ↔ Live2D 交互热点与延迟来源审计（结论）

- 浏览器输入事件（`mousemove/click`）是高频源，必须先本地即时反应，否则任何网络调用都会产生“晚到的情绪”。
- AI 调用的核心延迟来自：网络 RTT + 后端推理时间 + 前端解析/执行动作的排队等待。
- Live2D 的高频更新主要集中在：眼神追踪（POI）与表情/动作切换的重复调用；需要在前端做去抖/去重/阈值更新。

### 2) 系统事件本地快速反应 + AI 后台节流汇总

- 本地交互（连续点击、鼠标绕圈、拖拽碰撞等）继续即时触发 `motion/expression/bubble`，保证“实时感”。
- 将“需要 AI 细腻补充”的系统事件改成批量汇总再请求（避免每个事件都打一次 AI）。
- 背景反应保留冷却窗口（默认 4s），同一时间段事件合并成一个 `System Event Batch` 给 AI。

### 3) AI 请求去重缓存与可取消逻辑

- 为 chat 请求加入可取消逻辑：新消息会取消旧请求，避免乱序回包导致 UI/动作回滚。
- 对话框关闭时会取消 chat 请求并终止相关请求组。
- AI service 支持按 kind 或全局取消请求，并保留短 TTL 缓存减少重复问答成本。

### 4) Cubism3 motion/expression 运行时开销优化

- Cubism3 motion group / expression 名称解析加入缓存，减少每次动作触发时的扫描与字符串归一化开销。
- Cubism3 POI（眼神）更新减少对象分配，并在 idle 回正时复用对象。
- Live2D 管理器对 `expression` 与 `POI` 加入节流/去重（短时间同值/微小变化直接忽略），避免无意义更新把主线程压满。

## 关键改动文件

- `frontend/src/agent/components/Agent.vue`
- `frontend/src/agent/services/aiService.ts`
- `frontend/src/agent/services/Live2DModelManager.ts`
- `frontend/src/agent/live2d-widget/cubism3/index.ts`

## 下一步计划（建议）

- 把“角色人设/动作协议”抽成独立配置（按 modelId 存储），并提供一个 UI 面板在线调整。
- 为 `System Event Batch` 增加本地评分（强度/频率/重复度），让 AI 更好理解“逗她/惹她/让她害羞”的程度。
- 为 Cubism3 增加简单 profiler（每 N 帧统计一次 `update`/参数写入次数），进一步定位性能瓶颈。

## 需要但目前缺失的东西

- 每个 Cubism3 模型的标准化动作组/表情命名表（否则 AI 虽能给出动作建议，但落地到不同模型会出现缺失/替代）。


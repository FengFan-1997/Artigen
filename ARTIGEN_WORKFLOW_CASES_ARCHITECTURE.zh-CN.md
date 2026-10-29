# Artigen 对抗式 Agent 与可复现案例库架构设计

状态：架构草案（2026-09-09）  
范围：Agent 工作流、Human-in-the-loop、交付物、项目记忆、可分享案例与回放

## 1. 产品定义

Artigen 增加两项能力：

1. **对抗式质量回路**：主 Agent 在关键产出后提交质疑请求，由 Challenger Agent 检查目标、约束、事实、结构、风险与验收条件；主 Agent 依据结构化质疑进行一次或多次受限修订。高风险结论暂停并交给用户。
2. **可复现案例**：把一次真实工作保存为可分享的事件时间线、状态快照、产物引用和记忆快照。导入者可以加速回放过程，并在案例终点以新的用户身份继续执行。

案例不是视频，也不是只读日志。回放结束后，导入案例必须能恢复到案例终点的可继续工作状态。

## 2. 设计原则

- **事件是事实，快照是加速**：事件时间线是审计和重放真相；快照用于快速加载和断点恢复。
- **原案例与导入副本隔离**：导入者拥有新案例、新项目和新资产引用，不能写入原用户数据。
- **语义一致，身份隔离**：保留任务、选择、产物、记忆和工作流语义；不复制原账号授权、Cookie、Token、私密连接和外部系统会话。
- **回放与真实执行分离**：回放阶段不调用付费模型、不写外部系统、不重复扣费；继续执行时才创建新的真实 Run。
- **高风险可暂停**：普通质疑自动闭环；涉及外部写操作、敏感数据、重大事实不确定性、费用或不可逆动作时，必须进入 Human-in-the-loop。
- **可解释**：每次质疑都记录触发原因、证据范围、主 Agent 响应、修订差异、验证结果和最终采纳理由。

## 3. 核心对象

| 对象 | 作用 |
| --- | --- |
| `case` | 可分享的案例逻辑容器，记录版本、可见性和终点状态 |
| `case_event` | 用户、Agent、子 Agent、Challenger、UI、状态和产物事件 |
| `case_checkpoint` | 某一事件序号的可恢复状态快照 |
| `case_artifact` | 产物的内容或不可变资产引用、版本和校验值 |
| `case_memory_snapshot` | 导入可用的项目记忆快照，区分用户确认内容和运行时临时内容 |
| `case_share` | 分享链接、访问策略、过期时间和撤销状态 |
| `case_import` | 一次导入操作及其源案例版本、脱敏报告和新资源映射 |
| `challenge_cycle` | 一次质疑、回应、修订、验证闭环 |
| `replay_session` | 某个用户对案例的回放进度、倍率和当前事件游标 |

## 4. 事件协议

`case_event` 采用 append-only 结构，至少包含：

```json
{
  "eventId": "uuid",
  "caseId": "uuid",
  "sequence": 184,
  "occurredAt": "2026-09-09T10:00:00.000Z",
  "logicalTimeMs": 932000,
  "actor": { "kind": "user|agent|subagent|challenger|system", "id": "stable-local-id" },
  "type": "user.message|hitl.question|hitl.answer|agent.phase|challenge.opened|challenge.resolved|artifact.created|memory.committed|ui.state|run.status",
  "visibility": "replay|audit|private",
  "payload": {},
  "payloadSha256": "...",
  "causedBy": ["event-id"],
  "snapshotRef": null
}
```

规则：

- `sequence` 在案例内单调递增，不能重写或删除；修正通过新事件表达。
- `logicalTimeMs` 用于加速回放，与真实墙钟时间分离。
- `payload` 按事件类型严格校验；reasoning、凭据和未授权的内部 Prompt 不进入可分享事件。
- Agent 原始工具调用继续留在现有运行审计边界；案例事件只引用必要的摘要、输入/输出哈希和可回放结果。
- 每个终态和每个 HITL 选择都必须产生 checkpoint，避免回放无法从用户选择处继续。

## 5. 案例生命周期

### 5.1 录制

从用户登录后的任务入口开始建立录制上下文。现有 `agent_events`、运行状态、交付物、项目记忆确认、行为事件和前端状态变化通过 Case Recorder 归一化为 `case_event`。录制不改变原 Run 的计费和执行语义。

### 5.2 封存

案例结束时生成 `case_manifest`：源 Run、事件数量和哈希链、终点 checkpoint、产物清单、记忆清单、可继续能力、风险标签、模型/Skill 版本和脱敏结果。只有 manifest 校验通过，案例才可分享。

### 5.3 分享与导入

分享链接指向不可变的案例版本，而不是当前可变数据库行。导入时：

1. 验证签名、版本、权限和资源完整性；
2. 创建新的 `case_import`、项目、会话和资产映射；
3. 复制或引用不可变产物，禁止引用原用户可变路径；
4. 恢复用户确认过的项目记忆，并标记来源为 `imported_case`；
5. 生成脱敏报告和导入摘要；
6. 从起始事件创建 replay session。

### 5.4 回放

回放引擎从起点 checkpoint 开始按 `logicalTimeMs` 播放事件。UI 订阅回放事件流，进度条显示案例逻辑进度而不是网络等待时间。倍率只影响展示间隔，不跳过必须展示的 HITL、质疑、失败、修订和交付节点。

### 5.5 终点恢复与继续

到达终点时加载终点 checkpoint，切换到 `case_completed` 状态。用户可以查看完整历史，也可以点击“继续执行”：系统以导入副本的上下文创建新 Run，携带记忆、产物、历史结论和未解决风险；新 Run 的计费、权限、审计和外部副作用完全重新计算。

## 6. 对抗式质量回路

关键节点由 TaskSpec/Skill 标记 `challengePolicy`：`off`、`recommended`、`required`。默认对文案、方案、结构化计划、文件交付和最终结论启用 `recommended`。

每个 `challenge_cycle` 包含：

1. `challenge.opened`：主 Agent 产出版本、验收条件和可审查证据范围；
2. Challenger 输出结构化问题：`severity`、`category`、`claim`、`evidence`、`impact`、`suggestedFix`；
3. 路由器判定：自动修订、再次验证或 HITL；
4. 主 Agent 提交修订版本和逐条回应；
5. Verifier 验证；
6. `challenge.resolved` 固化采纳、拒绝、用户决定和最终版本。

硬边界：最多两轮自动修订；预算达到 70% 后只允许有限修订和验证；涉及外部写操作、敏感信息、不可逆动作、模型无法证明的关键事实或连续两轮同类失败时，必须 `waiting_user`。

## 7. 脱敏与安全边界

导出阶段运行确定性 Scrubber，扫描结构化字段、文本、文件元数据和资产清单，移除或替换：账号标识、邮箱、OTP、Cookie、Token、API Key、数据库 URL、内部路径、Worker/主机标识和第三方会话句柄。替换使用案例内稳定占位符，保证回放前后一致。

以下内容默认保留：用户任务语义、用户选择、Agent/Challenger 行为、阶段、质疑与修订、产物正文、产物版本、项目记忆中已获用户确认的字段、UI 状态和验证结果。

原始私密数据不放进分享包；若用户拥有权限，可在原账户内查看私有审计副本。导入资产使用新的授权范围和生命周期，案例删除时按引用计数回收。

## 8. API 草案

```text
POST   /api/cases/from-run
GET    /api/cases/:caseId
POST   /api/cases/:caseId/publish
POST   /api/cases/import
POST   /api/cases/:caseId/replay-sessions
GET    /api/cases/:caseId/replay-sessions/:sessionId/events (SSE)
POST   /api/cases/:caseId/replay-sessions/:sessionId/seek
POST   /api/cases/:caseId/continue
GET    /api/cases/:caseId/artifacts/:artifactId
GET    /api/cases/:caseId/memory
POST   /api/agent-runs/:runId/challenges/:challengeId/input
```

`continue` 永远创建新的 Run，不把导入案例的终点 Run 重新置为 running。回放 SSE 支持游标、断线补发和幂等；seek 只能跳到已物化 checkpoint，避免通过跳跃绕过 HITL 或安全节点。

## 9. 数据库与存储落地

第一阶段新增迁移建议：

- `agent_cases`
- `agent_case_versions`
- `agent_case_events`
- `agent_case_checkpoints`
- `agent_case_artifacts`
- `agent_case_memory_snapshots`
- `agent_case_shares`
- `agent_case_imports`
- `agent_challenge_cycles`
- `agent_replay_sessions`

案例事件正文使用现有加密载荷工具；可查询字段只放类型、序号、时间、哈希、状态和资源 ID。大文件继续使用现有 asset storage，案例表保存不可变版本和引用血缘。

## 10. 分阶段交付

### Phase 1：可审计录制

建立 Case Recorder、manifest、事件哈希链和终点 checkpoint；接入现有 Agent Run、HITL、artifact、memory commit 和 UI 状态事件。只支持当前用户私有回放。

### Phase 2：对抗式 Agent

增加 Challenger tool profile、challenge cycle、自动修订上限、风险路由和 HITL 卡片；先覆盖文案、计划和最终交付验证。

### Phase 3：分享与导入

完成 Scrubber、不可变案例版本、分享链接、资产复制、记忆快照导入和权限隔离。

### Phase 4：加速回放与继续执行

完成 replay session、SSE 回放、倍率、seek/checkpoint、终点恢复和 `continue` 新 Run；补齐跨浏览器和断线恢复测试。

### Phase 5：案例库产品化

增加案例列表、搜索、标签、版本、复制、撤销分享、删除和案例质量统计；所有案例操作进入现有审计体系。

## 11. 首批验收标准

- 一个真实“二次元游戏企划册”任务能够录制完整用户/Agent/HITL/产物/记忆事件。
- 导入者以新身份导入后，10 倍速回放可见关键节点，事件顺序与终点状态一致。
- 回放完成后继续执行，新 Run 能读取历史产物和导入记忆，但不会复用原 Run 的费用、租约或外部授权。
- Challenger 至少发现一个预置缺陷，主 Agent 自动修订并由 Verifier 固化结果。
- 高风险动作会暂停为 HITL；用户选择可在回放中重现，并能从该点继续。
- 分享包中不存在凭据和原用户会话；导入资产权限、删除和审计可追踪。

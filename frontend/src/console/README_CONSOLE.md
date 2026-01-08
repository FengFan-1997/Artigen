# Nth Me Console（管理台）对外说明

## 1. 模块定位
Nth Me Console 是一个内嵌在前端项目中的「管理台/用户控制台」原型，用于在不依赖真实后端的情况下演示：

- 积分（Credits）充值/扣减/流水
- 用户列表与等级管理（Free/Pro/Enterprise）
- 生成内容与行为日志的查看
- 基础的个人资料与 API Key（模拟）管理

入口路由：`/console`

## 2. 访问入口与路由

- Console 根路由与子页面注册：[router/index.ts](file:///g:/AvuePro/newPro/frontend/src/router/index.ts#L222-L264)
- 管理台布局（侧边栏 + 顶部栏）：[ConsoleLayout.vue](file:///g:/AvuePro/newPro/frontend/src/console/ConsoleLayout.vue)
- 页面视图目录：[src/console/views](file:///g:/AvuePro/newPro/frontend/src/console/views)

当前子页面包含：

- Overview：`/console` → [Dashboard.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Dashboard.vue)
- Playground：`/console/playground` → [Playground.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Playground.vue)
- Billing：`/console/billing` → [Billing.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Billing.vue)
- Usage：`/console/usage` → [Usage.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Usage.vue)
- Settings：`/console/settings` → [Settings.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Settings.vue)
- Users：`/console/users` → [UserManagement.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/UserManagement.vue)
- Audit：`/console/audit` → [ContentAudit.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/ContentAudit.vue)

## 3. 数据与持久化（当前为原型实现）

### 3.1 数据源
管理台的数据来自 Pinia Store：[console.ts](file:///g:/AvuePro/newPro/frontend/src/stores/console.ts)

- 存储键：`console_store_v1`
- 初始化：`init()` 首次进入时从 localStorage 加载数据，若当前用户不存在则自动创建
- 当前用户识别：通过 [login/session.ts](file:///g:/AvuePro/newPro/frontend/src/login/session.ts#L19-L52) 的 `getCurrentUserId()` 获取 userId

### 3.2 核心数据模型

User（`ConsoleUser`）：[console.ts](file:///g:/AvuePro/newPro/frontend/src/stores/console.ts#L5-L13)

Transaction（`Transaction`）：[console.ts](file:///g:/AvuePro/newPro/frontend/src/stores/console.ts#L15-L23)

- `type` 支持：`recharge | usage | admin_gift | refund`
- `amount`：正数代表增加积分，负数代表扣减积分

## 4. 关键功能与行为约束

### 4.1 Overview（概览）
[Dashboard.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Dashboard.vue)

- 展示：当前余额（Credits）、账号等级、UserId、Email
- 趋势图：基于交易流水（仅统计负数扣减）聚合最近 7 天的消耗趋势
- 初始化兜底：首次进入会触发 `consoleStore.init()`，若本地无该 userId 则创建一个默认用户

### 4.2 Billing（充值与订单）
[Billing.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Billing.vue)

- 充值按钮会模拟支付延迟，并通过 `consoleStore.updatePoints(userId, credits, 'recharge', ...)` 增加积分
- 订单列表来自 `transactions` 中 `type === 'recharge'` 的记录

### 4.3 Playground（生成模拟器）
[Playground.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Playground.vue#L164-L219)

- 生成前校验：积分不足（< 5）时阻止生成
- 单次生成成本：固定扣减 5 Credits（`updatePoints(..., -5, 'usage', ...)`）
- 同时写入：
  - `generatedContent`（生成内容记录）
  - `logs`（行为日志，`logActivity`）

### 4.4 User Management（用户管理）
[UserManagement.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/UserManagement.vue)

- 列表：展示所有本地用户（来自 store.users）
- 调整积分：通过 `updatePoints(..., 'admin_gift', ...)` 写入一条流水并更新余额
- 修改等级：通过 `updateUserLevel(userId, level)` 更新（Free/Pro/Enterprise）
- 详情抽屉：查看该用户的交易流水与行为日志（getUserTransactions/getUserLogs）

### 4.5 Usage（用量/流水视图）
[Usage.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Usage.vue)

- 把交易流水映射为“用量记录”展示（包含 usage/admin_gift/refund）
- 当前为纯前端筛选与展示，不做服务端分页/鉴权

### 4.6 Settings（设置）
[Settings.vue](file:///g:/AvuePro/newPro/frontend/src/console/views/Settings.vue)

- Profile：展示 userId，支持模拟保存 displayName 与通知开关
- API Keys：支持生成/撤销“模拟 key”（仅在内存中维护列表，生成时弹窗展示一次）

## 5. 说明（重要）

- 这是原型实现：数据仅保存在浏览器 localStorage，清理站点数据会丢失
- 真实生产版通常需要补齐：服务端鉴权、服务端账本、审计落库、内容存储与合规策略等

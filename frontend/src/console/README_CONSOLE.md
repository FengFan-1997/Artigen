# Artigen 运营后台

## 定位

`/console` 是 Artigen 的内部运营与审计后台。它不是浏览器本地数据原型，用户、钱包、
订单、行为和审计的权威数据均来自服务端。旧的 `console_store_v1` 只保留非敏感 UI
配置，不可作为余额、订单或日志的数据源。

## 页面

| 路由 | 页面 | 权威数据 |
| --- | --- | --- |
| `/console` | 运营总览 | PostgreSQL 聚合指标 |
| `/console/users` | 用户管理 | `users`、`sessions`、`wallets` |
| `/console/credits` | 点数账本 | `wallet_ledger`、`wallets`、`credit_holds` |
| `/console/behavior` | 用户行为 | `behavior_events` |
| `/console/logs` | 系统审计 | `audit_events`、限流统计 |
| `/console/audit` | 内容审计 | 脱敏生成、图片与调用元数据 |
| `/console/usage` | 模型用量 | usage 与 generation 事件 |
| `/console/settings` | 系统设置 | 当前管理员和非敏感配置 |

`/console/billing` 和 `/console/playground` 只作为旧书签兼容入口，分别重定向到点数账本
和用户行为。

## 登录与权限

后台只接受 `/api/admin/login` 返回的短时 Bearer token。生产环境还会在每次请求时查询
PostgreSQL `administrators`，账号被停用或角色被撤销后，已有 token 也立即失效。

| 角色 | 能力 |
| --- | --- |
| `operator` | 读取总览、用户、点数、行为、用量和审计 |
| `admin` | 包含读取能力，并可调点、停用/恢复用户和处理支付补偿 |
| `owner` | 包含全部后台能力和管理员治理 |

管理员登录账号和密码是后台身份认证，不是 DEV 站点外层的 HTTP Basic 访问口令。两层
认证用途不同，均不得写入仓库或浏览器持久存储。

## 行为采集

前端初始化后会记录公开产品页面的：

- `page_view`：净化后的页面路径；
- `ui_click`：优先使用显式行为属性或 `data-testid`；否则只以净化后的站内链接、
  CSS class 和元素类型生成稳定操作标识；
- 会话、项目、登录用户或匿名访客的 opaque reference；
- 时间与粗粒度设备类别。

后台 `/console` 自身不进入产品行为统计，避免运营操作污染用户漏斗。

不会采集输入框文字、按钮 `innerText`、prompt、模型输出、图片/文件 URL、密码、Token、
API Key 或原始 IP。IP 只保存哈希，User-Agent 只保存 desktop/mobile/tablet/bot
类别。`BEHAVIOR_EVENT_RETENTION_DAYS` 默认 90 天，允许范围 7–365 天；写入时会
按小时触发一次过期清理。

## 关键管理接口

| Method | Path | 最低角色 |
| --- | --- | --- |
| `GET` | `/api/admin/me` | operator |
| `GET` | `/api/admin/overview` | operator |
| `GET` | `/api/admin/users` | operator |
| `POST` | `/api/admin/users/status` | admin |
| `POST` | `/api/admin/users/credits` | admin |
| `GET` | `/api/admin/credits/ledger` | operator |
| `GET` | `/api/admin/behavior/events` | operator |
| `GET` | `/api/admin/behavior/summary` | operator |
| `GET` | `/api/admin/audit/events` | operator |

用户停用会在同一事务中更新状态、撤销全部有效会话并写入
`admin.user.status_changed` 审计事件。点数调整通过钱包服务写入不可变账本和可归因审计，
不得直接修改前端余额。

## 数据库与迁移

行为表由 `backend/migrations/013_behavior_events.js` 创建。发布包含该页面的版本前，
DEV 必须成功应用迁移并验证：

```bash
curl --user "artigen-dev:${DEV_PASSWORD}" \
  https://dev-artigen-app-fengfan.onrender.com/readyz
```

生产启动通过 `start:production` 在监听端口前获取 advisory lock 并执行 pending
migration；失败时服务不会带着旧 schema 启动。

## 开发与验证

```bash
pnpm type-check
pnpm test
pnpm build
```

后台变更至少覆盖：

1. 登录面不允许静态管理员 key。
2. operator 无法执行写操作。
3. 用户状态变更撤销会话并写审计。
4. 点数列表读取不可变账本。
5. 行为净化不泄露内容、URL、凭证或原始网络标识。
6. 所有列表支持服务端分页与筛选。

完整分支、DEV、PR 和生产流程见仓库根目录
`PROJECT_OPERATIONS_GUIDE.zh-CN.md` 与 `CONTRIBUTING.md`。

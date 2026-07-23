## 背景

- 为什么要改：

## 改动

-

## 影响范围

- [ ] 前端页面
- [ ] 后端 API
- [ ] PostgreSQL / 迁移
- [ ] 登录 / 权限
- [ ] 点数 / 钱包 / 支付
- [ ] AI Provider / 模型 / prompt
- [ ] 文件 / 对象存储
- [ ] 环境变量
- [ ] Vercel / Render 部署
- [ ] 仅文档

说明：

## 本机验证

- [ ] `pnpm check`
- [ ] 纯文档改动：`pnpm check:workspace`、`git diff --check`
- [ ] 相关页面/API smoke

结果：

## DEV 验证

功能分支进入 `dev` 后填写；`dev -> main` 发布 PR 必填。

- DEV commit：
- Render deploy ID：
- `/api/meta`：
- `/readyz`：
- 页面/API：
- 浏览器控制台：
- 未验证能力及原因：

## 风险与回滚

- 风险：
- 回滚 commit / 功能开关 / 操作：

## 发布确认

- [ ] 目标分支正确
- [ ] 没有提交真实密钥或 Environment Export
- [ ] 新增环境变量已更新示例和文档
- [ ] 数据库迁移已在 DEV 验证
- [ ] `dev -> main` 前 DEV smoke 已通过
- [ ] 合并 `main` 后仍需人工发布生产

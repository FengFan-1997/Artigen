# Agent 工作空间开发与验收

阶段：本地候选，尚未部署 DEV 或 Production。适用于创建页、Agent 工作台与运行详情。

## 数据与职责

导航投影使用已有项目、设计会话和独立 Run，不创建第二套会话生命周期。`GET /api/workspace/navigation` 对会话分页；会话改名/调整归属经所有权检查。关联执行的 Run 不重复列入导航。历史独立任务和未归类内容保留。

公开过程消息和最终正文存入现有加密 payload，`message.created` SSE 只携带引用。Worker 使用稳定回合键去重，旧租约不能写入。分页读取 `/api/agent-runs/:runId/messages`；游标保留数据库微秒精度，避免同一毫秒内重复分页。私有分析、工具参数和凭据不进入公开内容；旧正文不补造。设计会话使用已有执行、计费和审批来源，读取既有 `/history` 补历史调用。

增量迁移 `032_workspace_files_and_messages` 增加文件/版本/仓库绑定表、公开消息唯一键与后续会话来源。内容继续使用原对象存储资产，旧资产首次显示为只读来源；编辑时引用原资产建立版本0，新内容建立新资产和版本。保存同时携带基础版本与哈希，冲突返回409并保留草稿。版本引用的资产受删除与GC保护；项目彻底删除后再进入原清理链路。空文本只在显式编辑器路径允许。

## 文件与本机边界

- 编辑UTF-8文本，上限1MiB，保留BOM；二进制不进入文本编辑。图片、Markdown、PDF及隔离静态HTML按内容类型展示，其余下载打开。
- Chrome的`showDirectoryPicker()`只连接所选目录，不递归扫描磁盘；展开目录才读取，最多1000项。句柄按账号/项目保存在IndexedDB，新根目录生成独立身份，防止同名文件写错目录。
- 连接目录不上传。本机/云端文件主动加入会话后，普通图片/PDF仍作为普通附件；最多1MiB文本另记录基础哈希与来源。未保存文件必须先保存。
- `fileEditTargets`验证上传资产归属、内容哈希及云来源项目；本机来源只作为不可信客户端引用。服务端为文本目标分配`revision-N.txt`，模型按该明确名称交付完整候选；保持既有工具schema和已冻结Runtime配置兼容。V2每回合上下文及恢复路径都保留文件契约。
- 候选产生真实差异，逐文件确认后再次核对磁盘哈希再写入。外部修改拒绝覆盖；写入失败不显示成功；当前编辑会话可撤销最近一次应用。已完成Run通过关联设计会话发起后续执行，不向只支持文字的运行中input接口追加附件。
- 草稿按账号/项目/目录根/文件隔离，总量5MiB；敏感配置和密钥文件不缓存、不加入云上下文。保存、主动丢弃后清除；容量或权限失败明确提示。关闭标签和切项目会处理未保存修改，对象URL在关闭/重载时释放。

## GitHub 配置

复用既有OAuth及加密Token。Secret管理中配置`GITHUB_OAUTH_CLIENT_ID`、`GITHUB_OAUTH_CLIENT_SECRET`，设置`GITHUB_OAUTH_REDIRECT_URI`，或用`APP_ORIGIN`/`PUBLIC_ORIGIN`派生`/api/integrations/github/callback`。开发者在GitHub OAuth App中配置相同回调；不把凭据写入仓库或文档。

每个项目可绑定一个仓库，面板读取PR、提交和文件patch。查询连接器固定GET、限制响应体积，保留完整的30项分页和长patch；不执行仓库提交、推送、合并或创建PR。撤销账号授权沿用既有集成管理，解除项目绑定只删除该项目映射。

本地没有配置OAuth，因此真实授权仓库验收仍需配置后完成。浏览器截图的PR/提交是合成API数据；不能当成GitHub或线上执行证明。本轮没有实际新增账号或变更Secret，所以无需改账号报告。

## 本地验证与回退

相关验证：前后端单元、独立PostgreSQL迁移/存储集成、系统Chrome Playwright、类型、lint、构建及文档检查。低磁盘环境可用`playwright.workspace.config.ts`关闭录像，使用已安装Chrome，不下载浏览器或ffmpeg。

```sh
pnpm --filter personal test
pnpm --filter personal type-check
pnpm --filter personal lint
node --test backend/tests/workspace-pg-integration.test.js
ARTIGEN_E2E_CHROME_CHANNEL=1 pnpm --filter personal exec playwright test -c playwright.workspace.config.ts e2e/workspace-replica.spec.ts --project=chromium-desktop
```

数据库集成额外要求独立本地数据库和`RUN_WORKSPACE_PG=1`；不设置时明确跳过，不能称为通过。真实Chrome目录服务应单独验证原生选择、读写与外部冲突，不能由模拟句柄测试代替。端到端真实模型候选生成仍需DEV的模型、Worker与OAuth配置，合成UI验收不代替这项。

发布先应用兼容迁移/后端，再切前端，经原DEV/Production门禁。回退应用版本保留文件和消息；032拒绝自动down，避免删除用户内容。新供应商、模型、支付、生产Free决定均不在本轮修改范围。

## 与现有 DEV 工作流整合

保留原产物来源及继续修改、执行中补充要求、失败规划重试与已上传附件恢复。历史公共事件来自既有`/history`及其独立游标，新正文来自加密`/messages`；真实历史未迁移时继续渲染，已匹配的新正文不重复展示。账号或会话变更使旧历史请求失效。CI Core显式启用`RUN_WORKSPACE_PG=1`验证迁移和文件/消息权限。

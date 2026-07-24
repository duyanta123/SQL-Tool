# SQL Visualizer

本地优先的 SQL ER 图与数据流可视化工具。Web 版在浏览器内解析 SQL；Windows 桌面版还可以只读连接本机 SQLite、MySQL 和 PostgreSQL，使用真实 Schema 补全图形。

## Windows 下载

[下载安装版](https://github.com/duyanta123/SQL-/releases/latest/download/SQL-Visualizer-Setup.exe) · [下载便携版](https://github.com/duyanta123/SQL-/releases/latest/download/SQL-Visualizer-Portable.exe) · [查看全部发布](https://github.com/duyanta123/SQL-/releases)

安装版支持选择安装目录；便携版无需安装即可运行。数据库连接能力仅在 Windows 桌面版提供。

## 主要能力

- ER 图与数据流图：支持 SELECT/JOIN、CTE、子查询、CREATE TABLE/CTAS、INSERT、UPDATE、DELETE。
- 普通 SELECT 会显示投影、JOIN、WHERE、HAVING 中可明确归属的字段，并标记为“推断”；未限定字段不会强行归类。
- 字段合并优先级：SQL DDL > 数据库 Schema > SQL 推断。
- MySQL、MariaDB、PostgreSQL、SQLite、SQL Server、BigQuery、Athena、DB2、Hive、Redshift、Flink SQL、Trino、Snowflake（实验性）解析器按需加载。
- 节点拖拽、缩放、自动布局、适应内容、PNG/SVG 导出，以及移动端 320px/390px 画布布局。
- IndexedDB 多工作区、`.sql` / `.sqlviz` 导入导出和仅包含 SQL 的本地分享链接。

团队协作、在线数据库连接、服务端同步和任意 SQL 执行不在本项目范围内。

## Web 版开发

```bash
npm install
npm run dev
```

Web 版没有 Node 权限。数据库入口会明确显示“仅桌面版可用”，其余 SQL 编辑和可视化能力不受影响。

## Windows 桌面版

开发启动（先构建 Web 资源，再启动 Electron）：

```bash
npm run desktop:dev
```

生成 Windows NSIS 安装包和便携版：

```bash
npm run desktop:pack
```

产物默认位于 `release/`。桌面版使用 `contextIsolation: true`、`nodeIntegration: false`、sandbox preload，并且只暴露以下 IPC：

- `database.testConnection`
- `database.introspectSchema`
- `database.disconnect`
- `database.listProfiles`
- `database.saveProfile`

数据库驱动只在 Electron 主进程动态加载，不会进入 Web 包：

- SQLite：`better-sqlite3`，以 `readonly` 和 `query_only` 模式打开用户选择的文件。
- MySQL：`mysql2`，只调用参数化的 `information_schema` 元数据查询。
- PostgreSQL：`pg`，只调用参数化的 `information_schema` 元数据查询。

应用不提供任意 SQL IPC，不上传 SQL、数据库内容或连接凭据。

## 密码和工作区

- 默认不保存密码。未保存密码的连接在当前桌面进程中可继续刷新；重启后需要重新输入。
- 勾选“使用系统安全存储记住密码”后，主进程使用 Electron `safeStorage` 加密，密文仅写入 Electron 用户数据目录。
- IndexedDB 工作区、`.sqlviz` 和分享链接不会写入明文密码；导出器还会防御性移除任何名称包含 `password` 的字段。
- `.sqlviz` v2 可包含无密码的最近 Schema 快照和表选择，便于离线打开；v1 文件和 `schemaVersion: 1` 的旧 IndexedDB 记录会自动迁移。
- 分享链接始终只包含工作区名称、SQL、方言、视图和节点位置，不包含 Profile ID、密码或完整 Schema。

## Schema 范围和同步

ER 图可以切换“当前 SQL”和“数据库 Schema”。当前 SQL 会使用已连接数据库的真实列定义补全相关表；数据库 Schema 只渲染当前勾选的表。数据流图始终只基于当前 SQL。

连接成功后默认全选所有表。可按 Schema/表名搜索和取消勾选。自动同步默认关闭；启用后立即刷新一次，随后每 30 秒刷新。新增表默认加入选择，手动取消的表保持取消，已删除表会从选择和画布中移除。同步失败时保留上一次有效快照并显示 stale 状态。

## 常见连接问题

- SQLite：确认文件存在、当前 Windows 用户有读取权限，且文件不是需要专用加密扩展的数据库。
- MySQL：确认主机/端口、数据库名和账号正确；账号至少需要读取 `information_schema` 的权限。
- PostgreSQL：确认 `pg_hba.conf`、监听地址、端口和 Schema 名；默认 Schema 为 `public`。
- `ECONNREFUSED`：数据库服务未启动、端口错误或只监听了其他地址。
- `ETIMEDOUT`：检查防火墙、VPN、容器端口映射或数据库监听地址。
- `Access denied` / `password authentication failed`：重新输入密码，或删除旧系统凭据后再次保存。
- Windows 打包时原生模块失败：删除 `node_modules` 后重新执行 `npm install`，再运行 `npx electron-builder install-app-deps`。

## 验证

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

E2E 默认使用本机 Chrome，覆盖桌面、390×844 和 320×740。数据库单测使用临时 SQLite 文件及 MySQL/PostgreSQL mock，不要求 CI 中存在真实数据库。

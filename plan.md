# 家庭 Todo 清单 —— 实现计划

> 依据 `design.md`。每个任务为**可独立验证的原子单元**，按 TDD 红-绿-重构循环执行。
> 测试框架：`node:test`（内置）+ `supertest`。测试命令：`npm test`。

## 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 运行时 | Node 20 | 环境已有 |
| Web 框架 | `express@^4.19` | 稳定成熟 |
| 密码哈希 | `bcryptjs` | 纯 JS，alpine 镜像无需编译原生模块 |
| 会话 | `cookie-session` | 无状态签名 Cookie，重启不掉登录，无需额外存储 |
| 测试 | `node:test` + `node:assert` + `supertest` | 零额外构建 |

## 目录结构

```
family_planning/
  package.json  .gitignore  .dockerignore
  Dockerfile  docker-compose.yml  docker-compose.https.yml  Caddyfile
  README.md  requirement.md  design.md  plan.md
  src/
    server.js            # 启动入口
    app.js               # 导出 createApp()（供测试）
    config.js            # 环境变量集中管理
    store/db.js          # todo.json 载入、内存态、串行原子写
    domain/users.js      # 用户注册/查找/校验
    domain/families.js   # 家庭创建/加入/退出/成员 + 指派回收
    domain/tasks.js      # 任务 CRUD、可见性、状态迁移、指派校验
    domain/reports.js    # 完成统计聚合 + CSV 序列化
    routes/{auth,tasks,families,reports}.js
    middleware/{auth,error}.js
  public/
    index.html  manifest.webmanifest
    css/style.css
    js/{api,ui,auth,filter,chart,tasks,report,family,app}.js
  test/
    helpers.js  db.test.js  users.test.js  families.test.js
    tasks.test.js  reports.test.js
    api.auth.test.js  api.tasks.test.js  api.families.test.js  api.reports.test.js
  data/                  # 数据卷挂载点（.gitkeep）
```

---

## 批次 1：项目骨架与存储层

### 任务 1：初始化项目与依赖
- **文件**：`package.json`、`.gitignore`、`data/.gitkeep`、目录骨架
- **描述**：`npm init` 产出 `package.json`；依赖 `express`、`cookie-session`、`bcryptjs`；开发依赖 `supertest`。`scripts.test = "node --test test/"`、`scripts.start = "node src/server.js"`。`.gitignore` 忽略 `node_modules/`、`data/*.json`、`data/*.bak`
- **验证**：`npm install` 成功；`npm test` 可运行（无用例时通过）
- **依赖**：无
- **预计**：5 分钟

### 任务 2：配置模块 `src/config.js`
- **文件**：`src/config.js`
- **描述**：集中读取环境变量并给出默认值：`PORT=3000`、`DATA_FILE=data/todo.json`、`SESSION_SECRET`（生产必填，开发给固定 dev 值并告警）、`TRUST_PROXY=false`、`ALLOW_REGISTRATION=true`、`TZ=Asia/Shanghai`
- **验证**：单元测试断言默认值与环境变量覆盖生效
- **依赖**：任务 1
- **预计**：5 分钟

### 任务 3：存储层 `src/store/db.js` —— 载入与默认结构
- **文件**：`src/store/db.js`、`test/db.test.js`
- **描述**：实现 `load()`：文件不存在时返回 `{version:1,users:[],families:[],tasks:[]}`；存在则解析 JSON；解析失败抛错交由上层处理。暴露 `getState()`
- **验证**：测试覆盖「文件不存在」「空对象」「正常解析」三种情况
- **依赖**：任务 2
- **预计**：5 分钟

### 任务 4：存储层 —— 串行原子写
- **文件**：`src/store/db.js`、`test/db.test.js`
- **描述**：实现 `mutate(fn)` 与内部 `flush()`：`JSON.stringify` → 写 `todo.json.tmp` → `fsync` → `rename` 当前文件为 `todo.json.bak` → `rename` tmp 为正式文件。所有写操作串行排队（Promise 链），保证不交错
- **验证**：并发调用 50 次 `mutate` 后文件内容完整且为合法 JSON；`.bak` 存在
- **依赖**：任务 3
- **预计**：5 分钟

> **检查点 1**：确认存储层测试全绿后再进入批次 2。

---

## 批次 2：用户与鉴权

### 任务 5：用户领域 `src/domain/users.js`
- **文件**：`src/domain/users.js`、`test/users.test.js`
- **描述**：`createUser({username, password})`（校验 3–20 字符、密码 ≥6、用户名唯一；`bcryptjs` 哈希）、`findByUsername()`、`findById()`、`verifyPassword()`。`toPublicUser()` 剔除 `passwordHash`
- **验证**：注册重复用户名报错；密码错误 `verifyPassword` 返回 false；公开结构不含哈希
- **依赖**：任务 4
- **预计**：5 分钟

### 任务 6：鉴权路由与中间件
- **文件**：`src/routes/auth.js`、`src/middleware/auth.js`、`test/api.auth.test.js`
- **描述**：`POST /api/auth/register`、`/login`、`/logout`、`GET /api/auth/me`；`cookie-session` 下发 `{userId}`；`requireAuth` 中间件未登录返回 401；`ALLOW_REGISTRATION=false` 时注册返回 403
- **验证**：supertest 覆盖注册→登录→`me`→登出全链路；重复注册 409；错误密码 401；未登录访问受保护接口 401
- **依赖**：任务 5
- **预计**：5 分钟

### 任务 7：应用装配 `src/app.js` 与 `src/server.js`
- **文件**：`src/app.js`、`src/server.js`、`src/middleware/error.js`
- **描述**：`createApp()` 装配 `express.json()`、`cookie-session`（`httpOnly`、`sameSite:lax`、HTTPS 下 `secure`）、`trust proxy`、静态托管 `public/`、挂载 `/api` 路由、404 与统一错误处理（JSON 错误响应）；`server.js` 启动时 `load()` 并监听端口
- **验证**：`node src/server.js` 能启动；`GET /` 返回首页；未知路径返回 404 JSON
- **依赖**：任务 6
- **预计**：5 分钟

> **检查点 2**：鉴权链路可跑通后再进入批次 3。

---

## 批次 3：家庭

### 任务 8：家庭领域 `src/domain/families.js`
- **文件**：`src/domain/families.js`、`test/families.test.js`
- **描述**：`createFamily({name, ownerId})` 生成 6 位邀请码（大写字母数字，保证唯一）；`joinFamily({inviteCode, userId})`；`leaveFamily({familyId, userId})`（owner 退出时若仍有其他成员则转让给最早成员，无人则解散家庭）；`listMembers()`；`removeMember()`（仅 owner）
- **验证**：邀请码唯一；重复加入幂等；退出后 `familyIds` 与 `memberIds` 同步；owner 转让与解散逻辑
- **依赖**：任务 4
- **预计**：5 分钟

### 任务 9：退出/移除成员时回收指派
- **文件**：`src/domain/families.js`、`test/families.test.js`
- **描述**：成员退出或被移除时，把该家庭中 `assigneeId === 该成员` 的任务批量重置为 `null`（回到公共任务）
- **验证**：退出家庭后，原指派给该成员的任务 `assigneeId` 为 `null`，且不出现在「按指派人 = 该成员」的结果中
- **依赖**：任务 8
- **预计**：5 分钟

### 任务 10：家庭路由
- **文件**：`src/routes/families.js`、`test/api.families.test.js`
- **描述**：`GET/POST /api/families`、`POST /api/families/join`、`POST /api/families/:id/leave`、`GET /api/families/:id/members`、`DELETE /api/families/:id/members/:userId`（owner）。非成员访问返回 403/404
- **验证**：supertest 覆盖创建→加入→列表→成员→退出；非成员访问成员列表 403
- **依赖**：任务 8、9
- **预计**：5 分钟

> **检查点 3**：家庭与指派回收正确后再进入批次 4。

---

## 批次 4：任务核心

### 任务 11：任务领域 —— 可见性与创建
- **文件**：`src/domain/tasks.js`、`test/tasks.test.js`
- **描述**：`canAccess(user, task)` 实现设计文档的可见性规则（个人 = 创建者；家庭 = 属于该家庭）。`createTask()`：`scope` 为 `personal` 时强制 `assigneeId = null`、`familyId = null`；`family` 时校验 `familyId` 属于用户且 `assigneeId ∈ memberIds`
- **验证**：跨用户访问个人任务被拒；非成员访问家庭任务被拒；非法指派被拒；个人任务带 `assigneeId` 被强制清空
- **依赖**：任务 8
- **预计**：5 分钟

### 任务 12：任务领域 —— 状态迁移与更新
- **文件**：`src/domain/tasks.js`、`test/tasks.test.js`
- **描述**：`updateTask()` 仅允许 `status ∈ {waiting,doing,done}`；置 `done` 时写 `completedAt`，迁出时清空；改派时校验新 `assigneeId ∈ memberIds`，`null` 表示回到公共；更新 `updatedAt`
- **验证**：非法状态 400；`done → waiting` 后 `completedAt` 为 null；改派给非成员 400；改回 `null` 成功
- **依赖**：任务 11
- **预计**：5 分钟

### 任务 13：任务领域 —— 组合筛选
- **文件**：`src/domain/tasks.js`、`test/tasks.test.js`
- **描述**：`listTasks(user, filters)` 支持 `status`（`open` 缺省 = `waiting`+`doing`）、`scope`、`familyId`、`assignee`（`all`/`public`/`me`/用户 id 数组）、`creator`、`priority` 数组、`dueFrom`/`dueTo`、`overdue`。跨维度 AND、同维度 OR。读取时二次校验 `assigneeId ∈ memberIds`，否则按公共任务处理
- **验证**：每个维度单独命中；两维度叠加；`overdue` 只含未完成且逾期；`assignee=public` 只含 `assigneeId === null`
- **依赖**：任务 12
- **预计**：5 分钟

### 任务 14：任务路由
- **文件**：`src/routes/tasks.js`、`test/api.tasks.test.js`
- **描述**：`GET /api/tasks`（含全部查询参数）、`POST /api/tasks`、`PATCH /api/tasks/:id`、`DELETE /api/tasks/:id`；全部经 `requireAuth`；越权返回 404（不泄露存在性）
- **验证**：supertest 覆盖 CRUD + 越权 404 + 筛选参数组合
- **依赖**：任务 13
- **预计**：5 分钟

> **检查点 4**：任务 CRUD、状态机与筛选全绿后进入批次 5。

---

## 批次 5：统计报告与导出

### 任务 15：报告聚合 `src/domain/reports.js`
- **文件**：`src/domain/reports.js`、`test/reports.test.js`
- **描述**：`completedReport(user, {from,to,groupBy,scope,familyId,assignee})`：先按可见性取任务，再筛 `completedAt ∈ [from,to]`，输出 `summary`（`total`/`created`/`completionRate`/`avgHours`）、`trend`（按 `groupBy=day|week|month|year` 分桶）、`byUser`（按 `assigneeId` 归集，`null` 记为 `public`/「全体」）、`byPriority`、`items`。区间超过 2 年返回错误
- **验证**：各粒度分桶正确；`byUser` 之和 = `total`；含「全体」桶；超区间报错；跨用户数据不泄漏
- **依赖**：任务 13
- **预计**：5 分钟

### 任务 16：CSV 序列化与报告路由
- **文件**：`src/domain/reports.js`、`src/routes/reports.js`、`test/api.reports.test.js`
- **描述**：`toCsv(report)` 输出带 **UTF-8 BOM** 的 CSV，列：`标题,状态,优先级,创建人,指派人,归属,创建时间,完成时间,耗时(小时),到期日`；转义逗号与引号。`GET /api/reports/completed`：默认 JSON，`?format=csv` 返回 `text/csv` + `Content-Disposition` 附件头
- **验证**：CSV 首字节为 BOM；标题含逗号时正确转义；行数 = `total`；响应头正确
- **依赖**：任务 15
- **预计**：5 分钟

> **检查点 5**：报告数字与 CSV 正确后进入前端。

---

## 批次 6：前端

### 任务 17：HTML 骨架与设计令牌
- **文件**：`public/index.html`、`public/css/style.css`
- **描述**：`index.html` 含 4 个视图容器（Auth / Main / Family / Report）+ 底部弹层容器 + toast 容器；`viewport-fit=cover`。CSS 定义设计令牌（主色 `#4F7CFF`、背景 `#F5F6F8`、圆角、字号）、安全区变量、`prefers-color-scheme` 深色模式、卡片/chip/FAB/弹层基础样式与动效
- **验证**：浏览器打开显示登录视图；深色模式切换生效
- **依赖**：任务 7
- **预计**：5 分钟

### 任务 18：通用组件 `js/api.js` 与 `js/ui.js`
- **文件**：`public/js/api.js`、`public/js/ui.js`
- **描述**：`api.js` 封装 `fetch`（`credentials:'same-origin'`、JSON 解析），统一拦截 401 → 触发 `onUnauthorized` 回调。`ui.js` 提供 `toast()`、`openSheet()/closeSheet()`、`confirm()`、日期格式化与「今天/明天/逾期」计算
- **验证**：手动调用各方法表现正常；401 时回调触发
- **依赖**：任务 17
- **预计**：5 分钟

### 任务 19：认证视图 `js/auth.js`
- **文件**：`public/js/auth.js`
- **描述**：登录/注册同页切换、前端校验、错误横幅、提交 loading 防重；成功后回调进入 Main
- **验证**：可注册并登录；重复用户名显示错误横幅
- **依赖**：任务 18
- **预计**：5 分钟

### 任务 20：筛选面板 `js/filter.js`
- **文件**：`public/js/filter.js`
- **描述**：底部弹层实现「指派人（全部/全体（公共）/我/成员）/ 到期日（全部/已逾期/今天/本周/本月/自定义）/ 优先级（多选）」；跨维度 AND、同维度 OR；结果同步到 URL query；渲染「已生效筛选」chip 行并可单独清除
- **验证**：任意组合筛选后列表与 URL 同步；单独清除 chip 生效；刷新后筛选保持
- **依赖**：任务 18、任务 14
- **预计**：5 分钟

### 任务 21：轻量图表 `js/chart.js`
- **文件**：`public/js/chart.js`
- **描述**：纯 SVG 绘制柱状图（趋势）与横向条形图（按人/按优先级），无第三方依赖，自适应宽度
- **验证**：传入数据可渲染出正确高度的柱/条
- **依赖**：任务 18
- **预计**：5 分钟

### 任务 22：主清单 `js/tasks.js`
- **文件**：`public/js/tasks.js`
- **描述**：渲染作用域 Tab、状态 chip 行、筛选摘要、按「已逾期/今天/明天/未来/无日期」分组的列表与任务条目（状态圈、状态徽章、指派人标记、优先级色条、到期日）；实现条目交互 —— 圆点切换完成/取消完成、徽章切换等待↔进行中、点行开编辑弹层、左滑/长按删除；完成后 200ms 塌陷移除
- **验证**：三种状态切换入口均生效；完成后从「待办」消失；左右滑删除可用
- **依赖**：任务 19、20、任务 14
- **预计**：5 分钟

### 任务 23：报告页与导出 `js/report.js`
- **文件**：`public/js/report.js`
- **描述**：粒度切换（日/周/月/年）、区间前后切换与自定义、概览卡片、趋势图、按指派人分组（含「全体（公共）」）、按优先级分组、明细表、空态；导出 CSV / JSON（走 `/api/reports/completed?format=`）
- **验证**：切换粒度数字与明细一致；导出的 CSV 用 Excel 打开中文正常；空区间显示空态
- **依赖**：任务 21、任务 16
- **预计**：5 分钟

### 任务 24：家庭管理与路由 `js/family.js`、`js/app.js`
- **文件**：`public/js/family.js`、`public/js/app.js`、`public/manifest.webmanifest`
- **描述**：`family.js` 实现家庭卡片列表、创建（展示邀请码 + 复制）、凭码加入、退出（二次确认）、owner 的移除成员。`app.js` 启动时请求 `/api/auth/me` 决定进入 Auth 还是 Main，并管理四个视图切换
- **验证**：创建→复制邀请码→另一账号加入→看到同一批家庭任务；退出后任务消失
- **依赖**：任务 22、23、任务 10
- **预计**：5 分钟

> **检查点 6**：前端四视图联调通过（两个账号 + 一个家庭全流程）。

---

## 批次 7：Docker 与交付

### 任务 25：Dockerfile
- **文件**：`Dockerfile`、`.dockerignore`
- **描述**：多阶段 `node:20-alpine`；`npm ci --omit=dev`；创建非 root 用户；`VOLUME /app/data`；`EXPOSE 3000`；`HEALTHCHECK` 命中 `/api/auth/me`
- **验证**：`docker build -t family-todo .` 成功；镜像内无 root 运行
- **依赖**：任务 7
- **预计**：5 分钟

### 任务 26：开发环境 compose
- **文件**：`docker-compose.yml`
- **描述**：单 `app` 服务，构建当前目录，映射 `3000:3000`，卷 `./data:/app/data`，注入 `TZ`、`SESSION_SECRET`、`ALLOW_REGISTRATION`
- **验证**：`docker compose up -d` 后 `curl localhost:3000` 返回首页；`data/todo.json` 生成
- **依赖**：任务 25
- **预计**：5 分钟

### 任务 27：生产 HTTPS（Caddy）
- **文件**：`docker-compose.https.yml`、`Caddyfile`
- **描述**：`--profile https` 增加 `caddy` 服务：映射 80/443，卷持久化证书；`Caddyfile` 用 `{DOMAIN}` 占位反代到 `app:3000`；app 设置 `TRUST_PROXY=1`
- **验证**：`DOMAIN=xxx docker compose --profile https up -d` 后 Caddy 取得证书；HTTPS 登录后 Cookie 正常下发
- **依赖**：任务 26
- **预计**：5 分钟

### 任务 28：README
- **文件**：`README.md`
- **描述**：功能说明、本地开发（`npm i && npm test && npm start`）、Docker 局域网部署、生产 HTTPS 部署、环境变量表、`data/todo.json` 备份提醒与结构说明
- **验证**：按 README 步骤可从头跑通
- **依赖**：任务 27
- **预计**：5 分钟

### 任务 29：全量回归与冒烟
- **文件**：无（执行验证）
- **描述**：`npm test` 全绿；`docker compose up` 后按 `design.md` 成功标准 14 条逐条冒烟（含两账号同家庭、指派、状态流转、报告导出）
- **验证**：成功标准全部满足
- **依赖**：任务 28
- **预计**：10 分钟

---

## 任务依赖总览

```
1 → 2 → 3 → 4 ─┬→ 5 → 6 → 7 ─┬→ 17 → 18 ─┬→ 19 ─┐
                │             │           ├→ 21  │
                └→ 8 → 9 → 10 ┤           └→ 20  │
                              │                  ├→ 22 → 24
                └→ 11 → 12 → 13 → 14 ────────────┤
                                    └→ 15 → 16 ──┴→ 23 ┘
7 → 25 → 26 → 27 → 28 → 29
```

**批次与检查点**：批次 1（任务 1–4）→ 检查点 1 → 批次 2（5–7）→ 检查点 2 → 批次 3（8–10）→ 检查点 3 → 批次 4（11–14）→ 检查点 4 → 批次 5（15–16）→ 检查点 5 → 批次 6（17–24）→ 检查点 6 → 批次 7（25–29）。

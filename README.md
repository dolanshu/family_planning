# Family Planning (family_planning)

[English](#english) · [中文](#中文)

---

<a id="english"></a>

## English

A mobile-first web Todo app: each account keeps a private list; **families** share tasks; family tasks can be **assigned** to a member (default is a shared task for everyone). Includes completion **reports** by day / week / month / year with CSV / JSON export.

All data is persisted in a single `todo.json` file. Monolithic app with one-click Docker deployment.

### Features

- **Multi-account**: open registration, bcrypt password hashing, signed cookie sessions (survive restarts)
- **Family sharing**: create a family to get a 6-digit invite code; members join by code; family tasks visible and editable by all members
- **Task assignment**: family tasks default to “everyone (shared)”; can assign to any member without changing visibility
- **Three states**: waiting / in progress / done; completed tasks disappear from the default list immediately
- **Combined filters**: assignee (incl. “everyone”) / due date (overdue · today · this week · this month · custom) / priority (multi-select)
- **Flexible sorting**: priority / assignee / due date / status; **default priority descending (high → low)**; click the active column to toggle asc ⇄ desc; due-date sort groups by date, other sorts are flat
- **Reports**: aggregate completions, completion rate, and average duration by day / week / month / year; group by assignee (incl. “everyone” bucket) and priority; export CSV with UTF-8 BOM (Excel-friendly) and JSON
- **Mobile UX**: safe-area insets, dark mode, add-to-home-screen (PWA manifest), swipe / long-press to delete
- **Data safety**: in-memory state + serialized write queue + atomic `rename` to disk; automatic `.bak` backup

### Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (no build step), `fetch` AJAX |
| Backend | Node 20 + Express 4 |
| Auth | `bcryptjs` + `cookie-session` |
| Storage | Single file `data/todo.json` (atomic writes + `.bak`) |
| Tests | `node:test` + `supertest` (120 cases) |
| Deploy | Docker multi-stage image + Caddy auto HTTPS |

### Quick start (local dev)

```bash
npm install
npm test        # run all tests
npm start       # http://localhost:3000
```

Dev mode (auto-restart on file changes): `npm run dev`

### Docker deployment

#### Default configuration

Two Compose files are provided — **works out of the box** for common scenarios without editing ports:

| Scenario | Command | Host ports | Notes |
|---|---|---|---|
| LAN / home network | `docker compose up -d --build` | `3000` | app exposes HTTP directly; volume `./data:/app/data` |
| Production HTTPS (**443 already in use**) | `docker compose -f docker-compose.yml -f docker-compose.https.yml --profile https up -d --build` | `80` + `8070` | Caddy serves HTTPS on **8070**; **does not use 443** |

Default env vars in `docker-compose.yml`:

| Variable | Default |
|---|---|
| `TZ` | `Asia/Shanghai` |
| `SESSION_SECRET` | `dev-only-change-me` (OK on LAN; override on the public internet) |
| `ALLOW_REGISTRATION` | `true` |

Additional requirements / changes when `docker-compose.https.yml` is layered:

| Item | Default / requirement |
|---|---|
| `DOMAIN` | **Required** (e.g. `todo.example.com`, A record pointing to the server) |
| `SESSION_SECRET` | **Required** (random production secret; do not use the dev default) |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| Caddy HTTPS port | `8070` (`https_port 8070` in `Caddyfile`) |
| Caddy HTTP port | `80` (Let's Encrypt HTTP-01 + HTTP→HTTPS redirect) |
| app host port | Not exposed (only `app:3000` inside the network; proxied by Caddy) |

> **Design note**: the HTTPS overlay **defaults to hosts where port 443 is already taken** (e.g. another nginx/Caddy site on the same machine). Caddy therefore listens on **8070** instead of 443; access URL looks like `https://todo.example.com:8070`. If 443 is free and you want standard `https://your-domain` (no port suffix), change `https_port` in `Caddyfile` and the Caddy port mapping in `docker-compose.https.yml` to `443`, and ensure host 443 is available.

#### LAN (dev / home network)

```bash
docker compose up -d --build
```

Open `http://<host-IP>:3000` on a phone browser. Data is stored in `./data/todo.json`.

#### Production (cloud + domain, auto HTTPS)

```bash
export DOMAIN=todo.example.com          # your domain, A record → server
export SESSION_SECRET=$(openssl rand -hex 32)
export ALLOW_REGISTRATION=true          # set to false after onboarding

docker compose -f docker-compose.yml -f docker-compose.https.yml --profile https up -d --build
```

- Caddy binds host **80** (cert validation + redirect) and **8070** (HTTPS traffic); **443 is not required**.
- Caddy obtains and renews Let's Encrypt certificates; access at `https://todo.example.com:8070`.
- In production the app is not exposed on the host; only Caddy proxies to `app:3000`.
- To use another free port, update `https_port` in `Caddyfile` and the Caddy port mapping in `docker-compose.https.yml` together.
- For standard `https://todo.example.com` when 443 is free, change both to `443`, or front this service with your existing 80/443 reverse proxy.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Service port |
| `DATA_FILE` | `data/todo.json` | Data file path (usually unchanged in containers) |
| `SESSION_SECRET` | dev default | Session signing key; **required in production** or startup fails |
| `TRUST_PROXY` | `false` | Set to `1` behind a reverse proxy for correct HTTPS and `secure` cookies |
| `ALLOW_REGISTRATION` | `true` | Open registration; disable on the public internet after setup |
| `TZ` | `Asia/Shanghai` | Timezone for report aggregation |

### Data & backup

All data lives in `./data/todo.json` (Docker volume mount):

```json
{
  "version": 1,
  "users":    [{ "id", "username", "passwordHash", "familyIds", "createdAt" }],
  "families": [{ "id", "name", "ownerId", "memberIds", "inviteCode", "createdAt" }],
  "tasks":    [{ "id", "title", "notes", "status", "priority", "scope",
                 "ownerId", "assigneeId", "familyId", "dueDate",
                 "createdAt", "updatedAt", "completedAt" }]
}
```

- `status`: `waiting` / `doing` / `done`
- `scope`: `personal` / `family`; `assigneeId` `null` means a shared (everyone) task
- Each write creates `todo.json.bak` (previous version); **back up `./data` regularly**

### API overview

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` `/login` `/logout` | Register / login / logout |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/families` | List families / create (returns invite code) |
| POST | `/api/families/join` | Join by invite code |
| POST | `/api/families/:id/leave` | Leave family |
| GET | `/api/families/:id/members` | Member list |
| PATCH | `/api/families/:id` | Rename (owner) |
| DELETE | `/api/families/:id/members/:userId` | Remove member (owner) |
| GET | `/api/tasks` | Task list; query: `status=open(default)/waiting/doing/done/all`, `scope`, `familyId`, `assignee=all/public/me/<id>`, `creator`, `priority=3,2`, `dueFrom`, `dueTo`, `overdue=true`, `sort=priority(default)/assignee/dueDate/status`, `order=asc/desc` |
| POST/PATCH/DELETE | `/api/tasks[/:id]` | Task CRUD (`assigneeId:null` resets to shared task) |
| GET | `/api/reports/completed` | Completion report; query: `from`, `to`, `groupBy=day/week/month/year`, same scope params as tasks, `format=json(default)/csv` |

### Project layout

```
src/
  server.js / app.js / config.js
  store/db.js            # load todo.json + serialized atomic writes
  domain/                # users / families / tasks / reports
  routes/                # auth / families / tasks / reports
  middleware/            # auth + unified error handling
public/                  # frontend (no build step)
test/                    # node:test + supertest
```

### Design docs

Architecture and UI specs: `design.md`; task breakdown: `plan.md`.

### License

[MIT](LICENSE)

---

<a id="中文"></a>

## 中文

移动端优先的网页版 Todo 清单：多账号各持私人清单，通过「家庭」共享任务，支持把家庭任务**指派**给指定成员（缺省为全员公共任务），并提供按日 / 周 / 月 / 年的**完成统计报告**与 CSV / JSON 导出。

数据以单个 `todo.json` 文件持久化，前后端一体，Docker 一键发布。

### 功能特性

- **多账号**：开放注册，bcrypt 密码哈希，签名 Cookie 会话（重启不掉登录）
- **家庭共享**：创建家庭生成 6 位邀请码，成员凭码加入；家庭任务全员可见、全员可编辑
- **任务指派**：家庭任务缺省「全体（公共）」，可指派给任一成员；指派不改变可见性
- **三态流转**：等待 / 进行中 / 完成；标记完成后立即从缺省列表消失
- **组合筛选**：指派人（含「全体」）/ 到期日（已逾期·今天·本周·本月·自定义）/ 优先级（多选）
- **灵活排序**：优先级 / 指派人 / 到期日 / 状态；**默认优先级降序（高 → 低）**，点击已选维度切换升 ⇄ 降序；按「到期日」排序时显示日期分组，其余维度平铺
- **统计报告**：按日 / 周 / 月 / 年聚合完成数、完成率、平均耗时；按指派人（含「全体」桶）与优先级分组；导出带 UTF-8 BOM 的 CSV（Excel 中文不乱码）与 JSON
- **移动端体验**：安全区适配、深色模式、添加到主屏幕（PWA manifest）、左滑 / 长按删除
- **数据安全**：内存态 + 串行写队列 + 临时文件 `rename` 原子落盘，自动保留 `.bak` 备份

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 原生 HTML/CSS/JS（无构建步骤），`fetch` AJAX |
| 后端 | Node 20 + Express 4 |
| 鉴权 | `bcryptjs` + `cookie-session` |
| 存储 | 单文件 `data/todo.json`（原子写 + .bak） |
| 测试 | `node:test` + `supertest`（120 个用例） |
| 部署 | Docker 多阶段镜像 + Caddy 自动 HTTPS |

### 快速开始（本地开发）

```bash
npm install
npm test        # 运行全部测试
npm start       # http://localhost:3000
```

开发模式（文件变更自动重启）：`npm run dev`

### Docker 部署

#### 默认配置

仓库内提供两套 Compose 文件，**开箱即用、无需改端口**即可在常见场景下运行：

| 场景 | 命令 | 宿主机端口 | 说明 |
|---|---|---|---|
| 局域网 / 家庭内网 | `docker compose up -d --build` | `3000` | app 直接暴露 HTTP，数据卷 `./data:/app/data` |
| 生产 HTTPS（**443 已被占用**） | `docker compose -f docker-compose.yml -f docker-compose.https.yml --profile https up -d --build` | `80` + `8070` | Caddy 监听 **8070** 提供 HTTPS；**不占用 443** |

`docker-compose.yml` 默认环境变量：

| 变量 | 默认值 |
|---|---|
| `TZ` | `Asia/Shanghai` |
| `SESSION_SECRET` | `dev-only-change-me`（局域网可接受；公网务必覆盖） |
| `ALLOW_REGISTRATION` | `true` |

`docker-compose.https.yml` 叠加后额外要求 / 变更：

| 项 | 默认值 / 要求 |
|---|---|
| `DOMAIN` | **必填**（如 `todo.example.com`，A 记录指向服务器） |
| `SESSION_SECRET` | **必填**（生产随机串，不可用开发默认值） |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| Caddy HTTPS 端口 | `8070`（`Caddyfile` 中 `https_port 8070`） |
| Caddy HTTP 端口 | `80`（Let's Encrypt HTTP-01 校验 + HTTP→HTTPS 跳转） |
| app 宿主机端口 | 不暴露（仅容器内 `app:3000`，由 Caddy 反代） |

> **设计说明**：当前 HTTPS 叠加层**默认面向宿主机 443 端口已被其它服务占用的场景**（例如同机已有 nginx/Caddy 站点）。因此 Caddy 使用 **8070** 而非 443，访问地址形如 `https://todo.example.com:8070`。若 443 空闲且希望标准 `https://域名`（无端口号），需自行将 `Caddyfile` 的 `https_port` 与 `docker-compose.https.yml` 中 Caddy 端口映射改为 `443`，并确保宿主机 443 未被占用。

#### 局域网（开发 / 家庭内网）

```bash
docker compose up -d --build
```

手机浏览器访问 `http://<主机IP>:3000`。数据落在 `./data/todo.json`。

#### 生产（云服务器 + 域名，自动 HTTPS）

```bash
export DOMAIN=todo.example.com          # 你的域名，A 记录指向服务器
export SESSION_SECRET=$(openssl rand -hex 32)
export ALLOW_REGISTRATION=true          # 注册完成后建议改为 false

docker compose -f docker-compose.yml -f docker-compose.https.yml --profile https up -d --build
```

- Caddy 占用宿主机 **80**（证书校验与跳转）与 **8070**（HTTPS 业务流量）；**443 不需要**。
- Caddy 自动申请并续期 Let's Encrypt 证书，访问地址为 `https://todo.example.com:8070`。
- 生产模式下 app 不直接暴露宿主机端口，仅由同网络内的 Caddy 反代（`app:3000`）。
- 若需改用其它空闲端口，同步修改 `Caddyfile` 的 `https_port` 与 `docker-compose.https.yml` 的 Caddy 端口映射即可。
- 若 443 空闲且要标准 `https://todo.example.com`，将上述两处改为 `443`，或改用现有 80/443 反代将流量转发到本服务。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `DATA_FILE` | `data/todo.json` | 数据文件路径（容器内一般不改） |
| `SESSION_SECRET` | 开发默认值 | 会话签名密钥；**生产必填**，否则拒绝启动 |
| `TRUST_PROXY` | `false` | 反代后设为 `1`，用于正确识别 HTTPS 并下发 `secure` Cookie |
| `ALLOW_REGISTRATION` | `true` | 是否开放注册，公网建议注册完即关闭 |
| `TZ` | `Asia/Shanghai` | 统计报告的时区口径 |

### 数据与备份

所有数据在 `./data/todo.json`（Docker 卷挂载），结构：

```json
{
  "version": 1,
  "users":    [{ "id", "username", "passwordHash", "familyIds", "createdAt" }],
  "families": [{ "id", "name", "ownerId", "memberIds", "inviteCode", "createdAt" }],
  "tasks":    [{ "id", "title", "notes", "status", "priority", "scope",
                 "ownerId", "assigneeId", "familyId", "dueDate",
                 "createdAt", "updatedAt", "completedAt" }]
}
```

- `status`：`waiting` / `doing` / `done`
- `scope`：`personal`（个人） / `family`（家庭）；`assigneeId` 为 `null` 表示公共任务
- 每次写入自动生成 `todo.json.bak`（上一版本）；**请定期备份 `./data` 目录**

### API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` `/login` `/logout` | 注册 / 登录 / 登出 |
| GET | `/api/auth/me` | 当前用户 |
| GET/POST | `/api/families` | 我的家庭 / 创建（返回邀请码） |
| POST | `/api/families/join` | 凭邀请码加入 |
| POST | `/api/families/:id/leave` | 退出家庭 |
| GET | `/api/families/:id/members` | 成员列表 |
| PATCH | `/api/families/:id` | 重命名（owner） |
| DELETE | `/api/families/:id/members/:userId` | 移除成员（owner） |
| GET | `/api/tasks` | 任务列表，参数：`status=open(缺省)/waiting/doing/done/all`、`scope`、`familyId`、`assignee=all/public/me/<id>`、`creator`、`priority=3,2`、`dueFrom`、`dueTo`、`overdue=true`、`sort=priority(缺省)/assignee/dueDate/status`、`order=asc/desc`（缺省取各字段默认方向：优先级降、其余升） |
| POST/PATCH/DELETE | `/api/tasks[/:id]` | 任务 CRUD（`assigneeId:null` 即改回公共任务） |
| GET | `/api/reports/completed` | 统计报告，参数：`from`、`to`、`groupBy=day/week/month/year`、同任务的作用域参数、`format=json(缺省)/csv` |

### 目录结构

```
src/
  server.js / app.js / config.js
  store/db.js            # todo.json 载入 + 串行原子写
  domain/                # users / families / tasks / reports 领域逻辑
  routes/                # auth / families / tasks / reports
  middleware/            # 鉴权与统一错误处理
public/                  # 前端（无构建步骤）
test/                    # node:test + supertest
```

### 设计文档

架构与界面规格见 `design.md`；任务拆解见 `plan.md`。

### 许可证

[MIT](LICENSE)

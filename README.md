# 家庭清单（family_planning）

移动端优先的网页版 Todo 清单：多账号各持私人清单，通过「家庭」共享任务，支持把家庭任务**指派**给指定成员（缺省为全员公共任务），并提供按日 / 周 / 月 / 年的**完成统计报告**与 CSV / JSON 导出。

数据以单个 `todo.json` 文件持久化，前后端一体，Docker 一键发布。

## 功能特性

- **多账号**：开放注册，bcrypt 密码哈希，签名 Cookie 会话（重启不掉登录）
- **家庭共享**：创建家庭生成 6 位邀请码，成员凭码加入；家庭任务全员可见、全员可编辑
- **任务指派**：家庭任务缺省「全体（公共）」，可指派给任一成员；指派不改变可见性
- **三态流转**：等待 / 进行中 / 完成；标记完成后立即从缺省列表消失
- **组合筛选**：指派人（含「全体」）/ 到期日（已逾期·今天·本周·本月·自定义）/ 优先级（多选）
- **灵活排序**：优先级 / 指派人 / 到期日 / 状态；**默认优先级降序（高 → 低）**，点击已选维度切换升 ⇄ 降序；按「到期日」排序时显示日期分组，其余维度平铺
- **统计报告**：按日 / 周 / 月 / 年聚合完成数、完成率、平均耗时；按指派人（含「全体」桶）与优先级分组；导出带 UTF-8 BOM 的 CSV（Excel 中文不乱码）与 JSON
- **移动端体验**：安全区适配、深色模式、添加到主屏幕（PWA manifest）、左滑 / 长按删除
- **数据安全**：内存态 + 串行写队列 + 临时文件 `rename` 原子落盘，自动保留 `.bak` 备份

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 原生 HTML/CSS/JS（无构建步骤），`fetch` AJAX |
| 后端 | Node 20 + Express 4 |
| 鉴权 | `bcryptjs` + `cookie-session` |
| 存储 | 单文件 `data/todo.json`（原子写 + .bak） |
| 测试 | `node:test` + `supertest`（120 个用例） |
| 部署 | Docker 多阶段镜像 + Caddy 自动 HTTPS |

## 快速开始（本地开发）

```bash
npm install
npm test        # 运行全部测试
npm start       # http://localhost:3000
```

开发模式（文件变更自动重启）：`npm run dev`

## Docker 部署

### 局域网（开发 / 家庭内网）

```bash
docker compose up -d --build
```

手机浏览器访问 `http://<主机IP>:3000`。数据落在 `./data/todo.json`。

### 生产（云服务器 + 域名，自动 HTTPS）

```bash
export DOMAIN=todo.example.com          # 你的域名，A 记录指向服务器
export SESSION_SECRET=$(openssl rand -hex 32)
export ALLOW_REGISTRATION=true          # 注册完成后建议改为 false

docker compose -f docker-compose.yml -f docker-compose.https.yml --profile https up -d --build
```

Caddy 会自动申请并续期 Let's Encrypt 证书，手机直接访问 `https://todo.example.com` 无告警。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `DATA_FILE` | `data/todo.json` | 数据文件路径（容器内一般不改） |
| `SESSION_SECRET` | 开发默认值 | 会话签名密钥；**生产必填**，否则拒绝启动 |
| `TRUST_PROXY` | `false` | 反代后设为 `1`，用于正确识别 HTTPS 并下发 `secure` Cookie |
| `ALLOW_REGISTRATION` | `true` | 是否开放注册，公网建议注册完即关闭 |
| `TZ` | `Asia/Shanghai` | 统计报告的时区口径 |

## 数据与备份

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

## API 概览

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

## 目录结构

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

## 设计文档

需求、架构与界面规格见 `requirement.md` 与 `design.md`；任务拆解见 `plan.md`。

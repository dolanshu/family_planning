# CI/CD 说明（GitHub Actions）

项目仓库：`git@github.com:dolanshu/family_planning.git`
两条工作流，分别在 `.github/workflows/ci.yml` 与 `.github/workflows/release.yml`。

```
push / PR → main      CI：单元测试（Node 20/22）+ 镜像构建冒烟 + Playwright E2E
push tag v* 或手动触发  Release：构建镜像推送 GHCR → SSH 到服务器 docker compose 更新
```

## 一、CI（ci.yml）

| Job | 内容 | 说明 |
|---|---|---|
| `unit` | `npm ci` + `npm test` | Node 20 与 22 双版本矩阵，跑 `test/` 下全部 `node --test` 用例（API 集成 + 领域逻辑） |
| `docker` | `docker build` + 容器启动冒烟 | 校验 Dockerfile 可构建，并验证 `/api/auth/me` 返回 401、首页可访问 |
| `e2e` | Playwright Chromium | 自动拉起 `npm start`，`e2e/global-setup.js` 轮询到服务就绪后执行；报告作为 artifact 保留 7 天 |

只改 `*.md` 时自动跳过，节省额度。Playwright 浏览器按 `package-lock.json` 缓存。

## 二、Release（release.yml）

1. **构建推送**：Buildx 构建镜像推送到 `ghcr.io/<owner>/<repo>`，标签规则：
   - tag 推送 `v1.2.0` → `v1.2.0`、`1.2.0`、`latest`
   - 手动触发 → 短 SHA
   - 部署时一律使用 **digest**（`image@sha256:...`），杜绝同一 tag 被覆盖导致的版本漂移
2. **SSH 部署**：登录 GHCR → 备份 `data/todo.json` → `pull` → `up -d --remove-orphans` → 健康检查（`/api/auth/me` 返回 401 或 200 视为成功），失败则打印最近 200 行日志并让 job 失败。

### 触发方式

```bash
# 常规发版
git tag v1.0.0 && git push origin v1.0.0

# 回滚 / 重发：Actions → Release → Run workflow，填入历史 tag 或 commit SHA
```

手动触发时可指定 `ref`、`platform`（如 `linux/amd64,linux/arm64`）、以及是否执行部署。

## 三、需要配置的 Secrets / Variables

Settings → Secrets and variables → Actions：

### Secrets

| 名称 | 必填 | 说明 |
|---|---|---|
| `DEPLOY_HOST` | ✅ | 服务器 IP 或域名 |
| `DEPLOY_USER` | ✅ | SSH 用户名，需有 docker 权限（建议 `usermod -aG docker <user>`） |
| `DEPLOY_SSH_KEY` | ✅ | SSH 私钥全文，包含 `-----BEGIN ... KEY-----` 与结尾行 |
| `REGISTRY_TOKEN` | 可选 | 服务器拉取私有镜像用的 PAT（`read:packages`）；不填则使用当次运行的 `GITHUB_TOKEN` |

### Variables

| 名称 | 默认值 | 说明 |
|---|---|---|
| `DEPLOY_DIR` | `/root/project/family_planning` | 服务器上的项目目录（内含 `docker-compose.yml`、`data/`） |
| `DEPLOY_PORT` | `22` | SSH 端口 |
| `DEPLOY_COMPOSE_FILES` | `-f docker-compose.yml -f docker-compose.deploy.yml` | compose 文件组合 |
| `DEPLOY_HEALTH_URL` | `http://127.0.0.1:3000/api/auth/me` | 健康检查地址 |
| `DEPLOY_SYNC_COMPOSE` | 未设置（= 开启） | 置为 `false` 可停止把仓库里的 compose/Caddyfile 同步到服务器 |

## 四、服务器一次性准备

```bash
# 1. 安装 Docker + Compose v2.24+（deploy 叠加层用到 !reset 语法）
docker compose version

# 2. 准备目录（本项目部署在 /root/project/family_planning）
mkdir -p /root/project/family_planning
cd /root/project/family_planning
git clone git@github.com:dolanshu/family_planning.git .   # 或手动放置 compose 文件

# 3. 写入生产配置（SESSION_SECRET 必改）
cat > .env <<'EOF'
SESSION_SECRET=$(openssl rand -hex 32)
ALLOW_REGISTRATION=true
TZ=Asia/Shanghai
EOF

# 4. 首次启动（之后由 CI 接管）
docker compose pull && docker compose up -d
```

### 启用 HTTPS（Caddy）

把变量 `DEPLOY_COMPOSE_FILES` 设为：

```
-f docker-compose.yml -f docker-compose.deploy.yml -f docker-compose.https.yml --profile https
```

并在服务器 `.env` 中补上 `DOMAIN=你的域名`（A 记录已指向该服务器），Caddy 会自动申请证书。
注意此时 app 不再映射宿主 3000 端口，`DEPLOY_HEALTH_URL` 需改为 `https://你的域名:8070/api/auth/me`。

## 五、新增文件说明

| 文件 | 作用 |
|---|---|
| `.github/workflows/ci.yml` | 持续集成 |
| `.github/workflows/release.yml` | 构建镜像 + SSH 部署 |
| `docker-compose.deploy.yml` | 部署叠加层：把基础 compose 的 `build: .` 覆盖为拉取 `IMAGE` 变量指定的镜像 |

## 六、常见问题

- **`Error: 请设置 IMAGE 环境变量`**：服务器上的 compose 版本低于 v2.24，不识别 `!reset`，请升级 Docker Compose。
- **健康检查失败但容器在跑**：多半是 HTTPS 场景下仍用默认的 `127.0.0.1:3000`，改 `DEPLOY_HEALTH_URL` 为实际对外地址。
- **生产启动报「必须设置 SESSION_SECRET」**：Dockerfile 里 `NODE_ENV=production`，`config.js` 会强制校验，请在服务器 `.env` 写入该变量。
- **部署后数据丢失**：数据存在服务器 `data/todo.json`（bind 挂载），镜像更新不影响；每次部署前会自动生成 `todo.json.bak-<时间戳>` 快照。

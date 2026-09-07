# ---------- 构建阶段 ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- 运行阶段 ----------
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Shanghai

WORKDIR /app

# 以 root 构建/准备，便于安装 su-exec 与修正目录所有权
USER root

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
 && apk add --no-cache su-exec \
 && mkdir -p /app/data && chown -R node:node /app

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/me').then(r=>{if(r.status===401||r.ok)process.exit(0);process.exit(1)}).catch(()=>process.exit(1))"

# 入口脚本：先修正 /app/data 所有权（bind 挂载常由宿主 root 创建），
# 再以非 root 的 node 用户（UID 1000）启动主进程，避免 EACCES 落盘失败。
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

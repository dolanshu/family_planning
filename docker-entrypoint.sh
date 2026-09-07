#!/bin/sh
set -e

# 数据目录（/app/data）通常通过宿主机 root 创建的 bind 挂载进入容器，
# 而应用以非 root 的 node 用户（UID 1000）运行，会因 EACCES 无法落盘。
# 因此在启动前先把该目录的所有权修正为 node 用户，确保可写。
if [ -d /app/data ]; then
  chown -R node:node /app/data 2>/dev/null || true
fi

# 以非 root 的 node 用户启动主进程，兼顾安全性与可写性。
exec su-exec node "$@"

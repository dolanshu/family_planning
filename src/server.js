'use strict';

const { loadConfig } = require('./config');
const { createStore } = require('./store/db');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig(process.env);
  if (config.timezone) process.env.TZ = config.timezone;

  const store = createStore(config.dataFile);
  await store.load();

  const app = createApp({ store, config });
  const server = app.listen(config.port, () => {
    console.log(`[server] 监听 http://localhost:${config.port}，数据文件 ${config.dataFile}`);
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[server] 收到 ${signal}，正在保存并退出…`);
    server.close();
    try {
      await store.whenIdle();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => { shutdown('SIGINT'); });
  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}

main().catch((err) => {
  console.error('[server] 启动失败：', err);
  process.exit(1);
});

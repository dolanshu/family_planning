'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../src/store/db');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

/** 创建一套隔离的应用实例（临时数据文件），供 API 集成测试使用。 */
async function setupApp(env = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fp-app-'));
  const file = path.join(dir, 'todo.json');

  const store = createStore(file);
  await store.load();

  const config = loadConfig({
    SESSION_SECRET: 'test-session-secret',
    DATA_FILE: file,
    ...env,
  });

  const app = createApp({ store, config });
  return { app, store, config, file, dir };
}

/** 注册并登录一个用户，返回带会话 cookie 的 agent。 */
async function registerAgent(app, request, username, password = 'secret123') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ username, password });
  if (res.status !== 201) {
    throw new Error(`注册失败 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return { agent, user: res.body.user };
}

module.exports = { setupApp, registerAgent };

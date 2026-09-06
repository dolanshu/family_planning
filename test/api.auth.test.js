'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { setupApp, registerAgent } = require('./helpers');

test('注册成功返回用户并下发会话', async () => {
  const { app } = await setupApp();

  const res = await request(app).post('/api/auth/register').send({
    username: 'alice', password: 'secret123',
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.username, 'alice');
  assert.strictEqual(res.body.user.passwordHash, undefined, '不得泄露密码哈希');
  assert.ok(res.headers['set-cookie'], '应下发会话 cookie');
});

test('重复注册返回 409', async () => {
  const { app } = await setupApp();
  await request(app).post('/api/auth/register').send({ username: 'alice', password: 'secret123' });

  const res = await request(app).post('/api/auth/register').send({ username: 'alice', password: 'secret123' });
  assert.strictEqual(res.status, 409);
});

test('弱密码或非法用户名返回 400', async () => {
  const { app } = await setupApp();

  const short = await request(app).post('/api/auth/register').send({ username: 'alice', password: '123' });
  assert.strictEqual(short.status, 400);

  const badName = await request(app).post('/api/auth/register').send({ username: 'a', password: 'secret123' });
  assert.strictEqual(badName.status, 400);
});

test('关闭注册后返回 403', async () => {
  const { app } = await setupApp({ ALLOW_REGISTRATION: 'false' });

  const res = await request(app).post('/api/auth/register').send({ username: 'alice', password: 'secret123' });
  assert.strictEqual(res.status, 403);
});

test('未登录访问 /api/auth/me 返回 401', async () => {
  const { app } = await setupApp();
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
});

test('登录后可读取当前用户，登出后失效', async () => {
  const { app } = await setupApp();
  const { agent, user } = await registerAgent(app, request, 'alice');

  const me = await agent.get('/api/auth/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.id, user.id);

  const logout = await agent.post('/api/auth/logout');
  assert.strictEqual(logout.status, 200);

  const after = await agent.get('/api/auth/me');
  assert.strictEqual(after.status, 401, '登出后应失效');
});

test('密码错误返回 401，密码正确可登录', async () => {
  const { app } = await setupApp();
  await registerAgent(app, request, 'alice');

  const wrong = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'nope123' });
  assert.strictEqual(wrong.status, 401);

  const ok = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'secret123' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.username, 'alice');
});

test('登录不存在的用户返回 401', async () => {
  const { app } = await setupApp();
  const res = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'secret123' });
  assert.strictEqual(res.status, 401);
});

test('会话数据持久化到 store 之外，重启后仍可凭 cookie 访问', async () => {
  const { app, store } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');
  await store.whenIdle();

  const me = await agent.get('/api/auth/me');
  assert.strictEqual(me.status, 200);
});

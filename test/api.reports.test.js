'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { setupApp, registerAgent } = require('./helpers');

async function completedTask(agent, title, day, extra = {}) {
  const res = await agent.post('/api/tasks').send({ title, status: 'done', ...extra });
  assert.strictEqual(res.status, 201, `创建任务失败：${JSON.stringify(res.body)}`);
  // 直接把完成时间对齐到指定日期，便于断言
  return res.body.task;
}

test('未登录访问报告接口返回 401', async () => {
  const { app } = await setupApp();
  assert.strictEqual((await request(app).get('/api/reports/completed')).status, 401);
});

test('返回 JSON 报告结构', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');
  await completedTask(agent, '任务一');

  const res = await agent.get('/api/reports/completed?from=2026-09-01&to=2026-09-30');

  assert.strictEqual(res.status, 200);
  const { report } = res.body;
  assert.ok(report.range, '应包含区间信息');
  assert.strictEqual(report.range.groupBy, 'day');
  assert.strictEqual(typeof report.summary.total, 'number');
  assert.ok(Array.isArray(report.trend));
  assert.ok(Array.isArray(report.byUser));
  assert.ok(Array.isArray(report.items));
  assert.strictEqual(typeof report.byPriority, 'object');
});

test('CSV 导出带 BOM 与附件头', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');
  await completedTask(agent, '任务一');
  await completedTask(agent, '任务二');

  const res = await agent
    .get('/api/reports/completed?from=2026-09-01&to=2026-09-30&format=csv')
    .expect('Content-Type', /text\/csv/);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.text.charCodeAt(0), 0xFEFF, 'CSV 应以 UTF-8 BOM 开头');

  const disposition = res.headers['content-disposition'] || '';
  assert.ok(disposition.includes('attachment'), '应为附件下载');
  assert.ok(disposition.includes('.csv'), '文件名应为 .csv');
  assert.ok(disposition.includes('todo-report-'), disposition);

  const lines = res.text.replace(/^\uFEFF/, '').trim().split('\n');
  assert.strictEqual(lines.length, 3, '表头 + 2 行数据');
  assert.ok(lines[0].includes('标题'));
});

test('非法区间或 groupBy 返回 400', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  assert.strictEqual(
    (await agent.get('/api/reports/completed?from=2026-09-30&to=2026-09-01')).status,
    400,
  );
  assert.strictEqual(
    (await agent.get('/api/reports/completed?groupBy=century')).status,
    400,
  );
});

test('家庭作用域下能统计到成员完成的任务', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  const family = (await alice.post('/api/families').send({ name: '张家' })).body.family;
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });

  await completedTask(bob, 'bob 完成的家庭任务', null, {
    scope: 'family', familyId: family.id,
  });

  const res = await alice.get('/api/reports/completed?from=2026-09-01&to=2026-09-30');
  assert.strictEqual(res.body.report.summary.total, 1);
  assert.strictEqual(res.body.report.items[0].title, 'bob 完成的家庭任务');
  assert.strictEqual(res.body.report.items[0].creatorName, 'bob');
});

test('区间内无完成任务时返回空报告而非报错', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const res = await agent.get('/api/reports/completed?from=2020-01-01&to=2020-01-31');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.report.summary.total, 0);
  assert.deepStrictEqual(res.body.report.items, []);
  assert.strictEqual(res.body.report.summary.avgHours, null);
});

test('按指派人筛选报告', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob, user: bobUser } = await registerAgent(app, request, 'bob');

  const family = (await alice.post('/api/families').send({ name: '张家' })).body.family;
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });

  await completedTask(alice, '公共任务', null, { scope: 'family', familyId: family.id });
  await completedTask(alice, 'bob 的任务', null, {
    scope: 'family', familyId: family.id, assigneeId: bobUser.id,
  });

  const pub = await alice.get('/api/reports/completed?from=2026-09-01&to=2026-09-30&assignee=public');
  assert.strictEqual(pub.body.report.summary.total, 1);
  assert.strictEqual(pub.body.report.items[0].title, '公共任务');

  const mine = await alice.get(`/api/reports/completed?from=2026-09-01&to=2026-09-30&assignee=${bobUser.id}`);
  assert.strictEqual(mine.body.report.summary.total, 1);
  assert.strictEqual(mine.body.report.items[0].title, 'bob 的任务');
});

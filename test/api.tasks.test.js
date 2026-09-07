'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { setupApp, registerAgent } = require('./helpers');

async function makeFamily(ownerAgent, joinerAgents = []) {
  const res = await ownerAgent.post('/api/families').send({ name: '张家' });
  assert.strictEqual(res.status, 201);
  const family = res.body.family;
  for (const agent of joinerAgents) {
    const joined = await agent.post('/api/families/join').send({ inviteCode: family.inviteCode });
    assert.strictEqual(joined.status, 200);
  }
  return family;
}

test('未登录访问任务接口返回 401', async () => {
  const { app } = await setupApp();

  assert.strictEqual((await request(app).get('/api/tasks')).status, 401);
  assert.strictEqual((await request(app).post('/api/tasks').send({ title: 'x' })).status, 401);
});

test('创建个人任务并返回完整字段', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const res = await agent.post('/api/tasks').send({ title: '买牛奶', priority: 3 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.task.title, '买牛奶');
  assert.strictEqual(res.body.task.status, 'waiting');
  assert.strictEqual(res.body.task.priority, 3);
  assert.strictEqual(res.body.task.assigneeId, null);
  assert.strictEqual(res.body.task.scope, 'personal');
});

test('标题为空返回 400', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');
  assert.strictEqual((await agent.post('/api/tasks').send({ title: '' })).status, 400);
});

test('缺省列表不含已完成任务，status=done 时才出现', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const task = (await agent.post('/api/tasks').send({ title: '待办任务' })).body.task;
  await agent.post('/api/tasks').send({ title: '已完成任务', status: 'done' });

  const list = await agent.get('/api/tasks');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.tasks.length, 1);
  assert.strictEqual(list.body.tasks[0].title, '待办任务');

  const done = await agent.get('/api/tasks?status=done');
  assert.strictEqual(done.body.tasks.length, 1);
  assert.strictEqual(done.body.tasks[0].title, '已完成任务');

  const all = await agent.get('/api/tasks?status=all');
  assert.strictEqual(all.body.tasks.length, 2);

  assert.ok(task.id);
});

test('两个账号看到各自不同的私人清单', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  await alice.post('/api/tasks').send({ title: 'alice 的任务' });
  await bob.post('/api/tasks').send({ title: 'bob 的任务' });

  const aliceList = await alice.get('/api/tasks');
  const bobList = await bob.get('/api/tasks');

  assert.deepStrictEqual(aliceList.body.tasks.map((t) => t.title), ['alice 的任务']);
  assert.deepStrictEqual(bobList.body.tasks.map((t) => t.title), ['bob 的任务']);
});

test('家庭成员可共同编辑同一批家庭任务', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  const family = await makeFamily(alice, [bob]);
  const created = await alice.post('/api/tasks').send({
    title: '倒垃圾', scope: 'family', familyId: family.id,
  });
  assert.strictEqual(created.status, 201);

  const bobList = await bob.get('/api/tasks');
  assert.strictEqual(bobList.body.tasks.length, 1, 'bob 应能看到家庭任务');

  const patched = await bob.patch(`/api/tasks/${created.body.task.id}`).send({ status: 'done' });
  assert.strictEqual(patched.status, 200, 'bob 应能编辑家庭任务');
  assert.strictEqual(patched.body.task.status, 'done');
  assert.ok(patched.body.task.completedAt);
});

test('指派给成员成功，指派给非成员返回 403', async () => {
  const { app } = await setupApp();
  const { agent: alice, user: aliceUser } = await registerAgent(app, request, 'alice');
  const { agent: bob, user: bobUser } = await registerAgent(app, request, 'bob');
  const { agent: carol, user: carolUser } = await registerAgent(app, request, 'carol');

  const family = await makeFamily(alice, [bob]);

  const ok = await alice.post('/api/tasks').send({
    title: '洗碗', scope: 'family', familyId: family.id, assigneeId: bobUser.id,
  });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.task.assigneeId, bobUser.id);

  const denied = await alice.post('/api/tasks').send({
    title: 'x', scope: 'family', familyId: family.id, assigneeId: carolUser.id,
  });
  assert.strictEqual(denied.status, 403);
  assert.ok(aliceUser.id && carolUser.id);
});

test('按指派人筛选：me / public / 指定用户', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob, user: bobUser } = await registerAgent(app, request, 'bob');

  const family = await makeFamily(alice, [bob]);
  await alice.post('/api/tasks').send({ title: '公共任务', scope: 'family', familyId: family.id });
  await alice.post('/api/tasks').send({
    title: 'bob 的任务', scope: 'family', familyId: family.id, assigneeId: bobUser.id,
  });

  const mine = await bob.get('/api/tasks?assignee=me');
  assert.deepStrictEqual(mine.body.tasks.map((t) => t.title), ['bob 的任务']);

  const pub = await bob.get('/api/tasks?assignee=public');
  assert.deepStrictEqual(pub.body.tasks.map((t) => t.title), ['公共任务']);

  const byId = await alice.get(`/api/tasks?assignee=${bobUser.id}`);
  assert.deepStrictEqual(byId.body.tasks.map((t) => t.title), ['bob 的任务']);
});

test('按优先级与到期日筛选', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  await agent.post('/api/tasks').send({ title: '高优先级', priority: 3, dueDate: '2026-09-07' });
  await agent.post('/api/tasks').send({ title: '低优先级', priority: 1, dueDate: '2026-12-31' });

  const high = await agent.get('/api/tasks?priority=3');
  assert.deepStrictEqual(high.body.tasks.map((t) => t.title), ['高优先级']);

  const ranged = await agent.get('/api/tasks?dueFrom=2026-09-01&dueTo=2026-09-30');
  assert.deepStrictEqual(ranged.body.tasks.map((t) => t.title), ['高优先级']);
});

test('overdue 只返回未完成且已逾期的任务', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const old = await agent.post('/api/tasks').send({ title: '逾期未完成', dueDate: '2020-01-01' });
  await agent.post('/api/tasks').send({ title: '逾期已完成', dueDate: '2020-01-01', status: 'done' });
  await agent.patch(`/api/tasks/${old.body.task.id}`).send({ priority: 2 });

  const overdue = await agent.get('/api/tasks?status=all&overdue=true');
  assert.deepStrictEqual(overdue.body.tasks.map((t) => t.title), ['逾期未完成']);
});

test('越权修改或删除返回 404', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: carol } = await registerAgent(app, request, 'carol');

  const task = (await alice.post('/api/tasks').send({ title: '私人任务' })).body.task;

  assert.strictEqual((await carol.patch(`/api/tasks/${task.id}`).send({ title: 'x' })).status, 404);
  assert.strictEqual((await carol.delete(`/api/tasks/${task.id}`)).status, 404);
});

test('删除任务后不再出现在列表', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const task = (await agent.post('/api/tasks').send({ title: '待删除' })).body.task;
  const del = await agent.delete(`/api/tasks/${task.id}`);
  assert.strictEqual(del.status, 200);

  const list = await agent.get('/api/tasks');
  assert.strictEqual(list.body.tasks.length, 0);
});

test('非法状态与优先级更新返回 400', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');
  const task = (await agent.post('/api/tasks').send({ title: 'x' })).body.task;

  assert.strictEqual((await agent.patch(`/api/tasks/${task.id}`).send({ status: 'archived' })).status, 400);
  assert.strictEqual((await agent.patch(`/api/tasks/${task.id}`).send({ priority: 9 })).status, 400);
});

// ---------- 排序 ----------

test('缺省按优先级降序返回（高 → 低）', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  await agent.post('/api/tasks').send({ title: '低', priority: 1 });
  await agent.post('/api/tasks').send({ title: '高', priority: 3 });
  await agent.post('/api/tasks').send({ title: '中', priority: 2 });

  const list = await agent.get('/api/tasks');
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(list.body.tasks.map((t) => t.title), ['高', '中', '低']);
});

test('sort=priority&order=asc 返回升序', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  await agent.post('/api/tasks').send({ title: '低', priority: 1 });
  await agent.post('/api/tasks').send({ title: '高', priority: 3 });

  const list = await agent.get('/api/tasks?sort=priority&order=asc');
  assert.deepStrictEqual(list.body.tasks.map((t) => t.title), ['低', '高']);
});

test('sort=dueDate 升序且无到期日排最后', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const far = new Date();
  far.setDate(far.getDate() + 10);
  const near = new Date();
  near.setDate(near.getDate() + 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  await agent.post('/api/tasks').send({ title: '远', dueDate: fmt(far) });
  await agent.post('/api/tasks').send({ title: '无日期' });
  await agent.post('/api/tasks').send({ title: '近', dueDate: fmt(near) });

  const list = await agent.get('/api/tasks?sort=dueDate');
  assert.deepStrictEqual(list.body.tasks.map((t) => t.title), ['近', '远', '无日期']);
});

test('sort=status 按 等待 → 进行中 → 完成', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const done = (await agent.post('/api/tasks').send({ title: '完成', status: 'done' })).body.task;
  await agent.post('/api/tasks').send({ title: '等待' });
  const doing = (await agent.post('/api/tasks').send({ title: '进行中' })).body.task;
  await agent.patch(`/api/tasks/${doing.id}`).send({ status: 'doing' });

  const list = await agent.get('/api/tasks?status=all&sort=status');
  assert.deepStrictEqual(list.body.tasks.map((t) => t.title), ['等待', '进行中', '完成']);
  void done;
});

test('非法排序字段或方向返回 400', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  assert.strictEqual((await agent.get('/api/tasks?sort=bogus')).status, 400);
  assert.strictEqual((await agent.get('/api/tasks?sort=priority&order=sideways')).status, 400);
});

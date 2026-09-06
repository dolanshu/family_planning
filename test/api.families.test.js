'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { setupApp, registerAgent } = require('./helpers');

async function createFamilyAs(agent, name = '张家') {
  const res = await agent.post('/api/families').send({ name });
  assert.strictEqual(res.status, 201, `创建家庭失败：${JSON.stringify(res.body)}`);
  return res.body.family;
}

test('未登录访问家庭接口返回 401', async () => {
  const { app } = await setupApp();

  assert.strictEqual((await request(app).get('/api/families')).status, 401);
  assert.strictEqual((await request(app).post('/api/families').send({ name: '张家' })).status, 401);
});

test('创建家庭返回邀请码，并出现在我的家庭列表', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const family = await createFamilyAs(agent);
  assert.strictEqual(family.name, '张家');
  assert.strictEqual(family.inviteCode.length, 6);
  assert.deepStrictEqual(family.memberIds.length, 1);

  const list = await agent.get('/api/families');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.families.length, 1);
  assert.strictEqual(list.body.families[0].id, family.id);
});

test('家庭名为空返回 400', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  const res = await agent.post('/api/families').send({ name: '' });
  assert.strictEqual(res.status, 400);
});

test('另一账号凭邀请码加入后能看到同一家庭', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  const family = await createFamilyAs(alice);

  const join = await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });
  assert.strictEqual(join.status, 200);

  const bobList = await bob.get('/api/families');
  assert.strictEqual(bobList.body.families.length, 1);
  assert.strictEqual(bobList.body.families[0].id, family.id);
});

test('邀请码错误或为空返回 404', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'bob');

  assert.strictEqual((await agent.post('/api/families/join').send({ inviteCode: 'ZZZZZZ' })).status, 404);
  assert.strictEqual((await agent.post('/api/families/join').send({ inviteCode: '' })).status, 404);
});

test('成员可查看成员列表，非成员返回 403', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');
  const { agent: carol } = await registerAgent(app, request, 'carol');

  const family = await createFamilyAs(alice);
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });

  const members = await alice.get(`/api/families/${family.id}/members`);
  assert.strictEqual(members.status, 200);
  assert.deepStrictEqual(members.body.members.map((m) => m.username).sort(), ['alice', 'bob']);
  assert.strictEqual(members.body.members[0].passwordHash, undefined);

  const denied = await carol.get(`/api/families/${family.id}/members`);
  assert.strictEqual(denied.status, 403);
});

test('退出家庭后不再出现在列表中', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  const family = await createFamilyAs(alice);
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });

  const left = await bob.post(`/api/families/${family.id}/leave`);
  assert.strictEqual(left.status, 200);

  const list = await bob.get('/api/families');
  assert.strictEqual(list.body.families.length, 0);
});

test('owner 退出后由最早成员接任 owner', async () => {
  const { app } = await setupApp();
  const { agent: alice, user: aliceUser } = await registerAgent(app, request, 'alice');
  const { agent: bob, user: bobUser } = await registerAgent(app, request, 'bob');

  const family = await createFamilyAs(alice);
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });
  await alice.post(`/api/families/${family.id}/leave`);

  const bobList = await bob.get('/api/families');
  assert.strictEqual(bobList.body.families.length, 1);
  assert.strictEqual(bobList.body.families[0].ownerId, bobUser.id);
  assert.notStrictEqual(bobList.body.families[0].ownerId, aliceUser.id);
});

test('owner 可移除成员，非 owner 返回 403', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob, user: bobUser } = await registerAgent(app, request, 'bob');
  const { agent: carol, user: carolUser } = await registerAgent(app, request, 'carol');

  const family = await createFamilyAs(alice);
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });
  await carol.post('/api/families/join').send({ inviteCode: family.inviteCode });

  const denied = await bob.delete(`/api/families/${family.id}/members/${carolUser.id}`);
  assert.strictEqual(denied.status, 403);

  const ok = await alice.delete(`/api/families/${family.id}/members/${carolUser.id}`);
  assert.strictEqual(ok.status, 200);

  const members = await bob.get(`/api/families/${family.id}/members`);
  assert.deepStrictEqual(members.body.members.map((m) => m.username).sort(), ['alice', 'bob']);
  assert.ok(!members.body.members.some((m) => m.id === carolUser.id));
});

test('owner 可重命名家庭，非 owner 返回 403', async () => {
  const { app } = await setupApp();
  const { agent: alice } = await registerAgent(app, request, 'alice');
  const { agent: bob } = await registerAgent(app, request, 'bob');

  const family = await createFamilyAs(alice);
  await bob.post('/api/families/join').send({ inviteCode: family.inviteCode });

  assert.strictEqual((await bob.patch(`/api/families/${family.id}`).send({ name: '李家' })).status, 403);

  const ok = await alice.patch(`/api/families/${family.id}`).send({ name: '李家' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.family.name, '李家');
});

test('访问不存在的家庭返回 404', async () => {
  const { app } = await setupApp();
  const { agent } = await registerAgent(app, request, 'alice');

  assert.strictEqual((await agent.get('/api/families/f_nope/members')).status, 404);
  assert.strictEqual((await agent.post('/api/families/f_nope/leave')).status, 404);
});

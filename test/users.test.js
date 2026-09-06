'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createUser, findByUsername, findById, verifyPassword, toPublicUser,
} = require('../src/domain/users');
const { emptyState } = require('../src/store/db');

test('createUser 成功创建用户并写入 state', () => {
  const state = emptyState();
  const user = createUser(state, { username: 'alice', password: 'secret123' });

  assert.strictEqual(user.username, 'alice');
  assert.ok(user.id.startsWith('u_'));
  assert.ok(user.passwordHash, '应写入 passwordHash');
  assert.notStrictEqual(user.passwordHash, 'secret123', '密码不得明文存储');
  assert.deepStrictEqual(state.users, [user]);
  assert.deepStrictEqual(user.familyIds, []);
  assert.ok(user.createdAt);
});

test('toPublicUser 剔除 passwordHash', () => {
  const state = emptyState();
  const user = createUser(state, { username: 'alice', password: 'secret123' });
  const pub = toPublicUser(user);

  assert.strictEqual(pub.passwordHash, undefined);
  assert.strictEqual(pub.id, user.id);
  assert.strictEqual(pub.username, 'alice');
});

test('用户名长度非法时抛错', () => {
  const state = emptyState();
  assert.throws(() => createUser(state, { username: 'ab', password: 'secret123' }), /3.{0,4}20|长度/);
  assert.throws(() => createUser(state, { username: 'a'.repeat(21), password: 'secret123' }), /3.{0,4}20|长度/);
});

test('用户名含空白或非法字符时抛错', () => {
  const state = emptyState();
  assert.throws(() => createUser(state, { username: 'al ice', password: 'secret123' }));
  assert.throws(() => createUser(state, { username: 'alice@#$', password: 'secret123' }));
});

test('支持中文用户名', () => {
  const state = emptyState();
  const user = createUser(state, { username: '张小明', password: 'secret123' });
  assert.strictEqual(user.username, '张小明');
});

test('密码过短时抛错', () => {
  const state = emptyState();
  assert.throws(() => createUser(state, { username: 'alice', password: '12345' }), /6/);
});

test('用户名重复时抛 409 冲突', () => {
  const state = emptyState();
  createUser(state, { username: 'alice', password: 'secret123' });

  try {
    createUser(state, { username: 'alice', password: 'other123' });
    assert.fail('重复用户名应抛错');
  } catch (err) {
    assert.strictEqual(err.status, 409);
  }
});

test('用户名重复判断不区分大小写', () => {
  const state = emptyState();
  createUser(state, { username: 'Alice', password: 'secret123' });
  assert.throws(() => createUser(state, { username: 'alice', password: 'secret123' }), { status: 409 });
});

test('verifyPassword 校验正确与错误密码', () => {
  const state = emptyState();
  const user = createUser(state, { username: 'alice', password: 'secret123' });

  assert.strictEqual(verifyPassword(user, 'secret123'), true);
  assert.strictEqual(verifyPassword(user, 'wrong'), false);
});

test('findByUsername 与 findById 可查到用户', () => {
  const state = emptyState();
  const user = createUser(state, { username: 'alice', password: 'secret123' });

  assert.strictEqual(findByUsername(state, 'alice').id, user.id);
  assert.strictEqual(findByUsername(state, 'ALICE').id, user.id, '查找应忽略大小写');
  assert.strictEqual(findByUsername(state, 'nobody'), null);
  assert.strictEqual(findById(state, user.id).id, user.id);
  assert.strictEqual(findById(state, 'u_missing'), null);
});

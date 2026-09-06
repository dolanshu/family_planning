'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createFamily, joinFamily, leaveFamily, removeMember,
  findFamilyById, findFamilyByInviteCode, listMembers, isMember, renameFamily,
} = require('../src/domain/families');
const { createUser } = require('../src/domain/users');
const { emptyState } = require('../src/store/db');

function seed() {
  const state = emptyState();
  const alice = createUser(state, { username: 'alice', password: 'secret123' });
  const bob = createUser(state, { username: 'bob', password: 'secret123' });
  const carol = createUser(state, { username: 'carol', password: 'secret123' });
  return { state, alice, bob, carol };
}

test('createFamily 建立家庭并把创建者作为 owner 与成员', () => {
  const { state, alice } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });

  assert.strictEqual(family.name, '张家');
  assert.strictEqual(family.ownerId, alice.id);
  assert.deepStrictEqual(family.memberIds, [alice.id]);
  assert.deepStrictEqual(alice.familyIds, [family.id]);
});

test('邀请码为 6 位且在家庭间唯一', () => {
  const { state, alice } = seed();
  const codes = new Set();
  for (let i = 0; i < 20; i += 1) {
    const f = createFamily(state, { name: `家${i}`, ownerId: alice.id });
    assert.strictEqual(f.inviteCode.length, 6);
    codes.add(f.inviteCode);
  }
  assert.strictEqual(codes.size, 20);
});

test('家庭名非法时抛错', () => {
  const { state, alice } = seed();
  assert.throws(() => createFamily(state, { name: '', ownerId: alice.id }));
  assert.throws(() => createFamily(state, { name: 'x'.repeat(31), ownerId: alice.id }));
});

test('joinFamily 凭邀请码加入，重复加入幂等', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });

  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  assert.deepStrictEqual(findFamilyById(state, family.id).memberIds, [alice.id, bob.id]);
  assert.ok(bob.familyIds.includes(family.id));

  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  assert.strictEqual(findFamilyById(state, family.id).memberIds.length, 2, '重复加入不应产生重复成员');
});

test('邀请码不存在或为空时抛 404', () => {
  const { state, bob } = seed();
  assert.throws(() => joinFamily(state, { inviteCode: 'ZZZZZZ', userId: bob.id }), { status: 404 });
  assert.throws(() => joinFamily(state, { inviteCode: '', userId: bob.id }), { status: 404 });
});

test('邀请码大小写不敏感', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });

  joinFamily(state, { inviteCode: family.inviteCode.toLowerCase(), userId: bob.id });
  assert.ok(isMember(family, bob.id));
});

test('非 owner 退出后从成员与 familyIds 中移除', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });

  leaveFamily(state, { familyId: family.id, userId: bob.id });

  assert.strictEqual(isMember(family, bob.id), false);
  assert.strictEqual(bob.familyIds.includes(family.id), false);
  assert.strictEqual(findFamilyById(state, family.id).ownerId, alice.id);
});

test('owner 退出时转让给最早加入的成员', () => {
  const { state, alice, bob, carol } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: carol.id });

  leaveFamily(state, { familyId: family.id, userId: alice.id });

  assert.strictEqual(family.ownerId, bob.id, 'owner 应转让给最早的其他成员');
  assert.deepStrictEqual(family.memberIds, [bob.id, carol.id]);
});

test('最后一名成员退出则解散家庭并清理其任务', () => {
  const { state, alice } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  state.tasks.push({ id: 't_1', scope: 'family', familyId: family.id, ownerId: alice.id, assigneeId: null });

  leaveFamily(state, { familyId: family.id, userId: alice.id });

  assert.strictEqual(findFamilyById(state, family.id), null, '家庭应被解散');
  assert.strictEqual(state.tasks.length, 0, '家庭任务应一并清理');
  assert.strictEqual(alice.familyIds.length, 0);
});

test('退出家庭时回收该成员名下的指派', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  state.tasks.push({
    id: 't_1', scope: 'family', familyId: family.id, ownerId: alice.id, assigneeId: bob.id,
  });

  leaveFamily(state, { familyId: family.id, userId: bob.id });

  assert.strictEqual(state.tasks[0].assigneeId, null, '退出后指派应回到公共任务');
});

test('removeMember 仅 owner 可用', () => {
  const { state, alice, bob, carol } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: carol.id });

  assert.throws(
    () => removeMember(state, { familyId: family.id, userId: carol.id, actorId: bob.id }),
    { status: 403 },
  );

  removeMember(state, { familyId: family.id, userId: carol.id, actorId: alice.id });
  assert.strictEqual(isMember(family, carol.id), false);
});

test('owner 不能通过 removeMember 移除自己', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });

  assert.throws(
    () => removeMember(state, { familyId: family.id, userId: alice.id, actorId: alice.id }),
    { status: 400 },
  );
});

test('被移除成员的指派同样被回收', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  state.tasks.push({
    id: 't_1', scope: 'family', familyId: family.id, ownerId: alice.id, assigneeId: bob.id,
  });

  removeMember(state, { familyId: family.id, userId: bob.id, actorId: alice.id });
  assert.strictEqual(state.tasks[0].assigneeId, null);
});

test('listMembers 返回成员公开信息且不含密码哈希', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });

  const members = listMembers(state, family);
  assert.deepStrictEqual(members.map((m) => m.username).sort(), ['alice', 'bob']);
  assert.strictEqual(members[0].passwordHash, undefined);
});

test('renameFamily 仅 owner 可用', () => {
  const { state, alice, bob } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });

  assert.throws(() => renameFamily(state, { family, name: '李家', actorId: bob.id }), { status: 403 });

  renameFamily(state, { family, name: '李家', actorId: alice.id });
  assert.strictEqual(family.name, '李家');
});

test('findFamilyByInviteCode 可反查家庭', () => {
  const { state, alice } = seed();
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  assert.strictEqual(findFamilyByInviteCode(state, family.inviteCode).id, family.id);
});

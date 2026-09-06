'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createTask, updateTask, deleteTask, listTasks, canAccess, findTask,
  STATUS, PRIORITY,
} = require('../src/domain/tasks');
const { createFamily, joinFamily } = require('../src/domain/families');
const { createUser } = require('../src/domain/users');
const { emptyState } = require('../src/store/db');

function seed() {
  const state = emptyState();
  const alice = createUser(state, { username: 'alice', password: 'secret123' });
  const bob = createUser(state, { username: 'bob', password: 'secret123' });
  const carol = createUser(state, { username: 'carol', password: 'secret123' });
  const family = createFamily(state, { name: '张家', ownerId: alice.id });
  joinFamily(state, { inviteCode: family.inviteCode, userId: bob.id });
  return { state, alice, bob, carol, family };
}

const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// ---------- 可见性 ----------

test('个人任务仅创建者可见，家庭任务仅成员可见', () => {
  const { state, alice, bob, carol, family } = seed();
  const personal = createTask(state, alice, { title: '私人任务', scope: 'personal' });
  const shared = createTask(state, alice, { title: '家庭任务', scope: 'family', familyId: family.id });

  assert.strictEqual(canAccess(alice, personal), true);
  assert.strictEqual(canAccess(bob, personal), false);
  assert.strictEqual(canAccess(alice, shared), true);
  assert.strictEqual(canAccess(bob, shared), true, '家庭成员应可见家庭任务');
  assert.strictEqual(canAccess(carol, shared), false, '非成员不应可见');
});

// ---------- 创建 ----------

test('新建任务默认 waiting 且无指派', () => {
  const { state, alice } = seed();
  const task = createTask(state, alice, { title: '买牛奶' });

  assert.strictEqual(task.status, STATUS.WAITING);
  assert.strictEqual(task.assigneeId, null);
  assert.strictEqual(task.completedAt, null);
  assert.strictEqual(task.priority, PRIORITY.NONE);
  assert.strictEqual(task.scope, 'personal');
  assert.strictEqual(task.ownerId, alice.id);
  assert.strictEqual(state.tasks.length, 1);
});

test('个人任务即使传入 assigneeId 也被强制清空', () => {
  const { state, alice, bob } = seed();
  const task = createTask(state, alice, { title: 'x', scope: 'personal', assigneeId: bob.id });
  assert.strictEqual(task.assigneeId, null);
});

test('家庭任务可指派给成员', () => {
  const { state, alice, bob, family } = seed();
  const task = createTask(state, alice, {
    title: '倒垃圾', scope: 'family', familyId: family.id, assigneeId: bob.id,
  });
  assert.strictEqual(task.assigneeId, bob.id);
});

test('指派给非成员返回 403', () => {
  const { state, alice, carol, family } = seed();
  assert.throws(
    () => createTask(state, alice, { title: 'x', scope: 'family', familyId: family.id, assigneeId: carol.id }),
    { status: 403 },
  );
});

test('非成员创建家庭任务返回 403', () => {
  const { state, carol, family } = seed();
  assert.throws(
    () => createTask(state, carol, { title: 'x', scope: 'family', familyId: family.id }),
    { status: 403 },
  );
});

test('标题为空返回 400', () => {
  const { state, alice } = seed();
  assert.throws(() => createTask(state, alice, { title: '' }), { status: 400 });
  assert.throws(() => createTask(state, alice, { title: '   ' }), { status: 400 });
});

test('非法状态、优先级、日期返回 400', () => {
  const { state, alice } = seed();
  assert.throws(() => createTask(state, alice, { title: 'x', status: 'nope' }), { status: 400 });
  assert.throws(() => createTask(state, alice, { title: 'x', priority: 9 }), { status: 400 });
  assert.throws(() => createTask(state, alice, { title: 'x', dueDate: '2026/09/07' }), { status: 400 });
});

test('以 done 新建时写入 completedAt', () => {
  const { state, alice } = seed();
  const task = createTask(state, alice, { title: 'x', status: STATUS.DONE });
  assert.ok(task.completedAt);
});

// ---------- 状态迁移 ----------

test('状态在 waiting / doing / done 间迁移并维护 completedAt', () => {
  const { state, alice } = seed();
  const task = createTask(state, alice, { title: 'x' });

  updateTask(state, alice, task.id, { status: STATUS.DOING });
  assert.strictEqual(task.status, STATUS.DOING);
  assert.strictEqual(task.completedAt, null);

  updateTask(state, alice, task.id, { status: STATUS.DONE });
  assert.strictEqual(task.status, STATUS.DONE);
  assert.ok(task.completedAt, '完成时应写入 completedAt');

  const completedAt = task.completedAt;
  updateTask(state, alice, task.id, { status: STATUS.WAITING });
  assert.strictEqual(task.completedAt, null, '取消完成应清空 completedAt');
  assert.ok(completedAt);
});

test('非法状态更新返回 400', () => {
  const { state, alice } = seed();
  const task = createTask(state, alice, { title: 'x' });
  assert.throws(() => updateTask(state, alice, task.id, { status: 'archived' }), { status: 400 });
});

// ---------- 指派变更 ----------

test('改派给非成员返回 403，改回 null 变公共任务', () => {
  const { state, alice, bob, carol, family } = seed();
  const task = createTask(state, alice, {
    title: 'x', scope: 'family', familyId: family.id, assigneeId: bob.id,
  });

  assert.throws(() => updateTask(state, alice, task.id, { assigneeId: carol.id }), { status: 403 });

  updateTask(state, alice, task.id, { assigneeId: null });
  assert.strictEqual(task.assigneeId, null);
});

test('个人任务被改派时保持 null', () => {
  const { state, alice, bob, family } = seed();
  const task = createTask(state, alice, { title: 'x', scope: 'personal' });
  updateTask(state, alice, task.id, { assigneeId: bob.id });
  assert.strictEqual(task.assigneeId, null);
});

// ---------- 越权与删除 ----------

test('越权更新或删除返回 404', () => {
  const { state, alice, carol } = seed();
  const task = createTask(state, alice, { title: 'x' });

  assert.throws(() => updateTask(state, carol, task.id, { title: 'hack' }), { status: 404 });
  assert.throws(() => deleteTask(state, carol, task.id), { status: 404 });
  assert.strictEqual(state.tasks.length, 1);
});

test('创建者可删除自己的任务', () => {
  const { state, alice } = seed();
  const task = createTask(state, alice, { title: 'x' });
  deleteTask(state, alice, task.id);
  assert.strictEqual(state.tasks.length, 0);
  assert.strictEqual(findTask(state, task.id), null);
});

// ---------- 筛选 ----------

function seedFiltered() {
  const s = seed();
  const { state, alice, bob, family } = s;

  s.t1 = createTask(state, alice, { title: 'A-家庭公共', scope: 'family', familyId: family.id, priority: PRIORITY.HIGH, dueDate: TOMORROW });
  s.t2 = createTask(state, alice, { title: 'B-指派bob', scope: 'family', familyId: family.id, assigneeId: bob.id, priority: PRIORITY.LOW });
  s.t3 = createTask(state, alice, { title: 'C-个人', scope: 'personal', status: STATUS.DONE });
  s.t4 = createTask(state, bob, { title: 'D-家庭已完成', scope: 'family', familyId: family.id, status: STATUS.DONE });

  return s;
}

const ids = (list) => list.map((t) => t.title).sort();

test('status 缺省为 open，排除已完成任务', () => {
  const s = seedFiltered();
  const list = listTasks(s.state, s.alice, {});
  assert.deepStrictEqual(ids(list), ['A-家庭公共', 'B-指派bob'], 'done 不应出现在缺省列表');
});

test('status=done 只返回已完成任务', () => {
  const s = seedFiltered();
  assert.deepStrictEqual(ids(listTasks(s.state, s.alice, { status: 'done' })), ['C-个人', 'D-家庭已完成']);
});

test('status=all 返回全部', () => {
  const s = seedFiltered();
  assert.strictEqual(listTasks(s.state, s.alice, { status: 'all' }).length, 4);
});

test('按 scope 与 familyId 筛选', () => {
  const s = seedFiltered();
  assert.deepStrictEqual(ids(listTasks(s.state, s.alice, { status: 'all', scope: 'personal' })), ['C-个人']);
  assert.deepStrictEqual(
    ids(listTasks(s.state, s.alice, { status: 'all', familyId: s.family.id })),
    ['A-家庭公共', 'B-指派bob', 'D-家庭已完成'],
  );
});

test('按指派人筛选：public / me / 指定用户', () => {
  const s = seedFiltered();
  assert.deepStrictEqual(ids(listTasks(s.state, s.alice, { status: 'all', assignee: 'public' })).filter((t) => t !== 'C-个人'), ['A-家庭公共', 'D-家庭已完成']);
  assert.strictEqual(listTasks(s.state, s.bob, { status: 'all', assignee: 'me' }).length, 1);
  assert.strictEqual(listTasks(s.state, s.bob, { status: 'all', assignee: 'me' })[0].title, 'B-指派bob');
  assert.deepStrictEqual(
    listTasks(s.state, s.alice, { status: 'all', assignee: s.bob.id }).map((t) => t.title),
    ['B-指派bob'],
  );
});

test('按创建者筛选', () => {
  const s = seedFiltered();
  assert.deepStrictEqual(ids(listTasks(s.state, s.alice, { status: 'all', creator: s.bob.id })), ['D-家庭已完成']);
});

test('按优先级多选筛选（OR）', () => {
  const s = seedFiltered();
  const list = listTasks(s.state, s.alice, { status: 'all', priority: [PRIORITY.HIGH, PRIORITY.LOW] });
  assert.deepStrictEqual(ids(list), ['A-家庭公共', 'B-指派bob']);
});

test('按到期日区间筛选', () => {
  const s = seedFiltered();
  assert.deepStrictEqual(ids(listTasks(s.state, s.alice, { status: 'all', dueFrom: TOMORROW, dueTo: TOMORROW })), ['A-家庭公共']);
});

test('overdue 只含未完成且已逾期', () => {
  const s = seedFiltered();
  updateTask(s.state, s.alice, s.t2.id, { dueDate: '2020-01-01' });
  updateTask(s.state, s.alice, s.t4.id, { dueDate: '2020-01-01' });

  const overdue = listTasks(s.state, s.alice, { status: 'all', overdue: true });
  assert.deepStrictEqual(overdue.map((t) => t.title), ['B-指派bob'], '已完成的逾期任务不应计入');
});

test('悬空指派按公共任务处理', () => {
  const s = seedFiltered();
  s.t2.assigneeId = 'u_ghost'; // 模拟非成员

  const list = listTasks(s.state, s.alice, { status: 'all', assignee: 'public' });
  assert.ok(list.some((t) => t.id === s.t2.id), '悬空指派应回退为公共任务');
});

test('跨维度筛选为 AND 关系', () => {
  const s = seedFiltered();
  const list = listTasks(s.state, s.alice, {
    status: 'all', scope: 'family', familyId: s.family.id, assignee: 'public', priority: [PRIORITY.HIGH],
  });
  assert.deepStrictEqual(list.map((t) => t.title), ['A-家庭公共']);
});

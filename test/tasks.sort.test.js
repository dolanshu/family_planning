'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createTask, updateTask, listTasks, normalizeSort,
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
  joinFamily(state, { inviteCode: family.inviteCode, userId: carol.id });
  return { state, alice, bob, carol, family };
}

function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function titles(tasks) {
  return tasks.map((t) => t.title);
}

// ---------- normalizeSort ----------

test('normalizeSort 默认字段为 priority，默认方向 desc', () => {
  assert.deepStrictEqual(normalizeSort(), { sort: 'priority', order: 'desc' });
  assert.deepStrictEqual(normalizeSort(''), { sort: 'priority', order: 'desc' });
});

test('normalizeSort 各字段默认方向', () => {
  assert.deepStrictEqual(normalizeSort('priority'), { sort: 'priority', order: 'desc' });
  assert.deepStrictEqual(normalizeSort('assignee'), { sort: 'assignee', order: 'asc' });
  assert.deepStrictEqual(normalizeSort('dueDate'), { sort: 'dueDate', order: 'asc' });
  assert.deepStrictEqual(normalizeSort('status'), { sort: 'status', order: 'asc' });
});

test('normalizeSort 非法字段或方向抛 400', () => {
  assert.throws(() => normalizeSort('bogus'), { status: 400 });
  assert.throws(() => normalizeSort('priority', 'sideways'), { status: 400 });
});

// ---------- 优先级排序 ----------

test('默认排序为优先级降序（高 → 低）', () => {
  const { state, alice } = seed();
  createTask(state, alice, { title: '低', priority: PRIORITY.LOW });
  createTask(state, alice, { title: '高', priority: PRIORITY.HIGH });
  createTask(state, alice, { title: '无', priority: PRIORITY.NONE });
  createTask(state, alice, { title: '中', priority: PRIORITY.MEDIUM });

  assert.deepStrictEqual(titles(listTasks(state, alice, {})), ['高', '中', '低', '无']);
  assert.deepStrictEqual(titles(listTasks(state, alice, { sort: 'priority', order: 'desc' })), ['高', '中', '低', '无']);
});

test('优先级升序为（低 → 高）', () => {
  const { state, alice } = seed();
  createTask(state, alice, { title: '低', priority: PRIORITY.LOW });
  createTask(state, alice, { title: '高', priority: PRIORITY.HIGH });
  createTask(state, alice, { title: '中', priority: PRIORITY.MEDIUM });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { sort: 'priority', order: 'asc' })),
    ['低', '中', '高'],
  );
});

// ---------- 兜底顺序 ----------

test('主字段相同时兜底：优先级降 → 到期日升 → 创建时间升', () => {
  const { state, alice } = seed();
  const early = createTask(state, alice, { title: '先建', priority: PRIORITY.HIGH, dueDate: ymd(5) });
  const later = createTask(state, alice, { title: '后建', priority: PRIORITY.HIGH, dueDate: ymd(1) });
  early.createdAt = '2026-01-01T00:00:00.000Z';
  later.createdAt = '2026-01-02T00:00:00.000Z';

  // 同优先级（HIGH）→ 按到期日升序：ymd(1) 的「后建」在前
  assert.deepStrictEqual(titles(listTasks(state, alice, { sort: 'priority' })), ['后建', '先建']);

  // 到期日也相同时 → 按创建时间升序
  later.dueDate = early.dueDate;
  assert.deepStrictEqual(titles(listTasks(state, alice, { sort: 'priority' })), ['先建', '后建']);
});

// ---------- 到期日排序 ----------

test('按到期日升序：近 → 远，无到期日排最后', () => {
  const { state, alice } = seed();
  createTask(state, alice, { title: '远', dueDate: ymd(10) });
  createTask(state, alice, { title: '无日期' });
  createTask(state, alice, { title: '近', dueDate: ymd(1) });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { sort: 'dueDate', order: 'asc' })),
    ['近', '远', '无日期'],
  );
});

test('按到期日降序：远 → 近，无到期日仍排最后', () => {
  const { state, alice } = seed();
  createTask(state, alice, { title: '远', dueDate: ymd(10) });
  createTask(state, alice, { title: '无日期' });
  createTask(state, alice, { title: '近', dueDate: ymd(1) });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { sort: 'dueDate', order: 'desc' })),
    ['远', '近', '无日期'],
  );
});

// ---------- 指派人排序 ----------

test('按指派人升序：按用户名排序，公共任务排最后', () => {
  const { state, alice, bob, carol, family } = seed();
  createTask(state, alice, { title: '指派carol', scope: 'family', familyId: family.id, assigneeId: carol.id });
  createTask(state, alice, { title: '公共', scope: 'family', familyId: family.id });
  createTask(state, alice, { title: '指派bob', scope: 'family', familyId: family.id, assigneeId: bob.id });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { scope: 'family', sort: 'assignee', order: 'asc' })),
    ['指派bob', '指派carol', '公共'],
  );
});

test('按指派人降序：用户名倒序，公共任务仍排最后', () => {
  const { state, alice, bob, carol, family } = seed();
  createTask(state, alice, { title: '指派carol', scope: 'family', familyId: family.id, assigneeId: carol.id });
  createTask(state, alice, { title: '公共', scope: 'family', familyId: family.id });
  createTask(state, alice, { title: '指派bob', scope: 'family', familyId: family.id, assigneeId: bob.id });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { scope: 'family', sort: 'assignee', order: 'desc' })),
    ['指派carol', '指派bob', '公共'],
  );
});

// ---------- 状态排序 ----------

test('按状态升序：等待 → 进行中 → 完成', () => {
  const { state, alice } = seed();
  const done = createTask(state, alice, { title: '完成' });
  const doing = createTask(state, alice, { title: '进行中' });
  const waiting = createTask(state, alice, { title: '等待' });
  updateTask(state, alice, doing.id, { status: STATUS.DOING });
  updateTask(state, alice, done.id, { status: STATUS.DONE });
  void waiting;

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { status: 'all', sort: 'status', order: 'asc' })),
    ['等待', '进行中', '完成'],
  );
});

test('按状态降序：完成 → 进行中 → 等待', () => {
  const { state, alice } = seed();
  const done = createTask(state, alice, { title: '完成' });
  const doing = createTask(state, alice, { title: '进行中' });
  createTask(state, alice, { title: '等待' });
  updateTask(state, alice, doing.id, { status: STATUS.DOING });
  updateTask(state, alice, done.id, { status: STATUS.DONE });

  assert.deepStrictEqual(
    titles(listTasks(state, alice, { status: 'all', sort: 'status', order: 'desc' })),
    ['完成', '进行中', '等待'],
  );
});

// ---------- 与筛选叠加 ----------

test('排序与筛选叠加：先过滤再排序', () => {
  const { state, alice } = seed();
  createTask(state, alice, { title: '高中', priority: PRIORITY.HIGH, dueDate: ymd(9) });
  createTask(state, alice, { title: '低近', priority: PRIORITY.LOW, dueDate: ymd(1) });
  createTask(state, alice, { title: '高近', priority: PRIORITY.HIGH, dueDate: ymd(2) });

  // 只看高优先级 → 只剩两条，再按到期日升序
  assert.deepStrictEqual(
    titles(listTasks(state, alice, { priority: '3', sort: 'dueDate' })),
    ['高近', '高中'],
  );
});

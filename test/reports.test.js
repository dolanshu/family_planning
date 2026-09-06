'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { completedReport, toCsv, STATUS_LABEL, PRIORITY_LABEL } = require('../src/domain/reports');
const { createTask } = require('../src/domain/tasks');
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

/** 造一个已完成任务：createdAt 早 2 小时，completedAt 落在指定本地日期。 */
function doneTask(state, user, { title, day, assigneeId, familyId, priority }) {
  const task = createTask(state, user, {
    title,
    status: 'done',
    scope: familyId ? 'family' : 'personal',
    familyId,
    assigneeId,
    priority,
  });
  task.createdAt = `${day}T01:00:00.000Z`;
  task.completedAt = `${day}T03:00:00.000Z`;
  return task;
}

test('只统计区间内完成的任务', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: '区间内', day: '2026-09-05' });
  doneTask(s.state, s.alice, { title: '区间外', day: '2026-08-01' });
  createTask(s.state, s.alice, { title: '未完成' });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' });

  assert.strictEqual(report.summary.total, 1);
  assert.strictEqual(report.items[0].title, '区间内');
  assert.strictEqual(report.summary.created, 2, '区间内新增任务数按 createdAt 统计（区间内的已完成 + 未完成）');
});

test('trend 按 day / week / month / year 分桶', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'a', day: '2026-09-05' });
  doneTask(s.state, s.alice, { title: 'b', day: '2026-09-06' });
  doneTask(s.state, s.alice, { title: 'c', day: '2026-10-02' });

  const base = { from: '2026-09-01', to: '2026-10-31' };

  const day = completedReport(s.state, s.alice, { ...base, groupBy: 'day' });
  assert.deepStrictEqual(day.trend.map((t) => t.bucket), ['2026-09-05', '2026-09-06', '2026-10-02']);
  assert.deepStrictEqual(day.trend.map((t) => t.count), [1, 1, 1]);

  const month = completedReport(s.state, s.alice, { ...base, groupBy: 'month' });
  assert.deepStrictEqual(month.trend.map((t) => t.bucket), ['2026-09', '2026-10']);
  assert.deepStrictEqual(month.trend.map((t) => t.count), [2, 1]);

  const year = completedReport(s.state, s.alice, { ...base, groupBy: 'year' });
  assert.deepStrictEqual(year.trend, [{ bucket: '2026', count: 3 }]);

  const week = completedReport(s.state, s.alice, { ...base, groupBy: 'week' });
  assert.strictEqual(week.trend.reduce((n, t) => n + t.count, 0), 3);
  assert.ok(week.trend.every((t) => /^\d{4}-W\d{2}$/.test(t.bucket)));
});

test('byUser 按指派人归集，含「全体」桶且合计等于 total', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: '公共1', day: '2026-09-05', familyId: s.family.id });
  doneTask(s.state, s.alice, { title: '公共2', day: '2026-09-06', familyId: s.family.id });
  doneTask(s.state, s.alice, { title: '指派bob', day: '2026-09-07', familyId: s.family.id, assigneeId: s.bob.id });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30', scope: 'family' });

  assert.strictEqual(report.summary.total, 3);
  const sum = report.byUser.reduce((n, u) => n + u.count, 0);
  assert.strictEqual(sum, 3, '各人员完成数之和应等于总数');

  const publicBucket = report.byUser.find((u) => u.userId === 'public');
  assert.strictEqual(publicBucket.count, 2);
  assert.strictEqual(publicBucket.username, '全体');

  const bobBucket = report.byUser.find((u) => u.userId === s.bob.id);
  assert.strictEqual(bobBucket.count, 1);
  assert.strictEqual(bobBucket.username, 'bob');
});

test('byPriority 合计等于 total', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'a', day: '2026-09-05', priority: 3 });
  doneTask(s.state, s.alice, { title: 'b', day: '2026-09-06', priority: 1 });
  doneTask(s.state, s.alice, { title: 'c', day: '2026-09-07' });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' });

  assert.strictEqual(report.byPriority[3], 1);
  assert.strictEqual(report.byPriority[1], 1);
  assert.strictEqual(report.byPriority[0], 1);
  assert.strictEqual(
    Object.values(report.byPriority).reduce((a, b) => a + b, 0),
    report.summary.total,
  );
});

test('summary 计算完成率与平均耗时', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'a', day: '2026-09-05' });
  doneTask(s.state, s.alice, { title: 'b', day: '2026-09-06' });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' });

  assert.strictEqual(report.summary.total, 2);
  assert.strictEqual(report.summary.created, 2);
  assert.strictEqual(report.summary.completionRate, 1);
  assert.strictEqual(report.summary.avgHours, 2, '创建到完成相隔 2 小时');
});

test('不泄漏其他用户的私人任务', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'alice 私人', day: '2026-09-05' });
  doneTask(s.state, s.carol, { title: 'carol 私人', day: '2026-09-06' });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' });

  assert.strictEqual(report.summary.total, 1);
  assert.strictEqual(report.items[0].title, 'alice 私人');
});

test('assignee=public 只统计公共任务', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: '公共', day: '2026-09-05', familyId: s.family.id });
  doneTask(s.state, s.alice, { title: '指派bob', day: '2026-09-06', familyId: s.family.id, assigneeId: s.bob.id });

  const report = completedReport(s.state, s.alice, {
    from: '2026-09-01', to: '2026-09-30', assignee: 'public',
  });

  assert.strictEqual(report.summary.total, 1);
  assert.strictEqual(report.items[0].title, '公共');
});

test('未指定区间时默认最近 30 天', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: '今天完成', day: new Date().toISOString().slice(0, 10) });

  const report = completedReport(s.state, s.alice, {});
  assert.strictEqual(report.summary.total, 1);
  assert.ok(report.range.from && report.range.to);
});

test('区间非法时抛 400', () => {
  const s = seed();
  assert.throws(
    () => completedReport(s.state, s.alice, { from: '2026-09-30', to: '2026-09-01' }),
    { status: 400 },
  );
  assert.throws(
    () => completedReport(s.state, s.alice, { from: '2019-01-01', to: '2026-09-01' }),
    { status: 400 },
  );
  assert.throws(
    () => completedReport(s.state, s.alice, { from: '2026-13-01', to: '2026-09-01' }),
    { status: 400 },
  );
});

test('items 附带可读性字段', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'a', day: '2026-09-05', familyId: s.family.id, assigneeId: s.bob.id, priority: 3 });

  const item = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' }).items[0];

  assert.strictEqual(item.assigneeName, 'bob');
  assert.strictEqual(item.creatorName, 'alice');
  assert.strictEqual(item.familyName, '张家');
  assert.strictEqual(item.statusLabel, STATUS_LABEL.done);
  assert.strictEqual(item.priorityLabel, PRIORITY_LABEL[3]);
  assert.strictEqual(item.durationHours, 2);
});

test('CSV 带 BOM、表头与正确行数', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: 'a', day: '2026-09-05' });
  doneTask(s.state, s.alice, { title: 'b', day: '2026-09-06' });

  const report = completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' });
  const csv = toCsv(report);

  assert.ok(csv.startsWith('\uFEFF'), 'CSV 应以 UTF-8 BOM 开头');
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');
  assert.strictEqual(lines.length, 3, '表头 + 2 行数据');
  assert.ok(lines[0].includes('标题'));
  assert.ok(lines[0].includes('指派人'));
  assert.ok(lines[0].includes('耗时(小时)'));
});

test('CSV 对含逗号和引号的标题正确转义', () => {
  const s = seed();
  doneTask(s.state, s.alice, { title: '买牛奶, 鸡蛋 "特价"', day: '2026-09-05' });

  const csv = toCsv(completedReport(s.state, s.alice, { from: '2026-09-01', to: '2026-09-30' }));
  const dataLine = csv.replace(/^\uFEFF/, '').trim().split('\n')[1];

  assert.ok(dataLine.startsWith('"买牛奶, 鸡蛋 ""特价"""'), dataLine);
});

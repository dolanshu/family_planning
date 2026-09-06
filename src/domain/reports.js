'use strict';

const { badRequest } = require('./errors');
const {
  listTasks, effectiveAssigneeId, todayStr, STATUS,
} = require('./tasks');
const { findById } = require('./users');
const { findFamilyById } = require('./families');

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 730;
const GROUP_BY = ['day', 'week', 'month', 'year'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_LABEL = { waiting: '等待', doing: '进行中', done: '完成' };
const PRIORITY_LABEL = { 0: '无', 1: '低', 2: '中', 3: '高' };
const PUBLIC_USER_ID = 'public';
const PUBLIC_USER_NAME = '全体';

const CSV_HEADER = [
  '标题', '状态', '优先级', '创建人', '指派人', '归属',
  '创建时间', '完成时间', '耗时(小时)', '到期日',
];

// ---------- 日期工具 ----------

function isValidDateStr(value) {
  return typeof value === 'string'
    && DATE_RE.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function resolveRange(from, to) {
  const today = todayStr();
  const start = from || shiftDays(today, -(DEFAULT_RANGE_DAYS - 1));
  const end = to || today;

  if (!isValidDateStr(start)) throw badRequest('开始日期需为 YYYY-MM-DD');
  if (!isValidDateStr(end)) throw badRequest('结束日期需为 YYYY-MM-DD');
  if (start > end) throw badRequest('开始日期不能晚于结束日期');
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) {
    throw badRequest(`统计区间不能超过 ${MAX_RANGE_DAYS} 天`);
  }

  return { from: start, to: end };
}

function normalizeGroupBy(value) {
  if (value === undefined || value === null || value === '') return 'day';
  if (!GROUP_BY.includes(value)) throw badRequest('groupBy 只能是 day / week / month / year');
  return value;
}

/** ISO 时间戳 → 本地日期字符串 YYYY-MM-DD。 */
function localDayOf(iso) {
  return todayStr(new Date(iso));
}

function isoWeekKey(dayStr) {
  const d = new Date(`${dayStr}T00:00:00`);
  const weekday = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - weekday);
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function bucketKey(dayStr, groupBy) {
  switch (groupBy) {
    case 'week': return isoWeekKey(dayStr);
    case 'month': return dayStr.slice(0, 7);
    case 'year': return dayStr.slice(0, 4);
    default: return dayStr;
  }
}

// ---------- 聚合 ----------

function durationHours(task) {
  if (!task.completedAt) return null;
  const ms = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
  return Math.round((ms / 3600000) * 10) / 10;
}

function decorate(state, task) {
  const assigneeId = effectiveAssigneeId(state, task);
  const assignee = assigneeId ? findById(state, assigneeId) : null;
  const creator = findById(state, task.ownerId);
  const family = task.familyId ? findFamilyById(state, task.familyId) : null;

  return {
    ...task,
    assigneeId,
    assigneeName: assignee ? assignee.username : PUBLIC_USER_NAME,
    creatorName: creator ? creator.username : '未知',
    familyName: family ? family.name : '',
    statusLabel: STATUS_LABEL[task.status] || task.status,
    priorityLabel: PRIORITY_LABEL[task.priority] || PRIORITY_LABEL[0],
    durationHours: durationHours(task),
  };
}

function buildTrend(completed, groupBy) {
  const counts = new Map();
  for (const task of completed) {
    const key = bucketKey(localDayOf(task.completedAt), groupBy);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

function buildByUser(completed, state) {
  const counts = new Map();

  for (const task of completed) {
    const id = effectiveAssigneeId(state, task);
    const key = id || PUBLIC_USER_ID;

    let entry = counts.get(key);
    if (!entry) {
      const user = id ? findById(state, id) : null;
      entry = {
        userId: key,
        username: key === PUBLIC_USER_ID ? PUBLIC_USER_NAME : (user ? user.username : '未知'),
        count: 0,
      };
      counts.set(key, entry);
    }
    entry.count += 1;
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function buildByPriority(completed) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const task of completed) {
    counts[task.priority] = (counts[task.priority] || 0) + 1;
  }
  return counts;
}

/**
 * 生成「已完成任务」统计报告。
 * 人员维度统一按 assigneeId 归集，未指派归入「全体」桶。
 */
function completedReport(state, user, options = {}) {
  const { from, to } = resolveRange(options.from, options.to);
  const groupBy = normalizeGroupBy(options.groupBy);

  const visible = listTasks(state, user, {
    status: 'all',
    scope: options.scope || 'all',
    familyId: options.familyId,
    assignee: options.assignee,
    creator: options.creator,
  });

  const inRange = (iso) => {
    const day = localDayOf(iso);
    return day >= from && day <= to;
  };

  const completed = visible.filter(
    (t) => t.status === STATUS.DONE && t.completedAt && inRange(t.completedAt),
  );
  const created = visible.filter((t) => inRange(t.createdAt));

  const items = completed
    .map((task) => decorate(state, task))
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  return {
    range: { from, to, groupBy },
    summary: {
      total: completed.length,
      created: created.length,
      completionRate: created.length
        ? Math.round((completed.length / created.length) * 100) / 100
        : null,
      avgHours: completed.length
        ? Math.round(
          (completed.reduce((sum, t) => sum + (durationHours(t) || 0), 0) / completed.length) * 10,
        ) / 10
        : null,
    },
    trend: buildTrend(completed, groupBy),
    byUser: buildByUser(completed, state),
    byPriority: buildByPriority(completed),
    items,
  };
}

// ---------- CSV ----------

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 输出带 UTF-8 BOM 的 CSV，保证 Excel 打开中文不乱码。 */
function toCsv(report) {
  const rows = [CSV_HEADER];
  for (const item of report.items) {
    rows.push([
      item.title,
      item.statusLabel,
      item.priorityLabel,
      item.creatorName,
      item.assigneeName,
      item.familyName || '个人',
      item.createdAt,
      item.completedAt,
      item.durationHours === null ? '' : item.durationHours,
      item.dueDate || '',
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
}

module.exports = {
  completedReport,
  toCsv,
  csvCell,
  resolveRange,
  localDayOf,
  isoWeekKey,
  STATUS_LABEL,
  PRIORITY_LABEL,
  PUBLIC_USER_ID,
  PUBLIC_USER_NAME,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
};

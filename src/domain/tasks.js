'use strict';

const { badRequest, notFound } = require('./errors');
const { newId } = require('./users');
const { requireFamily, requireMember, findFamilyById } = require('./families');

const STATUS = { WAITING: 'waiting', DOING: 'doing', DONE: 'done' };
const STATUS_LIST = Object.values(STATUS);

const PRIORITY = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const PRIORITY_LIST = Object.values(PRIORITY);

const TITLE_MAX = 200;
const NOTES_MAX = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- 归一化与校验 ----------

function validateTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw badRequest('任务标题不能为空');
  if (title.length > TITLE_MAX) throw badRequest(`任务标题不能超过 ${TITLE_MAX} 个字符`);
  return title;
}

function normalizeStatus(value, fallback = STATUS.WAITING) {
  if (value === undefined) return fallback;
  if (!STATUS_LIST.includes(value)) throw badRequest('任务状态无效');
  return value;
}

function normalizePriority(value, fallback = PRIORITY.NONE) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!PRIORITY_LIST.includes(num)) throw badRequest('任务优先级无效');
  return num;
}

function normalizeDate(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (!DATE_RE.test(text)) throw badRequest('日期格式需为 YYYY-MM-DD');
  if (Number.isNaN(new Date(`${text}T00:00:00`).getTime())) throw badRequest('日期无效');
  return text;
}

function normalizeNotes(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).slice(0, NOTES_MAX);
}

/** 本地时区的今天，格式 YYYY-MM-DD。 */
function todayStr(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- 查询辅助 ----------

function findTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId) || null;
}

function canAccess(user, task) {
  if (!user || !task) return false;
  if (task.scope === 'personal') return task.ownerId === user.id;
  if (task.scope === 'family') {
    return Boolean(task.familyId) && user.familyIds.includes(task.familyId);
  }
  return false;
}

function requireAccess(user, task) {
  // 越权统一按 404 处理，避免泄露资源是否存在
  if (!canAccess(user, task)) throw notFound('任务不存在');
  return task;
}

/** 有效指派人：非家庭任务或指派已失效（非成员）时按公共任务处理。 */
function effectiveAssigneeId(state, task) {
  if (task.scope !== 'family') return null;
  const family = findFamilyById(state, task.familyId);
  if (!family) return null;
  if (!task.assigneeId) return null;
  return family.memberIds.includes(task.assigneeId) ? task.assigneeId : null;
}

function toTokenList(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const source = Array.isArray(raw) ? raw : String(raw).split(',');
  const tokens = source.map((s) => String(s).trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.includes('all')) return null;
  return tokens;
}

// ---------- 写操作 ----------

function buildTask(state, user, input) {
  const status = normalizeStatus(input.status);
  const now = new Date().toISOString();

  const task = {
    id: newId('t'),
    title: validateTitle(input.title),
    notes: normalizeNotes(input.notes),
    status,
    priority: normalizePriority(input.priority),
    scope: 'personal',
    ownerId: user.id,
    familyId: null,
    assigneeId: null,
    dueDate: normalizeDate(input.dueDate),
    createdAt: now,
    updatedAt: now,
    completedAt: status === STATUS.DONE ? now : null,
  };

  if (input.scope === 'family') {
    const family = requireFamily(state, input.familyId);
    requireMember(family, user.id);

    task.scope = 'family';
    task.familyId = family.id;
    if (input.assigneeId) {
      requireMember(family, input.assigneeId);
      task.assigneeId = input.assigneeId;
    }
  }

  return task;
}

function createTask(state, user, input = {}) {
  const task = buildTask(state, user, input);
  state.tasks.push(task);
  return task;
}

function applyStatus(task, status, now) {
  task.status = status;
  task.completedAt = status === STATUS.DONE ? (task.completedAt || now) : null;
}

function updateTask(state, user, taskId, patch = {}) {
  const task = requireAccess(user, findTask(state, taskId));
  const now = new Date().toISOString();

  if (patch.title !== undefined) task.title = validateTitle(patch.title);
  if (patch.notes !== undefined) task.notes = normalizeNotes(patch.notes);
  if (patch.priority !== undefined) task.priority = normalizePriority(patch.priority);
  if (patch.dueDate !== undefined) task.dueDate = normalizeDate(patch.dueDate);

  // 归属变更需先处理，后续指派校验依赖新的 scope
  if (patch.scope !== undefined) {
    const nextScope = patch.scope === 'family' ? 'family' : 'personal';
    if (nextScope !== task.scope) {
      if (nextScope === 'family') {
        const family = requireFamily(state, patch.familyId || task.familyId);
        requireMember(family, user.id);
        task.scope = 'family';
        task.familyId = family.id;
        if (task.assigneeId && !family.memberIds.includes(task.assigneeId)) {
          task.assigneeId = null;
        }
      } else {
        task.scope = 'personal';
        task.familyId = null;
        task.assigneeId = null;
      }
    }
  }

  if (patch.assigneeId !== undefined) {
    if (task.scope !== 'family') {
      task.assigneeId = null;
    } else {
      const family = requireFamily(state, task.familyId);
      if (!patch.assigneeId) {
        task.assigneeId = null;
      } else {
        requireMember(family, patch.assigneeId);
        task.assigneeId = patch.assigneeId;
      }
    }
  }

  if (patch.status !== undefined) {
    applyStatus(task, normalizeStatus(patch.status), now);
  }

  task.updatedAt = now;
  return task;
}

function deleteTask(state, user, taskId) {
  const task = requireAccess(user, findTask(state, taskId));
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  return task;
}

// ---------- 查询 ----------

/**
 * 列出用户可见且命中筛选条件的任务。
 * 跨维度为 AND，同一维度多值为 OR。
 */
function listTasks(state, user, filters = {}) {
  const {
    status = 'open',
    scope = 'all',
    familyId,
    assignee,
    creator,
    priority,
    dueFrom,
    dueTo,
    overdue,
  } = filters;

  const assigneeTokens = toTokenList(assignee);
  const creatorTokens = toTokenList(creator);
  const priorityTokens = toTokenList(priority);
  const today = todayStr();

  const result = state.tasks.filter((task) => {
    if (!canAccess(user, task)) return false;

    if (status !== 'all') {
      if (status === 'open') {
        if (task.status === STATUS.DONE) return false;
      } else if (task.status !== status) {
        return false;
      }
    }

    if (scope !== 'all' && task.scope !== scope) return false;
    if (familyId && task.familyId !== familyId) return false;

    if (assigneeTokens) {
      const owner = effectiveAssigneeId(state, task);
      const hit = assigneeTokens.some((token) => {
        if (token === 'public') return owner === null;
        if (token === 'me') return owner === user.id;
        return owner === token;
      });
      if (!hit) return false;
    }

    if (creatorTokens && !creatorTokens.includes(task.ownerId)) return false;

    if (priorityTokens && !priorityTokens.includes(String(task.priority))) return false;

    if (dueFrom && (!task.dueDate || task.dueDate < dueFrom)) return false;
    if (dueTo && (!task.dueDate || task.dueDate > dueTo)) return false;

    if (overdue === true || overdue === 'true') {
      if (!task.dueDate || task.dueDate >= today) return false;
      if (task.status === STATUS.DONE) return false;
    }

    return true;
  });

  return result.sort(compareTasks);
}

/** 有到期日的排前并按日期升序；同日按优先级降序；再按创建时间升序。 */
function compareTasks(a, b) {
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  } else if (a.dueDate && !b.dueDate) {
    return -1;
  } else if (!a.dueDate && b.dueDate) {
    return 1;
  }

  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.createdAt < b.createdAt ? -1 : 1;
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  listTasks,
  findTask,
  canAccess,
  requireAccess,
  effectiveAssigneeId,
  todayStr,
  STATUS,
  STATUS_LIST,
  PRIORITY,
  PRIORITY_LIST,
  TITLE_MAX,
  NOTES_MAX,
};

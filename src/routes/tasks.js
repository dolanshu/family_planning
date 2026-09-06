'use strict';

const express = require('express');

const { createTask, updateTask, deleteTask, listTasks } = require('../domain/tasks');
const { requireAuth } = require('../middleware/auth');
const { wrapAsync } = require('../middleware/error');

const router = express.Router();

router.use(requireAuth);

/** 从 query string 解析筛选条件，未提供的维度保持默认。 */
function parseFilters(query = {}) {
  return {
    status: query.status || 'open',
    scope: query.scope || 'all',
    familyId: query.familyId,
    assignee: query.assignee,
    creator: query.creator,
    priority: query.priority,
    dueFrom: query.dueFrom,
    dueTo: query.dueTo,
    overdue: query.overdue,
  };
}

function taskInput(body = {}) {
  return {
    title: body.title,
    notes: body.notes,
    status: body.status,
    priority: body.priority,
    scope: body.scope,
    familyId: body.familyId,
    assigneeId: body.assigneeId,
    dueDate: body.dueDate,
  };
}

router.get('/', (req, res) => {
  const state = req.app.get('store').getState();
  res.json({ tasks: listTasks(state, req.user, parseFilters(req.query)) });
});

router.post('/', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const task = store.mutate((state) => createTask(state, req.user, taskInput(req.body)));
  await store.commit();
  res.status(201).json({ task });
}));

router.patch('/:id', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const task = store.mutate((state) => updateTask(state, req.user, req.params.id, taskInput(req.body)));
  await store.commit();
  res.json({ task });
}));

router.delete('/:id', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  store.mutate((state) => { deleteTask(state, req.user, req.params.id); });
  await store.commit();
  res.json({ ok: true });
}));

module.exports = router;

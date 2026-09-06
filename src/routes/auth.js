'use strict';

const express = require('express');

const {
  createUser, findByUsername, verifyPassword, toPublicUser,
} = require('../domain/users');
const { badRequest, unauthorized, forbidden } = require('../domain/errors');
const { requireAuth } = require('../middleware/auth');
const { wrapAsync } = require('../middleware/error');

const router = express.Router();

router.post('/register', wrapAsync(async (req, res) => {
  const config = req.app.get('config');
  if (!config.allowRegistration) throw forbidden('注册已关闭');

  const store = req.app.get('store');
  const { username, password } = req.body || {};

  const user = store.mutate((state) => createUser(state, { username, password }));
  await store.commit();

  req.session.userId = user.id;
  res.status(201).json({ user: toPublicUser(user) });
}));

router.post('/login', (req, res) => {
  const store = req.app.get('store');
  const { username, password } = req.body || {};
  if (!username || !password) throw badRequest('请输入用户名和密码');

  const user = findByUsername(store.getState(), username);
  if (!user || !verifyPassword(user, password)) throw unauthorized('用户名或密码错误');

  req.session.userId = user.id;
  res.json({ user: toPublicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

module.exports = router;

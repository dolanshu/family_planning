'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const { badRequest, notFound, conflict } = require('./errors');

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 6;
const BCRYPT_ROUNDS = 10;

// 允许中英文、数字、下划线与连字符
const USERNAME_RE = /^[\w一-龥-]+$/u;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function validateCredentials(username, password) {
  const name = typeof username === 'string' ? username.trim() : '';
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    throw badRequest(`用户名长度需为 ${USERNAME_MIN}-${USERNAME_MAX} 个字符`);
  }
  if (!USERNAME_RE.test(name)) {
    throw badRequest('用户名只能包含中英文、数字、下划线或连字符');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw badRequest(`密码至少 ${PASSWORD_MIN} 位`);
  }
  return { name, password };
}

function findByUsername(state, username) {
  if (typeof username !== 'string') return null;
  const target = username.trim().toLowerCase();
  return state.users.find((u) => u.username.toLowerCase() === target) || null;
}

function findById(state, id) {
  return state.users.find((u) => u.id === id) || null;
}

function requireById(state, id) {
  const user = findById(state, id);
  if (!user) throw notFound('用户不存在');
  return user;
}

function createUser(state, { username, password }) {
  const { name, password: pwd } = validateCredentials(username, password);
  if (findByUsername(state, name)) throw conflict('用户名已存在');

  const user = {
    id: newId('u'),
    username: name,
    passwordHash: bcrypt.hashSync(pwd, BCRYPT_ROUNDS),
    familyIds: [],
    createdAt: new Date().toISOString(),
  };

  state.users.push(user);
  return user;
}

function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

module.exports = {
  createUser,
  findByUsername,
  findById,
  requireById,
  verifyPassword,
  toPublicUser,
  validateCredentials,
  newId,
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
};

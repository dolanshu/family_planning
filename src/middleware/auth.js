'use strict';

const { unauthorized } = require('../domain/errors');
const { findById } = require('../domain/users');

/** 校验会话并把当前用户挂到 req.user；未登录或用户已不存在时返回 401。 */
function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId) return next(unauthorized());

  const store = req.app.get('store');
  const user = findById(store.getState(), userId);
  if (!user) {
    req.session = null;
    return next(unauthorized());
  }

  req.user = user;
  return next();
}

module.exports = { requireAuth };

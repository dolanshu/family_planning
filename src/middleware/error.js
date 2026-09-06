'use strict';

const { notFound } = require('../domain/errors');

/** 所有未匹配的 /api 请求统一返回 JSON 404。 */
function apiNotFound(req, res, next) {
  next(notFound('接口不存在'));
}

/** 包装异步路由：把 rejection 交给错误中间件（Express 4 不处理 async 错误）。 */
function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** 统一错误处理：AppError 带状态码往外透出，其余按 500 处理且不泄露细节。 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = Number.isInteger(err.status) ? err.status : 500;
  const code = err.code || 'internal_error';

  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? '服务器内部错误' : err.message,
    },
  });
}

module.exports = { apiNotFound, errorHandler, wrapAsync };

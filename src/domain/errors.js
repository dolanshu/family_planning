'use strict';

/** 带 HTTP 状态码的应用错误，由统一错误中间件转成 JSON 响应。 */
class AppError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg) => new AppError(msg, 400, 'bad_request');
const unauthorized = (msg = '未登录') => new AppError(msg, 401, 'unauthorized');
const forbidden = (msg = '无权限') => new AppError(msg, 403, 'forbidden');
const notFound = (msg = '资源不存在') => new AppError(msg, 404, 'not_found');
const conflict = (msg) => new AppError(msg, 409, 'conflict');

module.exports = {
  AppError, badRequest, unauthorized, forbidden, notFound, conflict,
};

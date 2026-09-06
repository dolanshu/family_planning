'use strict';

const path = require('node:path');

const DEV_SESSION_SECRET = 'family-planning-dev-only-secret';

const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * 将环境变量字符串解析为布尔值。
 * 空值/未设置时返回 defaultValue。
 */
function toBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !FALSY.has(String(value).toLowerCase());
}

/**
 * 从环境变量构建配置对象。
 * @param {NodeJS.ProcessEnv} env
 */
function loadConfig(env = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET ? String(env.SESSION_SECRET) : '';

  if (isProduction && !sessionSecret) {
    throw new Error('生产环境必须设置环境变量 SESSION_SECRET');
  }
  if (!isProduction && !sessionSecret) {
    console.warn('[config] 警告：未设置 SESSION_SECRET，正在使用开发用默认值，请勿用于生产环境。');
  }

  const trustProxy = toBool(env.TRUST_PROXY, false);

  return {
    isProduction,
    port: Number.parseInt(env.PORT || '3000', 10),
    dataFile: env.DATA_FILE
      ? path.resolve(env.DATA_FILE)
      : path.resolve(process.cwd(), 'data', 'todo.json'),
    sessionSecret: sessionSecret || DEV_SESSION_SECRET,
    trustProxy,
    allowRegistration: toBool(env.ALLOW_REGISTRATION, true),
    timezone: env.TZ || 'Asia/Shanghai',
    // 仅在确认处于 HTTPS（反代后）时下发 secure Cookie。
    // 注意：不能只凭 NODE_ENV=production 判断，否则纯 HTTP 局域网部署会登录失败。
    secureCookies: toBool(env.COOKIE_SECURE, trustProxy),
  };
}

module.exports = { loadConfig, toBool, DEV_SESSION_SECRET };

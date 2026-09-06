'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { loadConfig, DEV_SESSION_SECRET } = require('../src/config');

test('loadConfig 返回默认值', () => {
  const cfg = loadConfig({});

  assert.strictEqual(cfg.port, 3000);
  assert.strictEqual(cfg.dataFile, path.resolve(process.cwd(), 'data', 'todo.json'));
  assert.strictEqual(cfg.allowRegistration, true);
  assert.strictEqual(cfg.trustProxy, false);
  assert.strictEqual(cfg.secureCookies, false);
  assert.strictEqual(cfg.timezone, 'Asia/Shanghai');
  assert.strictEqual(cfg.isProduction, false);
});

test('环境变量可覆盖默认值', () => {
  const cfg = loadConfig({
    PORT: '8080',
    DATA_FILE: '/tmp/custom/todo.json',
    ALLOW_REGISTRATION: 'false',
    TRUST_PROXY: '1',
    TZ: 'UTC',
    SESSION_SECRET: 's3cret',
  });

  assert.strictEqual(cfg.port, 8080);
  assert.strictEqual(cfg.dataFile, path.resolve('/tmp/custom/todo.json'));
  assert.strictEqual(cfg.allowRegistration, false);
  assert.strictEqual(cfg.trustProxy, true);
  assert.strictEqual(cfg.timezone, 'UTC');
  assert.strictEqual(cfg.sessionSecret, 's3cret');
});

test('TRUST_PROXY 开启时 secureCookies 为 true', () => {
  assert.strictEqual(loadConfig({ TRUST_PROXY: 'true' }).secureCookies, true);
  assert.strictEqual(loadConfig({ TRUST_PROXY: 'yes' }).secureCookies, true);
  assert.strictEqual(loadConfig({ TRUST_PROXY: '0' }).secureCookies, false);
});

test('ALLOW_REGISTRATION 多种否值均可识别', () => {
  for (const v of ['0', 'false', 'no', 'off']) {
    assert.strictEqual(loadConfig({ ALLOW_REGISTRATION: v }).allowRegistration, false, `值 ${v}`);
  }
});

test('开发环境未设置 SESSION_SECRET 时回退到开发默认值', () => {
  assert.strictEqual(loadConfig({}).sessionSecret, DEV_SESSION_SECRET);
});

test('生产环境未设置 SESSION_SECRET 时抛错', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }),
    /SESSION_SECRET/
  );
});

test('生产环境设置 SESSION_SECRET 后正常，纯 HTTP 下不启用 secure cookie', () => {
  const cfg = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'prod-secret' });
  assert.strictEqual(cfg.isProduction, true);
  assert.strictEqual(cfg.secureCookies, false, '未设 TRUST_PROXY 时不应启用 secure cookie');
  assert.strictEqual(cfg.sessionSecret, 'prod-secret');
});

test('COOKIE_SECURE 可显式控制 secure cookie', () => {
  assert.strictEqual(loadConfig({ COOKIE_SECURE: 'true' }).secureCookies, true);
  assert.strictEqual(loadConfig({ TRUST_PROXY: '1', COOKIE_SECURE: 'false' }).secureCookies, false);
});

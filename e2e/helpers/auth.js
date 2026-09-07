'use strict';

function randomName(prefix = 'e2e') {
  const ts = Date.now().toString(36);
  const suffix = Math.floor(Math.random() * 10000).toString(36);
  const name = `${prefix}_${ts}_${suffix}`;
  return name.length <= 20 ? name : name.slice(0, 20);
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.FP && window.FP.authView && window.FP.api, { timeout: 10000 });
}

async function register(page, username, password = 'password123') {
  await page.goto('/');
  await page.waitForSelector('#auth-form');
  await waitForApp(page);
  await page.click('#auth-switch');
  await page.waitForSelector('#auth-confirm:not(.hidden)');
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.fill('#auth-confirm', password);
  await page.waitForSelector('#auth-submit:not([disabled])');
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/register'), { timeout: 10000 }),
    page.click('#auth-submit'),
  ]);
  await page.waitForSelector('#view-main', { timeout: 5000 });
  const body = await response.json();
  return body.user;
}

async function login(page, username, password = 'password123') {
  await page.goto('/');
  await page.waitForSelector('#auth-form');
  await waitForApp(page);
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.waitForSelector('#auth-submit:not([disabled])');
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 10000 }),
    page.click('#auth-submit'),
  ]);
  await page.waitForSelector('#view-main', { timeout: 5000 });
  const body = await response.json();
  return body.user;
}

async function logout(page) {
  await page.click('#btn-menu');
  await page.waitForSelector('[data-act="logout"]');
  await page.click('[data-act="logout"]');
  await page.waitForSelector('#view-auth', { timeout: 3000 });
}

async function getErrorMessage(page) {
  await page.waitForSelector('#auth-error:not(.hidden)');
  return page.textContent('#auth-error');
}

module.exports = { randomName, register, login, logout, getErrorMessage };

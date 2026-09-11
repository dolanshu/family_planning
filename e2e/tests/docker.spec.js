'use strict';

const { execSync } = require('node:child_process');
const { test, expect } = require('../fixtures');
const { register, login } = require('../helpers/auth');
const { createTask, findTaskByTitle } = require('../helpers/tasks');

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/auth/me`);
      if (res.status === 401) return;
    } catch (err) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('服务未在超时内就绪');
}

test.describe('Docker 部署回归', { tag: ['@docker'] }, () => {
  test('TC-DOCKER-01 容器启动后可访问', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
  });

  test('TC-DOCKER-02 数据在容器重启后保留', async ({ page }) => {
    const username = `docker_${Date.now()}`;
    await register(page, username);
    await createTask(page, { title: '持久任务' });

    execSync('docker compose restart', { cwd: process.cwd(), stdio: 'ignore' });
    await waitForServer(process.env.BASE_URL || 'http://localhost:3000');

    await page.reload();
    await expect(page.locator('#view-main')).toBeVisible();
    await expect(findTaskByTitle(page, '持久任务')).toBeVisible();
  });
});

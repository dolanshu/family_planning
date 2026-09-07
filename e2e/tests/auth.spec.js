'use strict';

const { test, expect } = require('../fixtures');
const { register, login, logout, getErrorMessage, randomName } = require('../helpers/auth');

test.describe('认证', () => {
  test('TC-AUTH-01 正常注册并进入主清单', async ({ page }) => {
    const username = randomName();
    await register(page, username);
    await expect(page.locator('#view-main')).toBeVisible();
    await expect(page.locator('#greeting')).toContainText(username);
  });

  test('TC-AUTH-02 登录后刷新保持会话', async ({ page }) => {
    const username = randomName();
    await register(page, username);
    await logout(page);
    await login(page, username);
    await expect(page.locator('#view-main')).toBeVisible();

    await page.reload();
    await expect(page.locator('#view-main')).toBeVisible();
    await expect(page.locator('#greeting')).toContainText(username);
  });

  test('TC-AUTH-03 错误密码提示明确', async ({ page }) => {
    const username = randomName();
    await register(page, username);
    await logout(page);

    await page.goto('/');
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', 'wrong-password');
    await page.click('#auth-submit');

    const message = await getErrorMessage(page);
    expect(message).toContain('用户名或密码错误');
    expect(message).not.toContain('登录已过期');
  });

  test('TC-AUTH-04 前端校验用户名长度', async ({ page }) => {
    await page.goto('/');
    await page.fill('#auth-username', 'ab');
    await page.fill('#auth-password', 'password123');
    await page.click('#auth-submit');

    const message = await getErrorMessage(page);
    expect(message).toContain('用户名长度需为 3-20 个字符');
  });

  test('TC-AUTH-04b 前端校验密码长度', async ({ page }) => {
    await page.goto('/');
    await page.fill('#auth-username', 'validuser');
    await page.fill('#auth-password', '12345');
    await page.click('#auth-submit');

    const message = await getErrorMessage(page);
    expect(message).toContain('密码至少 6 位');
  });

  test('TC-AUTH-05 登出', async ({ page }) => {
    await register(page, randomName());
    await logout(page);
    await expect(page.locator('#view-auth')).toBeVisible();

    await page.reload();
    await expect(page.locator('#view-auth')).toBeVisible();
  });
});

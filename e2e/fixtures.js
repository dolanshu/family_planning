'use strict';

const { test: base, expect } = require('@playwright/test');
const { randomName, register } = require('./helpers/auth');
const { createFamily, joinFamily } = require('./helpers/families');

/** 基础 test，不自动登录 */
const test = base.extend({
  username: async ({}, use) => {
    await use(randomName());
  },
});

/** 每个测试自动注册一个随机用户并返回已登录 page */
const testWithUser = base.extend({
  page: async ({ page }, use) => {
    await register(page, randomName());
    await use(page);
  },
});

/** 创建两个用户并加入同一家庭的 fixture */
const testWithFamily = base.extend({
  alicePage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = randomName('alice');
    const user = await register(page, username);
    // 家庭名加唯一后缀：多个 testWithFamily 用例并发/乱序跑时若都用写死的
    // 'E2E家庭' 会撞名导致创建失败、下游断言偶发失败。前缀保留以便 toContainText 断言通过。
    const { familyId, inviteCode } = await createFamily(page, `E2E家庭-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    await use({ page, username, userId: user.id, familyId, inviteCode });
    await context.close();
  },
  bobPage: async ({ browser, alicePage }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = randomName('bob');
    const user = await register(page, username);
    await joinFamily(page, alicePage.inviteCode);
    await use({ page, username, userId: user.id });
    await context.close();
  },
});

module.exports = { test, testWithUser, testWithFamily, expect };

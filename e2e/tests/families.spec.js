'use strict';

const { testWithFamily, expect } = require('../fixtures');
const { createTask, findTaskByTitle, switchToFamily } = require('../helpers/tasks');
const { leaveFamily } = require('../helpers/families');

testWithFamily.describe('家庭与指派', () => {
  testWithFamily('TC-FAM-01 创建家庭并生成邀请码', async ({ alicePage }) => {
    await expect(alicePage.page.locator('.family-card')).toContainText('E2E家庭');
    await expect(alicePage.page.locator('.family-code code')).toHaveText(/^[A-Z0-9]{6}$/);
  });

  testWithFamily('TC-FAM-02 邀请码加入家庭', async ({ bobPage }) => {
    await expect(bobPage.page.locator('.family-card')).toContainText('E2E家庭');
    await expect(bobPage.page.locator('.member-list')).toContainText('alice');
    await expect(bobPage.page.locator('.member-list')).toContainText('bob');
  });

  testWithFamily('TC-FAM-03 家庭任务默认公共且双方可见', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '公共任务', scope: 'family' });
    await bobPage.page.reload();
    await switchToFamily(bobPage.page, alicePage.familyId);
    const row = findTaskByTitle(bobPage.page, '公共任务');
    await expect(row).toBeVisible();
    await expect(row.locator('.badge-assignee')).toContainText('全体');
  });

  testWithFamily('TC-FAM-04 指派任务给成员', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '指派任务', scope: 'family', assignee: bobPage.userId });
    await bobPage.page.reload();
    await switchToFamily(bobPage.page, alicePage.familyId);
    const row = findTaskByTitle(bobPage.page, '指派任务');
    await expect(row).toBeVisible();
    await expect(row.locator('.badge-assignee')).toContainText(bobPage.username);
  });

  testWithFamily('TC-FAM-05 退出家庭后指派回收', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '指派任务', scope: 'family', assignee: bobPage.userId });
    await bobPage.page.goto('/');
    await bobPage.page.waitForSelector('#view-main');
    await leaveFamily(bobPage.page, 'E2E家庭');
    await alicePage.page.reload();
    await switchToFamily(alicePage.page, alicePage.familyId);
    const row = findTaskByTitle(alicePage.page, '指派任务');
    await expect(row.locator('.badge-assignee')).toContainText('全体');
  });

  testWithFamily('TC-FAM-06 私人任务对他人不可见', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '私人秘密', scope: 'personal' });
    await bobPage.page.reload();
    await expect(findTaskByTitle(bobPage.page, '私人秘密')).not.toBeVisible();
  });
});

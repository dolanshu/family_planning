'use strict';

const { testWithUser, expect } = require('../fixtures');
const { createTask, findTaskByTitle, markTaskDone, cycleTaskStatus } = require('../helpers/tasks');

testWithUser.describe('任务', () => {
  testWithUser('TC-TASK-01 新增个人任务', async ({ page }) => {
    await createTask(page, { title: '买牛奶', due: new Date().toISOString().slice(0, 10), priority: '3' });
    const row = findTaskByTitle(page, '买牛奶');
    await expect(row).toBeVisible();
    await expect(row.locator('.task-prio')).toHaveAttribute('data-prio', '3');
  });

  testWithUser('TC-TASK-02 状态切换：等待 → 进行中', async ({ page }) => {
    await createTask(page, { title: '等待任务' });
    await cycleTaskStatus(page, '等待任务');
    const badge = findTaskByTitle(page, '等待任务').locator('[data-act="cycle"]');
    await expect(badge).toContainText('进行中');
  });

  testWithUser('TC-TASK-03 标记完成并消失', async ({ page }) => {
    await createTask(page, { title: '完成我' });
    await markTaskDone(page, '完成我');
    await page.waitForTimeout(300);
    await expect(findTaskByTitle(page, '完成我')).not.toBeVisible();

    await page.click('[data-status="done"]');
    await expect(findTaskByTitle(page, '完成我')).toBeVisible();
  });

  testWithUser('TC-TASK-04 编辑任务', async ({ page }) => {
    await createTask(page, { title: '旧标题' });
    await findTaskByTitle(page, '旧标题').click();
    await page.waitForSelector('.sheet');
    await page.fill('#task-title', '新标题');
    await page.fill('#task-notes', '备注内容');
    await page.click('[data-act="save"]');
    await page.waitForSelector('.sheet', { state: 'hidden' });

    await expect(findTaskByTitle(page, '新标题')).toBeVisible();
    await expect(findTaskByTitle(page, '旧标题')).not.toBeVisible();
  });

  testWithUser('TC-TASK-06 任务分组排序', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await createTask(page, { title: '明天任务', due: tomorrow });
    await createTask(page, { title: '今天任务', due: today });

    const groups = page.locator('.group-title');
    await expect(groups.first()).toContainText('今天');
    await expect(groups.nth(1)).toContainText('明天');
  });
});

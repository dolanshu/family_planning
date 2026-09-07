'use strict';

const { testWithUser, testWithFamily, expect } = require('../fixtures');
const { createTask, findTaskByTitle, markTaskDone, switchToFamily } = require('../helpers/tasks');
const {
  openFilterPanel, applyFilter, resetFilter,
  selectAssignee, selectDatePreset, selectPriority, setCustomRange, activeFilterLabels,
} = require('../helpers/filter');

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

testWithUser.describe('筛选与查询', () => {
  testWithUser('TC-FILTER-01 按状态筛选', async ({ page }) => {
    await createTask(page, { title: '待办任务' });
    await createTask(page, { title: '完成我' });
    await markTaskDone(page, '完成我');

    await page.click('[data-status="done"]');
    await expect(page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(page, '完成我')).toBeVisible();

    await page.click('[data-status="open"]');
    await expect(page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(page, '待办任务')).toBeVisible();
  });

  testWithUser('TC-FILTER-03 按到期日区间筛选', async ({ page }) => {
    await resetFilter(page);
    await createTask(page, { title: '昨天任务', due: todayISO(-1) });
    await createTask(page, { title: '今天任务', due: todayISO(0) });
    await createTask(page, { title: '明天任务', due: todayISO(1) });

    await openFilterPanel(page);
    await selectDatePreset(page, 'today');
    await applyFilter(page);

    await expect(page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(page, '今天任务')).toBeVisible();
  });

  testWithUser('TC-FILTER-04 组合筛选与 URL 同步', async ({ page, browser }) => {
    await resetFilter(page);
    await createTask(page, { title: '高优任务', priority: '3' });
    await createTask(page, { title: '低优任务', priority: '1' });

    await openFilterPanel(page);
    await selectPriority(page, '3');
    await applyFilter(page);

    await expect(page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(page, '高优任务')).toBeVisible();
    const labels = await activeFilterLabels(page);
    expect(labels.some((l) => l.includes('优先级'))).toBe(true);

    const url = page.url();
    expect(url).toContain('priority=3');

    const newPage = await page.context().newPage();
    await newPage.goto(url);
    await newPage.waitForSelector('#view-main');
    await expect(newPage.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(newPage, '高优任务')).toBeVisible();
  });
});

testWithFamily.describe('筛选 - 家庭维度', () => {
  testWithFamily('TC-FILTER-02 按指派人筛选', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '公共任务', scope: 'family' });
    await createTask(alicePage.page, { title: 'bob任务', scope: 'family', assignee: bobPage.userId });

    await bobPage.page.reload();
    await switchToFamily(bobPage.page, alicePage.familyId);
    await resetFilter(bobPage.page);

    await openFilterPanel(bobPage.page);
    await selectAssignee(bobPage.page, 'public');
    await applyFilter(bobPage.page);

    await expect(bobPage.page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(bobPage.page, '公共任务')).toBeVisible();

    await openFilterPanel(bobPage.page);
    await selectAssignee(bobPage.page, bobPage.userId);
    await applyFilter(bobPage.page);

    await expect(bobPage.page.locator('.task-item')).toHaveCount(1);
    await expect(findTaskByTitle(bobPage.page, 'bob任务')).toBeVisible();
  });
});

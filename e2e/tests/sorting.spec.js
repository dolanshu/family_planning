'use strict';

const { testWithUser, expect } = require('../fixtures');
const {
  createTask, findTaskByTitle, cycleTaskStatus,
} = require('../helpers/tasks');

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** 点击排序 chip 并等待列表接口返回 */
async function selectSort(page, key) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/tasks')),
    page.click(`#sort-tabs [data-sort="${key}"]`),
  ]);
  await page.waitForTimeout(200);
}

async function titles(page) {
  return page.locator('.task-item .task-title').allTextContents();
}

testWithUser.describe('任务排序', () => {
  testWithUser('TC-SORT-01 默认按优先级降序且平铺无分组', async ({ page }) => {
    await createTask(page, { title: '低优先', priority: '1' });
    await createTask(page, { title: '高优先', priority: '3' });
    await createTask(page, { title: '无优先', priority: '0', due: todayISO(1) });
    await createTask(page, { title: '中优先', priority: '2' });

    await page.reload();
    await page.waitForSelector('#view-main');
    await expect(page.locator('.task-item').first()).toBeVisible();

    // 默认排序：优先级 高 → 中 → 低 → 无
    expect(await titles(page)).toEqual(['高优先', '中优先', '低优先', '无优先']);

    // 默认 chip 为优先级且方向为降序
    await expect(page.locator('#sort-tabs [data-sort="priority"]')).toHaveClass(/is-active/);
    await expect(page.locator('#sort-tabs [data-sort="priority"] .sort-arrow')).toHaveText('↓');

    // 非到期日排序 → 不显示日期分组标题
    await expect(page.locator('.group-title')).toHaveCount(0);
  });

  testWithUser('TC-SORT-02 切到「到期日」排序恢复日期分组', async ({ page }) => {
    await createTask(page, { title: '明天到', due: todayISO(1) });
    await createTask(page, { title: '昨天到', due: todayISO(-1) });
    await createTask(page, { title: '今天到', due: todayISO(0) });

    await page.reload();
    await page.waitForSelector('#view-main');
    await expect(page.locator('.task-item').first()).toBeVisible();

    // 默认（优先级降序，优先级相同 → 兜底按到期日升序）：平铺
    await expect(page.locator('.group-title')).toHaveCount(0);
    expect(await titles(page)).toEqual(['昨天到', '今天到', '明天到']);

    // 切到「到期日」排序 → 出现分组标题
    await selectSort(page, 'dueDate');
    await expect(page.locator('.group-title').first()).toBeVisible();
    expect(await titles(page)).toEqual(['昨天到', '今天到', '明天到']);

    const groups = await page.locator('.group-title').allTextContents();
    expect(groups).toContain('已逾期');
    expect(groups).toContain('今天');
    expect(groups).toContain('明天');
  });

  testWithUser('TC-SORT-03 点击已选维度切换升序 / 降序', async ({ page }) => {
    await createTask(page, { title: '低优先', priority: '1' });
    await createTask(page, { title: '高优先', priority: '3' });
    await createTask(page, { title: '无优先', priority: '0' });
    await createTask(page, { title: '中优先', priority: '2' });

    await page.reload();
    await page.waitForSelector('#view-main');
    await expect(page.locator('.task-item').first()).toBeVisible();

    // 默认降序
    expect(await titles(page)).toEqual(['高优先', '中优先', '低优先', '无优先']);
    await expect(page.locator('#sort-tabs [data-sort="priority"] .sort-arrow')).toHaveText('↓');

    // 再点一次 → 升序
    await selectSort(page, 'priority');
    await expect(page.locator('#sort-tabs [data-sort="priority"] .sort-arrow')).toHaveText('↑');
    expect(await titles(page)).toEqual(['无优先', '低优先', '中优先', '高优先']);
  });

  testWithUser('TC-SORT-04 按状态排序（等待 ↔ 进行中）', async ({ page }) => {
    await createTask(page, { title: '正在做' });
    await createTask(page, { title: '还没做' });
    await cycleTaskStatus(page, '正在做');
    await expect(findTaskByTitle(page, '正在做').locator('[data-act="cycle"]')).toContainText('进行中');

    // 状态升序：等待 → 进行中
    await selectSort(page, 'status');
    expect(await titles(page)).toEqual(['还没做', '正在做']);

    // 再点一次 → 降序：进行中 → 等待
    await selectSort(page, 'status');
    expect(await titles(page)).toEqual(['正在做', '还没做']);
  });

  testWithUser('TC-SORT-05 排序状态同步到 URL 并可恢复', async ({ page }) => {
    await createTask(page, { title: '明天到', due: todayISO(1) });
    await createTask(page, { title: '今天到', due: todayISO(0) });

    await selectSort(page, 'dueDate');
    expect(page.url()).toContain('sort=dueDate');
    expect(page.url()).toContain('order=asc');

    const url = page.url();
    const newPage = await page.context().newPage();
    await newPage.goto(url);
    await newPage.waitForSelector('#view-main');
    await expect(newPage.locator('.group-title').first()).toBeVisible();
    await expect(newPage.locator('#sort-tabs [data-sort="dueDate"]')).toHaveClass(/is-active/);
  });
});

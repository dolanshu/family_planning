'use strict';

const { testWithUser, expect } = require('../fixtures');
const { createTask } = require('../helpers/tasks');

testWithUser.describe('移动端 UI', () => {
  testWithUser.use({ viewport: { width: 375, height: 667 } });

  testWithUser('TC-MOBILE-01 底部弹层交互', async ({ page }) => {
    await createTask(page, { title: '弹层任务' });

    // 打开弹层
    await page.click('#btn-add');
    await expect(page.locator('.sheet')).toBeVisible();

    // 点击遮罩关闭
    await page.locator('.sheet-mask').click();
    await expect(page.locator('.sheet')).toHaveCount(0, { timeout: 3000 });
  });

  testWithUser('TC-MOBILE-02 离线提示', async ({ page }) => {
    const offlineBar = page.locator('.offline-bar');

    // 初始在线：提示条应隐藏
    let hidden = await offlineBar.evaluate((el) => el.classList.contains('hidden'));
    expect(hidden).toBe(true);

    // 切到离线：提示条显示
    await page.context().setOffline(true);
    await page.waitForTimeout(400);
    hidden = await offlineBar.evaluate((el) => el.classList.contains('hidden'));
    expect(hidden).toBe(false);

    // 恢复在线：提示条隐藏
    await page.context().setOffline(false);
    await page.waitForTimeout(400);
    hidden = await offlineBar.evaluate((el) => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });

  testWithUser('TC-MOBILE-03 触摸目标尺寸', async ({ page }) => {
    // 先创建任务，确保列表里有复选框
    await createTask(page, { title: '触摸任务' });

    const fabBox = await page.locator('#btn-add').boundingBox();
    expect(fabBox.width).toBeGreaterThanOrEqual(44);
    expect(fabBox.height).toBeGreaterThanOrEqual(44);

    const checkBox = await page.locator('.task-check').first().boundingBox();
    expect(checkBox.width).toBeGreaterThanOrEqual(44);
    expect(checkBox.height).toBeGreaterThanOrEqual(44);

    const chipBox = await page.locator('#status-tabs .chip').first().boundingBox();
    expect(chipBox.height).toBeGreaterThanOrEqual(32);
  });
});

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { testWithUser, testWithFamily, expect } = require('../fixtures');
const { createTask, markTaskDone, switchToFamily } = require('../helpers/tasks');
const { openReport, setGroupBy, shiftRange, summaryValues, itemCount, exportCsv } = require('../helpers/reports');

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

testWithUser.describe('统计报告', () => {
  testWithUser('TC-REPORT-01 完成任务概览', async ({ page }) => {
    await createTask(page, { title: '报告任务' });
    await markTaskDone(page, '报告任务');

    await openReport(page);
    const summary = await summaryValues(page);
    expect(Number(summary['完成任务'])).toBeGreaterThanOrEqual(1);
    expect(summary['完成率']).toMatch(/\d+%/);
  });

  testWithUser('TC-REPORT-02 按粒度切换趋势图', async ({ page }) => {
    await createTask(page, { title: '趋势任务' });
    await markTaskDone(page, '趋势任务');

    await openReport(page);
    await expect(page.locator('#report-trend')).toBeVisible();
    await expect(page.locator('#report-trend svg.chart')).toBeVisible();

    const initialTitle = await page.textContent('.report-range');
    await setGroupBy(page, 'week');
    const weekTitle = await page.textContent('.report-range');
    expect(weekTitle).not.toEqual(initialTitle);
    await expect(page.locator('#report-trend svg.chart')).toBeVisible();
  });

  testWithUser('TC-REPORT-04 CSV 导出内容与页面一致', async ({ page }, testInfo) => {
    await createTask(page, { title: '导出任务' });
    await markTaskDone(page, '导出任务');

    await openReport(page);
    const itemsBefore = await itemCount(page);
    expect(itemsBefore).toBeGreaterThanOrEqual(1);

    const download = await exportCsv(page);
    const tmp = await download.path();
    const csv = fs.readFileSync(tmp, 'utf8');

    expect(csv).toMatch(/^\ufeff?标题,/); // 可能有 BOM
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(itemsBefore + 1); // 表头 + 数据行
  });

  testWithUser('TC-REPORT-05 空态', async ({ page }) => {
    await openReport(page);
    // 将区间切到未来
    await page.fill('#rep-from', todayISO(30));
    await page.fill('#rep-to', todayISO(35));
    await page.click('[data-act="apply"]');
    await page.waitForTimeout(400);
    await expect(page.locator('#report-items .empty')).toContainText('该时间段没有已完成的任务');
  });
});

testWithFamily.describe('统计报告 - 家庭', () => {
  testWithFamily('TC-REPORT-03 按指派人分组含「全体」', async ({ alicePage, bobPage }) => {
    await alicePage.page.goto('/');
    await alicePage.page.waitForSelector('#view-main');
    await createTask(alicePage.page, { title: '公共任务', scope: 'family' });
    await createTask(alicePage.page, { title: 'bob任务', scope: 'family', assignee: bobPage.userId });

    await switchToFamily(alicePage.page, alicePage.familyId);
    await markTaskDone(alicePage.page, '公共任务');
    await markTaskDone(alicePage.page, 'bob任务');

    await openReport(alicePage.page);

    const byUser = alicePage.page.locator('#report-byuser');
    await expect(byUser).toContainText('全体');
    await expect(byUser).toContainText(bobPage.username);
  });
});

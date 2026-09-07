'use strict';

async function openReport(page) {
  await page.click('#btn-menu');
  await page.waitForSelector('[data-act="report"]');
  await page.click('[data-act="report"]');
  await page.waitForSelector('#view-report');
  await page.waitForSelector('#report-summary');
}

async function setGroupBy(page, key) {
  await page.click(`[data-seg="groupby"] [data-value="${key}"]`);
  await page.waitForTimeout(300);
}

async function shiftRange(page, delta = -1) {
  const action = delta > 0 ? 'next' : 'prev';
  await page.click(`[data-act="${action}"]`);
  await page.waitForTimeout(300);
}

async function summaryValues(page) {
  const cards = await page.locator('#report-summary .stat').all();
  const result = {};
  for (const card of cards) {
    const label = await card.locator('.stat-label').textContent();
    const value = await card.locator('.stat-value').textContent();
    result[label.trim()] = value.trim();
  }
  return result;
}

async function itemCount(page) {
  const items = page.locator('#report-items .report-item');
  return items.count();
}

async function exportCsv(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-csv'),
  ]);
  return download;
}

async function exportJson(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-json'),
  ]);
  return download;
}

module.exports = {
  openReport, setGroupBy, shiftRange, summaryValues, itemCount, exportCsv, exportJson,
};

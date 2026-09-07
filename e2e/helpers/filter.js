'use strict';

async function openFilterPanel(page) {
  await page.click('#btn-filter');
  await page.waitForSelector('.sheet');
}

async function applyFilter(page) {
  await page.click('[data-act="apply"]');
  await page.waitForSelector('.sheet', { state: 'hidden' });
  await page.waitForTimeout(300);
}

async function resetFilter(page) {
  await openFilterPanel(page);
  await page.click('[data-act="reset"]');
  await page.waitForSelector('.sheet', { state: 'hidden' });
}

async function selectAssignee(page, value) {
  await page.click(`[data-group="assignee"] [data-value="${value}"]`);
}

async function selectDatePreset(page, value) {
  await page.click(`[data-group="preset"] [data-value="${value}"]`);
}

async function selectPriority(page, value) {
  await page.click(`[data-group="priority"] [data-value="${value}"]`);
}

async function setCustomRange(page, from, to) {
  await selectDatePreset(page, 'custom');
  await page.fill('#filter-from', from);
  await page.fill('#filter-to', to);
}

async function activeFilterLabels(page) {
  return page.locator('#active-filters .chip').allTextContents();
}

module.exports = {
  openFilterPanel, applyFilter, resetFilter,
  selectAssignee, selectDatePreset, selectPriority, setCustomRange,
  activeFilterLabels,
};

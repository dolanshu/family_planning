'use strict';

async function openTaskSheet(page) {
  await page.click('#btn-add');
  await page.waitForSelector('.sheet', { state: 'visible' });
}

async function fillTaskForm(page, { title, notes = '', due = '', priority = '0', scope = 'personal', assignee = '' }) {
  await page.fill('#task-title', title);
  if (notes) await page.fill('#task-notes', notes);
  if (due) await page.fill('#task-due', due);
  if (priority) {
    await page.click(`[data-seg="priority"] [data-value="${priority}"]`);
  }
  if (scope === 'family') {
    await page.click('[data-seg="scope"] [data-value="family"]');
    const value = assignee || '';
    await page.waitForSelector(`[data-seg="assignee"] [data-value="${value}"]`, { timeout: 3000 });
    await page.click(`[data-seg="assignee"] [data-value="${value}"]`);
  }
}

async function saveTask(page) {
  await page.click('[data-act="save"]');
  await page.waitForSelector('.sheet', { state: 'hidden' });
}

async function createTask(page, fields) {
  await openTaskSheet(page);
  await fillTaskForm(page, fields);
  await saveTask(page);
}

function findTaskByTitle(page, title) {
  return page.locator('.task-item', { hasText: title }).first();
}

async function markTaskDone(page, title) {
  const row = findTaskByTitle(page, title).locator('..'); // .task-row
  await row.locator('[data-act="toggle"]').click();
}

async function cycleTaskStatus(page, title) {
  const item = findTaskByTitle(page, title);
  await item.locator('[data-act="cycle"]').click();
}

async function deleteTask(page, title) {
  const row = findTaskByTitle(page, title).locator('..');
  // 长按/点击打开删除按钮（桌面 mousedown 逻辑）
  await row.locator('.task-item').dispatchEvent('mousedown');
  await page.waitForTimeout(600);
  await row.locator('[data-act="delete"]').click();
  await page.click('[data-act="ok"]');
}

async function switchToFamily(page, familyId) {
  const tab = page.locator(`[data-scope="${familyId}"]`);
  await tab.click();
  await page.waitForTimeout(300);
}

module.exports = {
  openTaskSheet, fillTaskForm, saveTask, createTask,
  findTaskByTitle, markTaskDone, cycleTaskStatus, deleteTask,
  switchToFamily,
};

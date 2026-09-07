'use strict';

async function openFamilyPage(page) {
  await page.click('#btn-menu');
  await page.waitForSelector('[data-act="family"]');
  await page.click('[data-act="family"]');
  await page.waitForSelector('#view-family');
}

async function createFamily(page, name) {
  await openFamilyPage(page);
  await page.fill('#family-name', name);
  await page.click('[data-act="create"]');
  const card = await page.waitForSelector('.family-card', { timeout: 5000 });
  const familyId = await card.getAttribute('data-family');
  const code = await page.textContent('.family-card .family-code code');
  return { familyId, inviteCode: code.trim() };
}

async function joinFamily(page, inviteCode) {
  await openFamilyPage(page);
  await page.fill('#family-code', inviteCode);
  await page.click('[data-act="join"]');
  await page.waitForSelector('.family-card', { timeout: 5000 });
}

async function leaveFamily(page, familyName) {
  await openFamilyPage(page);
  const card = page.locator('.family-card', { hasText: familyName });
  await card.locator('[data-act="leave"]').click();
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(300);
}

async function getInviteCode(page, familyName) {
  await openFamilyPage(page);
  const card = page.locator('.family-card', { hasText: familyName });
  return (await card.locator('.family-code code').textContent()).trim();
}

module.exports = { openFamilyPage, createFamily, joinFamily, leaveFamily, getInviteCode };

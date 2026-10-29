// Run only against an isolated server/project. Verifies browser workspace flows.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(), visitor = await guest.newPage();
const errors = [];
for (const current of [page, visitor]) current.on('pageerror', error => errors.push(String(error)));
const url = process.env.RYANCAD_UI_URL || 'http://127.0.0.1:8892';
const openDesigns = async (current) => {
  await current.getByRole('button', { name: 'Manage workspace designs' }).click();
  await current.getByRole('dialog', { name: 'Workspace designs' }).waitFor();
};
const designName = (current) => current.locator('.design-tree-name');
const loaded = async (current, name) => {
  await current.waitForFunction(expected => document.querySelector('.design-tree-name')?.textContent?.trim() === expected, name, { timeout: 45000 });
};
try {
  await page.goto(url);
  await loaded(page, 'Untitled design');
  await openDesigns(page);
  await page.getByLabel('New design name').fill('Enclosure');
  await page.getByRole('button', { name: 'New design', exact: true }).click();
  await loaded(page, 'Enclosure');
  await page.reload();
  await loaded(page, 'Enclosure');

  await openDesigns(page);
  const enclosure = page.locator('.workspace-design-row').filter({ hasText: 'Enclosure' });
  await enclosure.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Design name', { exact: true }).fill('Mold box');
  await page.locator('.workspace-rename').getByRole('button', { name: 'Save' }).click();
  await page.locator('.workspace-design-row').filter({ hasText: 'Mold box' }).waitFor();
  await page.getByRole('button', { name: 'Untitled design', exact: true }).click();
  await loaded(page, 'Untitled design');

  const otherTab = await context.newPage();
  await otherTab.goto(url);
  await loaded(otherTab, 'Untitled design');
  await openDesigns(page);
  await page.getByRole('button', { name: 'Mold box', exact: true }).click();
  await loaded(page, 'Mold box');
  await otherTab.reload();
  await loaded(otherTab, 'Untitled design');

  await visitor.goto(url);
  await loaded(visitor, 'Untitled design');
  await openDesigns(visitor);
  assert.equal(await visitor.getByRole('button', { name: 'Mold box', exact: true }).count(), 0);
  await visitor.getByRole('button', { name: 'Close', exact: true }).click();

  await openDesigns(page);
  await page.locator('summary').filter({ hasText: 'Workspace recovery' }).click();
  const recoveryCode = await page.locator('.workspace-code').textContent();
  await page.locator('summary').filter({ hasText: 'Workspace recovery' }).click();
  await page.screenshot({ path: '.cache/workspace-ui/designs.png' });
  await page.getByRole('button', { name: 'Delete Mold box' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await loaded(page, 'Untitled design');
  await openDesigns(page);
  await page.locator('summary').filter({ hasText: 'Deleted designs' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Mold box', exact: true }).waitFor();

  await openDesigns(visitor);
  await visitor.locator('summary').filter({ hasText: 'Workspace recovery' }).click();
  await visitor.getByLabel('Workspace recovery code').fill(recoveryCode);
  await visitor.getByRole('button', { name: 'Open workspace' }).click();
  await loaded(visitor, 'Untitled design');
  await openDesigns(visitor);
  await visitor.getByRole('button', { name: 'Mold box', exact: true }).waitFor();
  await visitor.getByRole('button', { name: 'Close', exact: true }).click();
  await visitor.getByRole('button', { name: 'Project menu' }).click();
  await visitor.locator('#project-dropdown').getByRole('button', { name: /Reference designs/ }).click();
  await visitor.getByRole('button', { name: /Mounting plate & pins/ }).click();
  await loaded(visitor, 'Mounting plate · fit study');
  await openDesigns(visitor);
  await visitor.getByRole('button', { name: 'Mold box', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Workspace UI passed: create, rename, switch, refresh, per-tab design selection, separate browsers, delete/restore, recovery and independent reference designs.');
} finally {
  await browser.close();
}

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseImportedProfile } from '../lib/editor';

async function login(page: Page) {
  const response = await page.request.post('/api/__test/session');
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function saveAs(page: Page, name: string) {
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: 'Save as', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Saved "${name}"`);
}

test('local username registration and password login recover private saved configs', async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-bf6-test-ip': testInfo.project.name === 'mobile' ? '127.0.0.2' : '127.0.0.1' });
  const username = `local_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const password = `test-only-${crypto.randomUUID()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Local test sign-in', exact: true }).click();
  await page.getByRole('button', { name: 'Create test account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await saveAs(page, 'Local password config');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Local test sign-in', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill('incorrect-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  await page.getByRole('button', { name: 'Load Local password config' }).click();
  await expect(page.getByText('Local password config: Saved to account', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('private named snapshots support save, reload, rename, load and deletion', async ({ page }) => {
  await login(page);
  await page.getByLabel('Settings group').selectOption('Quality');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('1');
  await saveAs(page, 'My desktop');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('2');
  await expect(page.getByText('My desktop: Unsaved account changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('My desktop: Saved to account', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('Settings group').selectOption('Quality');
  await expect(page.getByLabel('Texture quality', { exact: true })).toHaveValue('2');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load My desktop' })).toBeVisible();
  const cancelled = new Promise<void>((resolve, reject) => page.once('dialog', (dialog) => { void dialog.dismiss().then(resolve, reject); }));
  await page.getByRole('button', { name: 'Load My desktop' }).click();
  await cancelled;
  await expect(page.getByText('My desktop: Unsaved account changes', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Load My desktop' }).click();
  await expect(page.getByText('My desktop: Saved to account', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept('Renamed'));
  await page.getByRole('button', { name: 'Rename My desktop' }).click();
  await page.getByRole('button', { name: 'Load Renamed' }).click();
  await expect(page.getByText('Renamed: Saved to account', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Renamed' }).click();
  await expect(page.getByText('Local draft saved', { exact: true })).toBeVisible();
});

test('stale and failed saves keep local changes; sign-out clears only account workspace', async ({ page }) => {
  await login(page);
  await saveAs(page, 'Original');
  const list = await (await page.request.get('/api/configs')).json();
  const config = list.configs[0];
  await page.request.patch(`/api/configs/${config.id}`, {
    headers: { origin: 'http://127.0.0.1:1422' }, data: { name: 'Elsewhere', revision: config.revision },
  });
  await page.getByLabel('Settings group').selectOption('Quality');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByText('Original: Unsaved account changes', { exact: true })).toBeVisible();
  await page.route('**/api/configs', (route) => route.abort());
  page.once('dialog', (dialog) => dialog.accept('Offline copy'));
  await page.getByRole('button', { name: 'Save as', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Server unavailable');
  await page.unroute('**/api/configs');
  await saveAs(page, 'Recovered');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved configs', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('bf6-configurator.workspace.v2.user:')))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('bf6-configurator.workspace.v1'))).not.toBeNull();
});

test('snapshots retain unknown and engine-managed entries independent of bundled presets', async ({ page }) => {
  await login(page);
  const entries = { 'GstRender.TextureQuality': '1', 'GstRender.FutureSetting': '7', 'GstRender.ShaderBundleVersion_123': 'old', 'GstInput.Empty': '' };
  const response = await page.request.post('/api/configs', {
    headers: { origin: 'http://127.0.0.1:1422' },
    data: { name: 'Retired device', deviceKey: 'no-longer-bundled', schemaVersion: 1, entries },
  });
  expect(response.status()).toBe(201);
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  await page.getByRole('button', { name: 'Load Retired device' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export profile', exact: true }).click();
  const download = await pending;
  expect(parseImportedProfile(readFileSync((await download.path())!, 'utf8'))).toEqual(entries);
  await page.request.post('/api/__test/session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Local draft saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved configs', exact: true }).click();
  await expect(page.getByText('No saved configs yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load Retired device' })).toHaveCount(0);
});

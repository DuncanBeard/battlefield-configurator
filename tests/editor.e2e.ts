import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { combineBase, emitEntries, flatten, merge } from '../lib/build';
import { parseImportedProfile } from '../lib/editor';
import { parse } from '../lib/toml-parser';
import type { ProfileEntries } from '../lib/types';

const root = process.cwd();
const baseDirectory = join(root, 'base');
const base = combineBase(readdirSync(baseDirectory).filter((file) => file.endsWith('.toml')).sort().map((file) => parse(readFileSync(join(baseDirectory, file), 'utf8'))));
const original = flatten(merge(base, parse(readFileSync(join(root, 'devices', 'desktop.toml'), 'utf8'))));

async function openPanel(page: Page, name: string | RegExp) {
  await page.getByRole('navigation', { name: 'Configuration sections' }).getByRole('button', { name }).click();
}

async function importText(page: Page, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import profile', exact: true }).click();
  await (await chooser).setFiles({ name: 'PROFSAVE_profile', mimeType: 'text/plain', buffer: Buffer.from(content) });
}

async function exportedProfile(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export profile', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('PROFSAVE_profile');
  return parseImportedProfile(readFileSync((await download.path())!, 'utf8'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Graphics & display', exact: true })).toBeVisible();
  await expect(page.getByText('Local draft saved', { exact: true })).toBeVisible();
});

test('edits export accurately, support undo, persist and stay isolated by device', async ({ page }) => {
  await page.getByLabel('Settings group').selectOption('Quality');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('1');
  await expect(page.getByText('1 local edits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByText('0 local edits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  expect(await exportedProfile(page)).toEqual({ ...original, 'GstRender.TextureQuality': '1' });

  await page.reload();
  await page.getByLabel('Settings group').selectOption('Quality');
  await expect(page.getByLabel('Texture quality', { exact: true })).toHaveValue('1');
  await page.getByLabel('Device profile').selectOption('laptop');
  await expect(page.getByText('0 local edits', { exact: true })).toBeVisible();
  await page.getByLabel('Device profile').selectOption('desktop');
  await page.getByLabel('Settings group').selectOption('Quality');
  await expect(page.getByLabel('Texture quality', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Reset Texture quality', exact: true }).click();
  await expect(page.getByText('0 local edits', { exact: true })).toBeVisible();
});

test('bounded controls reject invalid values and switches and sliders update exports', async ({ page }) => {
  await page.getByLabel('Settings group').selectOption('Display');
  const width = page.getByRole('spinbutton', { name: 'Resolution width', exact: true });
  await width.fill('0');
  await width.press('Tab');
  await expect(page.getByRole('alert')).toHaveText('Minimum: 1');
  expect((await exportedProfile(page))['GstRender.ResolutionWidth']).toBe(original['GstRender.ResolutionWidth']);
  await width.fill('2560');
  await width.press('Tab');
  await page.getByLabel('Settings group').selectOption('Camera');
  await page.getByRole('switch', { name: 'Film grain', exact: true }).check();
  const sharpness = page.getByLabel('Sharpness value', { exact: true });
  await sharpness.fill('0.42');
  await sharpness.press('Tab');
  await expect(page.getByRole('slider', { name: 'Sharpness', exact: true })).toHaveValue('0.42');
  const profile = await exportedProfile(page);
  expect(profile['GstRender.ResolutionWidth']).toBe('2560');
  expect(profile['GstRender.FilmGrain']).toBe('1');
  expect(profile['GstRender.SharpnessSlider']).toBe('0.42');
});

test('diff filters and selective imports handle additions, removals, empty and protected values', async ({ page }) => {
  const cacheKey = Object.keys(original).find((key) => key.startsWith('GstRender.ShaderBundleVersion_'))!;
  const imported: ProfileEntries = { ...original, 'GstRender.TextureQuality': '1', 'GstRender.NewFutureOption': '42', 'GstAudio.VoipInputDevice': 'USB microphone', [cacheKey]: '123' };
  delete imported['GstAudio.Volume'];
  await importText(page, emitEntries(imported));
  await expect(page.getByRole('heading', { name: 'Review changes', exact: true })).toBeVisible();
  await expect(page.getByLabel(`Select ${cacheKey}`, { exact: true })).toBeDisabled();
  await expect(page.locator('[data-key="GstAudio.VoipInputDevice"]').getByText('Empty value', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Added/ }).click();
  await page.getByLabel('Select GstRender.NewFutureOption', { exact: true }).check();
  await page.getByRole('button', { name: /^Changed/ }).click();
  await page.getByLabel('Select GstRender.TextureQuality', { exact: true }).check();
  await expect(page.getByText(/2 selected \(1 on other pages or filters\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply selected', exact: true }).click();
  expect(await exportedProfile(page)).toEqual({ ...original, 'GstRender.TextureQuality': '1', 'GstRender.NewFutureOption': '42' });

  await page.getByRole('button', { name: /^Removed/ }).click();
  await page.getByLabel('Select GstAudio.Volume', { exact: true }).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Apply selected', exact: true }).click();
  expect(Object.hasOwn(await exportedProfile(page), 'GstAudio.Volume')).toBe(false);
  await page.getByRole('button', { name: /^All / }).click();
  await page.getByRole('button', { name: 'Unified diff', exact: true }).click();
  await page.getByLabel('Raw values', { exact: true }).check();
  await expect(page.locator('.unified-values').first()).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comparison', exact: true }).click();
  const download = await pending;
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toContain('--- Current draft');
  expect(text).toContain('+ GstAudio.VoipInputDevice USB microphone');
});

test('invalid and cancelled imports do not modify the draft or leave the UI busy', async ({ page }) => {
  await importText(page, '{"not":"a profile"}');
  await expect(page.getByRole('alert')).toContainText('not a valid PROFSAVE_profile');
  await expect(page.getByText('0 local edits', { exact: true })).toBeVisible();
  await importText(page, '\0binary save');
  await expect(page.getByRole('alert')).toContainText('not a binary save file');
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import profile', exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(page.getByRole('button', { name: 'Import profile', exact: true })).toBeEnabled();
  expect(await exportedProfile(page)).toEqual(original);
});

test('preset review is opt-in and does not revert unrelated edits made after preview', async ({ page }) => {
  await openPanel(page, 'Community guides');
  await expect(page.getByRole('button', { name: 'Review RTX responsiveness' })).toBeDisabled();
  await page.getByLabel('This device has an NVIDIA RTX GPU').check();
  await expect(page.getByRole('button', { name: 'Review RTX responsiveness' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review Competitive baseline' }).click();
  await expect(page.getByText('0 local edits', { exact: true })).toBeVisible();

  await openPanel(page, /Graphics & display/);
  await page.getByLabel('Settings group').selectOption('Display');
  await page.getByRole('spinbutton', { name: 'Resolution width', exact: true }).fill('2560');
  await page.getByRole('spinbutton', { name: 'Resolution width', exact: true }).press('Tab');
  await openPanel(page, /^Changes/);
  await expect(page.locator('[data-key="GstRender.ResolutionWidth"]')).toHaveCount(0);
  await page.getByLabel('Select visible changes', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply selected', exact: true }).click();
  const profile = await exportedProfile(page);
  expect(profile['GstRender.ResolutionWidth']).toBe('2560');
  expect(profile['GstRender.TextureQuality']).toBe('2');
  for (const [key, value] of Object.entries(original).filter(([key]) => key.startsWith('GstKeyBinding.') || key.includes('Sensitivity'))) expect(profile[key]).toBe(value);
  await page.getByLabel('Device profile').selectOption('laptop');
  await expect(page.getByLabel('Comparison').locator('option')).toHaveCount(1);
});

test('imports preserve unknown future keys and unsupported enum values', async ({ page }) => {
  await importText(page, emitEntries({ ...original, 'GstRender.TextureQuality': '99', 'GstRender.NewFutureOption': '42' }));
  await page.getByLabel('Select visible changes').check();
  await page.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await openPanel(page, /Graphics & display/);
  await page.getByLabel('Settings group').selectOption('Quality');
  await expect(page.getByLabel('Texture quality', { exact: true })).toHaveValue('99');
  await expect(page.getByLabel('Texture quality', { exact: true }).locator('option:checked')).toHaveText('Custom value: 99');
  const profile = await exportedProfile(page);
  expect(profile['GstRender.TextureQuality']).toBe('99');
  expect(profile['GstRender.NewFutureOption']).toBe('42');
});

test('the desktop bridge receives the same edited profile as browser export', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: (command: string, args: { content: string }) => {
          if (command !== 'deploy_profile') throw new Error('Unexpected command');
          localStorage.setItem('test-native-profile', args.content);
          return Promise.resolve('test-game-directory/PROFSAVE_profile');
        },
      }
    });
  });
  await page.reload();
  await page.getByLabel('Settings group').selectOption('Quality');
  await page.getByLabel('Texture quality', { exact: true }).selectOption('1');
  const exported = await exportedProfile(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Deploy to game', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Written to test-game-directory');
  expect(parseImportedProfile(await page.evaluate(() => localStorage.getItem('test-native-profile')!))).toEqual(exported);
});

test('settings, recommendations and diffs fit the viewport and render local assets', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.game-art img')).toHaveJSProperty('naturalWidth', 460);
  const widths = testInfo.project.name === 'mobile' ? [320, 390] : [1280, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const panel of [/Graphics & display/, /Community guides/, /^Changes/]) {
      await openPanel(page, panel);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const overflowing = await page.locator('button, input, select').evaluateAll((elements) => elements.filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && (bounds.left < -1 || bounds.right > window.innerWidth + 1);
      }).map((element) => element.getAttribute('aria-label') ?? element.textContent));
      expect(overflowing).toEqual([]);
    }
  }
  await openPanel(page, /Graphics & display/);
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await openPanel(page, /Community guides/);
  await page.screenshot({ path: testInfo.outputPath('recommendations.png'), fullPage: true });
  await importText(page, emitEntries({ ...original, 'GstRender.TextureQuality': '1', 'GstAudio.VoipInputDevice': 'USB microphone' }));
  await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
  expect(errors).toEqual([]);
});
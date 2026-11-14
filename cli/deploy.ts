#!/usr/bin/env bun
/**
 * Build PROFSAVE_profile and deploy to the game settings directory.
 *
 * Usage: bun run cli/deploy.ts [device]
 *   Env: GAME_DIR — override the destination directory.
 */
import { copyFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildProfile } from '../lib/build.js';
import { ROOT, resolveDevice, loadBaseFiles, loadDevice } from './_shared.js';

const defaultGameDir = join(
  process.env.OneDrive ?? join(process.env.USERPROFILE ?? '', 'OneDrive'),
  'Documents',
  'Battlefield 6',
  'settings',
  'steam'
);
const gameDir = process.env.GAME_DIR || defaultGameDir;

const deviceName = resolveDevice();
const baseList = Object.values(loadBaseFiles());
const device = deviceName ? loadDevice(deviceName) : null;

const output = buildProfile(baseList, device);
const outPath = join(ROOT, 'PROFSAVE_profile');
writeFileSync(outPath, output);
console.log(`Built: PROFSAVE_profile (${output.split('\n').length - 1} lines)`);

if (!existsSync(gameDir)) {
  console.error(`Error: Game directory not found: ${gameDir}`);
  process.exit(1);
}

const dest = join(gameDir, 'PROFSAVE_profile');
copyFileSync(outPath, dest);
console.log(`Deployed -> ${dest}`);

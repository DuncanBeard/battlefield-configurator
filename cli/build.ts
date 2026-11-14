#!/usr/bin/env bun
/**
 * Build PROFSAVE_profile from base/*.toml + devices/{device}.toml.
 *
 * Usage: bun run cli/build.ts [device]
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildProfile } from '../lib/build.js';
import { ROOT, resolveDevice, loadBaseFiles, loadDevice } from './_shared.js';

const deviceName = resolveDevice();
const baseFiles = loadBaseFiles();
const baseList = Object.values(baseFiles);

let device = null;
if (deviceName) {
  console.log(`Building for device: ${deviceName}`);
  try {
    device = loadDevice(deviceName);
  } catch {
    console.error(`Error: Device file not found: devices/${deviceName}.toml`);
    process.exit(1);
  }
} else {
  console.log('Building base config (no device)');
}

const output = buildProfile(baseList, device);
const outPath = join(ROOT, 'PROFSAVE_profile');
writeFileSync(outPath, output);
console.log(`Written: PROFSAVE_profile (${output.split('\n').length - 1} lines)`);

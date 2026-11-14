#!/usr/bin/env bun
/**
 * Import PROFSAVE_profile changes back into base/*.toml and devices/*.toml.
 *
 * Usage: bun run cli/import.ts [device] [--dry-run]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { combineBase, merge, flatten } from '../lib/build.js';
import {
  parseProfile,
  diffProfile,
  deviceOverrideKeys,
  updateTomlValueText,
  removeTomlKeyText,
  findBaseFileForSection,
} from '../lib/import.js';
import {
  ROOT,
  resolveDevice,
  loadBaseFiles,
  loadDevice,
  devicePath,
  baseFilePath,
} from './_shared.js';

const dryRun = process.argv.includes('--dry-run');
const deviceName = resolveDevice();

const profilePath = join(ROOT, 'PROFSAVE_profile');
let current;
try {
  current = parseProfile(readFileSync(profilePath, 'utf8'));
} catch {
  console.error('Error: No PROFSAVE_profile found to import from.');
  process.exit(1);
}

const baseFiles = loadBaseFiles();
const base = combineBase(Object.values(baseFiles));
let device = {};
if (deviceName) {
  try {
    device = loadDevice(deviceName);
  } catch { }
}

const expected = flatten(merge(base, device));
const { added, changed, removed } = diffProfile(current, expected);

if (added.length === 0 && changed.length === 0 && removed.length === 0) {
  console.log('No differences. PROFSAVE_profile matches source config.');
  process.exit(0);
}

const overrideKeys = deviceOverrideKeys(device);

/** Update text on disk for a base or device file. */
function writeUpdate(
  filePath: string,
  section: string,
  key: string,
  value: string
) {
  const content = readFileSync(filePath, 'utf8');
  const updated = updateTomlValueText(content, section, key, value);
  if (updated !== content) writeFileSync(filePath, updated);
}

function writeRemove(filePath: string, section: string, key: string) {
  const content = readFileSync(filePath, 'utf8');
  const updated = removeTomlKeyText(content, section, key);
  if (updated !== null) writeFileSync(filePath, updated);
}

function targetForKey(qualifiedKey: string, section: string): string {
  if (overrideKeys.has(qualifiedKey) && deviceName) {
    return devicePath(deviceName);
  }
  const filename = findBaseFileForSection(baseFiles, section);
  if (filename) return baseFilePath(filename);
  // Fall back to first base file alphabetically
  const first = Object.keys(baseFiles).sort()[0];
  return first ? baseFilePath(first) : join(ROOT, 'base.toml');
}

let updates = 0;

if (added.length > 0) {
  console.log(`\n=== NEW KEYS [${added.length}] ===`);
  for (const { key, value } of added.sort((a, b) => a.key.localeCompare(b.key))) {
    const dotIdx = key.indexOf('.');
    const section = key.substring(0, dotIdx);
    const fieldName = key.substring(dotIdx + 1);
    console.log(`  + ${key} = ${value}`);
    if (!dryRun) {
      writeUpdate(targetForKey(key, section), section, fieldName, value);
      updates++;
    }
  }
}

if (changed.length > 0) {
  console.log(`\n=== CHANGED VALUES [${changed.length}] ===`);
  for (const { key, current: cur, expected: exp } of changed.sort((a, b) =>
    a.key.localeCompare(b.key)
  )) {
    const dotIdx = key.indexOf('.');
    const section = key.substring(0, dotIdx);
    const fieldName = key.substring(dotIdx + 1);
    console.log(`  ~ ${key}: ${exp} -> ${cur}`);
    if (!dryRun) {
      writeUpdate(targetForKey(key, section), section, fieldName, cur);
      updates++;
    }
  }
}

if (removed.length > 0) {
  console.log(`\n=== REMOVED KEYS [${removed.length}] ===`);
  for (const key of removed.sort()) {
    const dotIdx = key.indexOf('.');
    const section = key.substring(0, dotIdx);
    const fieldName = key.substring(dotIdx + 1);
    console.log(`  - ${key}`);
    if (!dryRun) {
      writeRemove(targetForKey(key, section), section, fieldName);
      updates++;
    }
  }
}

if (dryRun) {
  console.log(
    `\nDry run: ${added.length} new, ${changed.length} changed, ${removed.length} removed (no files modified)`
  );
} else {
  console.log(`\nApplied: ${updates} updates to source files`);
}

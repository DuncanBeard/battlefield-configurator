/**
 * Shared CLI helpers: load TOMLs from disk, resolve device.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { hostname } from 'os';
import { parse } from '../lib/toml-parser.js';
import type { TomlConfig } from '../lib/types.js';

export const ROOT = resolve(import.meta.dirname, '..');

export function resolveDevice(): string | null {
  const arg = process.argv[2];
  if (arg && !arg.startsWith('--')) return arg;

  try {
    const dev = readFileSync(join(ROOT, '.device'), 'utf8').trim();
    if (dev) return dev;
  } catch { }

  const currentHost = hostname();
  const deviceDir = join(ROOT, 'devices');
  if (!existsSync(deviceDir)) return null;

  for (const file of readdirSync(deviceDir)) {
    if (!file.endsWith('.toml')) continue;
    const content = readFileSync(join(deviceDir, file), 'utf8');
    const parsed = parse(content);
    if (
      typeof parsed.hostname === 'string' &&
      parsed.hostname.toLowerCase() === currentHost.toLowerCase()
    ) {
      return file.replace('.toml', '');
    }
  }

  return null;
}

/** Load all base/*.toml files keyed by filename. */
export function loadBaseFiles(): Record<string, TomlConfig> {
  const baseDir = join(ROOT, 'base');
  const result: Record<string, TomlConfig> = {};
  if (!existsSync(baseDir)) return result;

  for (const file of readdirSync(baseDir).sort()) {
    if (!file.endsWith('.toml')) continue;
    const content = readFileSync(join(baseDir, file), 'utf8');
    result[file] = parse(content);
  }
  return result;
}

export function loadDevice(deviceName: string): TomlConfig {
  const path = join(ROOT, 'devices', `${deviceName}.toml`);
  return parse(readFileSync(path, 'utf8'));
}

export function devicePath(deviceName: string): string {
  return join(ROOT, 'devices', `${deviceName}.toml`);
}

export function baseFilePath(filename: string): string {
  return join(ROOT, 'base', filename);
}

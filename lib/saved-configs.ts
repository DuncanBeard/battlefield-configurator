import type { ProfileEntries } from './types';

export const maxConfigBytes = 256 * 1024;
export const maxConfigs = 50;

export interface ConfigMetadata {
  id: string;
  name: string;
  deviceKey: string;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedConfig extends ConfigMetadata {
  entries: ProfileEntries;
}

export interface ConfigInput {
  name: string;
  deviceKey: string;
  schemaVersion: number;
  entries: ProfileEntries;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 100 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Use a nonempty name of at most 100 characters without control characters.');
  }
  return value.trim();
}

export function validateEntries(value: unknown): ProfileEntries {
  if (!isRecord(value) || !Object.keys(value).length) throw new Error('A config must contain profile settings.');
  const entries: ProfileEntries = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!/^Gst[A-Za-z0-9_]+\.[A-Za-z0-9_.-]+$/.test(key) || typeof entry !== 'string' || /[\x00-\x1f\x7f]/.test(entry)) {
      throw new Error('Config contains an invalid setting key or value.');
    }
    entries[key] = entry;
  }
  if (new TextEncoder().encode(JSON.stringify(entries)).length > maxConfigBytes) throw new Error('Config exceeds the 256 KiB limit.');
  return entries;
}

export function validateConfigInput(value: unknown): ConfigInput {
  if (!isRecord(value)) throw new Error('Expected a config object.');
  if (value.schemaVersion !== 1) throw new Error('Unsupported config version.');
  if (typeof value.deviceKey !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(value.deviceKey)) throw new Error('Invalid source device.');
  return { name: validateName(value.name), deviceKey: value.deviceKey, schemaVersion: 1, entries: validateEntries(value.entries) };
}

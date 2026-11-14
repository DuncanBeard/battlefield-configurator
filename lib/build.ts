import type { TomlConfig, ProfileEntries } from './types.js';

/**
 * Merge a device config onto a base config. Device values always win;
 * `hostname` top-level key is skipped.
 */
export function merge(base: TomlConfig, device: TomlConfig): TomlConfig {
  const result: TomlConfig = {};

  for (const section of Object.keys(base)) {
    const value = base[section];
    if (typeof value === 'object') {
      result[section] = { ...value };
    } else {
      result[section] = value;
    }
  }

  for (const section of Object.keys(device)) {
    if (section === 'hostname') continue;
    const devValue = device[section];
    if (typeof devValue !== 'object') continue;

    const existing = result[section];
    if (!existing || typeof existing !== 'object') {
      result[section] = { ...devValue };
    } else {
      Object.assign(existing, devValue);
    }
  }

  return result;
}

/**
 * Combine multiple base TOML files into a single config (later files
 * override earlier ones, but in practice base files have disjoint sections).
 */
export function combineBase(baseFiles: TomlConfig[]): TomlConfig {
  const combined: TomlConfig = {};
  for (const parsed of baseFiles) {
    for (const [section, values] of Object.entries(parsed)) {
      if (typeof values === 'object') {
        const existing = combined[section];
        if (!existing || typeof existing !== 'object') {
          combined[section] = { ...values };
        } else {
          Object.assign(existing, values);
        }
      } else {
        combined[section] = values;
      }
    }
  }
  return combined;
}

/** Flatten a merged config into PROFSAVE_profile entries. */
export function flatten(config: TomlConfig): ProfileEntries {
  const entries: ProfileEntries = {};
  for (const section of Object.keys(config)) {
    if (section === 'hostname') continue;
    const values = config[section];
    if (typeof values !== 'object') continue;
    for (const [key, value] of Object.entries(values)) {
      entries[`${section}.${key}`] = String(value);
    }
  }
  return entries;
}

/** Emit a config as PROFSAVE_profile text (sorted, space-separated). */
export function emit(config: TomlConfig): string {
  return emitEntries(flatten(config));
}

export function emitEntries(entries: ProfileEntries): string {
  const sorted = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
  const lines = sorted.map(([key, value]) =>
    value === '' ? key : `${key} ${value}`
  );
  return lines.join('\n') + '\n';
}

/** Build a PROFSAVE_profile string from base files + optional device override. */
export function buildProfile(
  baseFiles: TomlConfig[],
  device: TomlConfig | null
): string {
  const base = combineBase(baseFiles);
  const merged = device ? merge(base, device) : base;
  return emit(merged);
}

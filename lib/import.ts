import type { TomlConfig, ProfileEntries, ProfileDiff } from './types.js';

/** Parse a PROFSAVE_profile text into flat key/value entries. */
export function parseProfile(content: string): ProfileEntries {
  const entries: ProfileEntries = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      entries[trimmed] = '';
    } else {
      entries[trimmed.substring(0, spaceIdx)] = trimmed.substring(spaceIdx + 1);
    }
  }
  return entries;
}

/** Diff a current profile against the expected (merged) entries. */
export function diffProfile(
  current: ProfileEntries,
  expected: ProfileEntries
): ProfileDiff {
  const added: ProfileDiff['added'] = [];
  const changed: ProfileDiff['changed'] = [];
  const removed: ProfileDiff['removed'] = [];

  for (const [key, value] of Object.entries(current)) {
    if (!(key in expected)) {
      added.push({ key, value });
    } else if (expected[key] !== value) {
      changed.push({ key, current: value, expected: expected[key] });
    }
  }

  for (const key of Object.keys(expected)) {
    if (!(key in current)) {
      removed.push(key);
    }
  }

  return { added, changed, removed };
}

/** Set of fully-qualified keys (section.key) overridden by a device config. */
export function deviceOverrideKeys(device: TomlConfig): Set<string> {
  const keys = new Set<string>();
  for (const section of Object.keys(device)) {
    if (section === 'hostname') continue;
    const values = device[section];
    if (typeof values !== 'object') continue;
    for (const key of Object.keys(values)) {
      keys.add(`${section}.${key}`);
    }
  }
  return keys;
}

/**
 * Update a value in a TOML file's text, preserving comments and structure.
 * Returns the new file contents, or null if no change was made.
 */
export function updateTomlValueText(
  content: string,
  section: string,
  key: string,
  value: string
): string {
  const lines = content.split('\n');
  let inSection = false;
  let sectionFound = false;
  let keyUpdated = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (inSection && !keyUpdated) {
        const formattedValue = value === '' ? '""' : value;
        lines.splice(i, 0, `${key} = ${formattedValue}`);
        keyUpdated = true;
        break;
      }
      inSection = sectionMatch[1].trim() === section;
      if (inSection) sectionFound = true;
      continue;
    }

    if (!inSection) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const lineKey = trimmed.substring(0, eqIdx).trim();
    if (lineKey !== key) continue;

    const comment =
      trimmed.includes('#') && !trimmed.startsWith('#')
        ? '  ' + trimmed.substring(trimmed.indexOf('#'))
        : '';
    const indent = lines[i].match(/^(\s*)/)?.[1] ?? '';
    const formattedValue = value === '' ? '""' : value;
    lines[i] = `${indent}${key} = ${formattedValue}${comment}`;
    keyUpdated = true;
    break;
  }

  if (sectionFound && !keyUpdated) {
    let insertIdx = lines.length;
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        if (inTarget) {
          insertIdx = i;
          break;
        }
        if (sectionMatch[1].trim() === section) inTarget = true;
      }
    }
    const formattedValue = value === '' ? '""' : value;
    lines.splice(insertIdx, 0, `${key} = ${formattedValue}`);
    keyUpdated = true;
  }

  if (!sectionFound) {
    const formattedValue = value === '' ? '""' : value;
    lines.push('', `[${section}]`, `${key} = ${formattedValue}`);
    keyUpdated = true;
  }

  return keyUpdated ? lines.join('\n') : content;
}

/** Remove a key from a TOML file's text. Returns new contents or null if not found. */
export function removeTomlKeyText(
  content: string,
  section: string,
  key: string
): string | null {
  const lines = content.split('\n');
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      inSection = sectionMatch[1].trim() === section;
      continue;
    }
    if (!inSection) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    if (trimmed.substring(0, eqIdx).trim() === key) {
      lines.splice(i, 1);
      return lines.join('\n');
    }
  }
  return null;
}

/**
 * Find which base filename owns a given section, by inspecting parsed contents.
 * Returns null if no file claims it.
 */
export function findBaseFileForSection(
  baseFiles: Record<string, TomlConfig>,
  section: string
): string | null {
  for (const [filename, parsed] of Object.entries(baseFiles)) {
    if (section in parsed && typeof parsed[section] === 'object') {
      return filename;
    }
  }
  return null;
}

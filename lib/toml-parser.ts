import type { TomlConfig } from './types.js';

/**
 * Minimal TOML parser for flat key-value files with sections.
 * Supports: strings, integers, floats, bare keys, dotted section headers.
 * Does NOT support: arrays, inline tables, multi-line strings, dates.
 */
export function parse(content: string): TomlConfig {
  const result: TomlConfig = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.substring(0, eqIdx).trim();
    let value = line.substring(eqIdx + 1).trim();

    // Strip inline comments (not inside quotes)
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < value.length; index++) {
      const character = value[index];
      if (character === '#' && !quoted) {
        value = value.slice(0, index).trim();
        break;
      }
      if (character === '"' && !escaped) quoted = !quoted;
      escaped = quoted && character === '\\' && !escaped;
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    if (currentSection) {
      const section = result[currentSection];
      if (typeof section === 'object') {
        section[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

import { diffProfile, parseProfile } from './import.js';
import type { ProfileEntries } from './types.js';

export type ProfileEdits = Record<string, string | null>;
export type ChangeKind = 'added' | 'changed' | 'removed';

export interface ProfileChange {
  key: string;
  section: string;
  field: string;
  kind: ChangeKind;
  before: string | null;
  after: string | null;
}

export function applyEdits(entries: ProfileEntries, edits: ProfileEdits): ProfileEntries {
  const result = { ...entries };
  for (const [key, value] of Object.entries(edits)) {
    if (value === null) delete result[key];
    else result[key] = value;
  }
  return result;
}

export function profileChanges(before: ProfileEntries, after: ProfileEntries): ProfileChange[] {
  const diff = diffProfile(after, before);
  const changes = [
    ...diff.added.map(({ key, value }) => ({ key, kind: 'added' as const, before: null, after: value })),
    ...diff.changed.map(({ key, expected, current }) => ({ key, kind: 'changed' as const, before: expected, after: current })),
    ...diff.removed.map((key) => ({ key, kind: 'removed' as const, before: before[key], after: null })),
  ];
  return changes
    .map((change) => {
      const separator = change.key.indexOf('.');
      return { ...change, section: change.key.slice(0, separator), field: change.key.slice(separator + 1) };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function changesToEdits(changes: ProfileChange[]): ProfileEdits {
  return Object.fromEntries(changes.map(({ key, after }) => [key, after]));
}

export function parseImportedProfile(content: string): ProfileEntries {
  if (content.includes('\0')) throw new Error('Choose the text PROFSAVE_profile, not a binary save file.');
  const entries = parseProfile(content.replace(/^\uFEFF/, ''));
  const keys = Object.keys(entries);
  if (!keys.length || keys.some((key) => !/^Gst[A-Za-z0-9_]+\.[A-Za-z0-9_.-]+$/.test(key))) {
    throw new Error('This file is not a valid PROFSAVE_profile.');
  }
  return entries;
}
/**
 * Domain types used across CLI, web, and desktop.
 */

/** A parsed TOML config: top-level keys (like `hostname`) or sections of key/value pairs. */
export type TomlConfig = {
  [section: string]: string | { [key: string]: string };
};

/** Flat profile entries: fully-qualified key (`GstRender.ResolutionWidth`) → string value. */
export type ProfileEntries = Record<string, string>;

/** A loaded set of source TOML files. */
export interface ConfigSet {
  /** filename (e.g. "audio.toml") → parsed contents */
  base: Record<string, TomlConfig>;
  /** filename (e.g. "desktop.toml") → parsed contents */
  devices: Record<string, TomlConfig>;
}

export interface ProfileDiff {
  added: { key: string; value: string }[];
  changed: { key: string; current: string; expected: string }[];
  removed: string[];
}

/**
 * Bundles all base/*.toml and devices/*.toml as raw strings at build time
 * using Vite's import.meta.glob.
 */
import { parse } from '$lib/toml-parser';
import type { TomlConfig } from '$lib/types';

const baseRaw = import.meta.glob('/base/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const devicesRaw = import.meta.glob('/devices/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** filename -> parsed config, sorted by filename. */
export const baseConfigs: Record<string, TomlConfig> = Object.fromEntries(
  Object.entries(baseRaw)
    .map(([path, content]) => [basename(path), parse(content)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
);

/** device name (no extension) -> parsed config. */
export const deviceConfigs: Record<string, TomlConfig> = Object.fromEntries(
  Object.entries(devicesRaw).map(
    ([path, content]) =>
      [basename(path).replace(/\.toml$/, ''), parse(content)] as const
  )
);

export const deviceNames: string[] = Object.keys(deviceConfigs).sort();

/**
 * Filesystem abstraction: in Tauri, write directly to the game directory.
 * In the browser, use File System Access API where supported, or fall back
 * to a download.
 */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const hasFsAccess = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Trigger a browser download of the given text content. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface DeployResult {
  method: 'tauri' | 'fs-access' | 'download';
  path?: string;
}

let cachedDirHandle: FileSystemDirectoryHandle | null = null;

/** Deploy a PROFSAVE_profile string to the game directory. */
export async function deployProfile(content: string): Promise<DeployResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string>('deploy_profile', { content });
    return { method: 'tauri', path };
  }

  if (hasFsAccess()) {
    if (!cachedDirHandle) {
      // @ts-expect-error — File System Access API not in default DOM types
      cachedDirHandle = await window.showDirectoryPicker({
        id: 'bf6-game-dir',
        mode: 'readwrite',
        startIn: 'documents',
      });
    }
    const dir = cachedDirHandle!;
    const fileHandle = await dir.getFileHandle('PROFSAVE_profile', {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return { method: 'fs-access', path: dir.name + '/PROFSAVE_profile' };
  }

  downloadText('PROFSAVE_profile', content);
  return { method: 'download' };
}

/** Read a PROFSAVE_profile file the user picks (for import). */
export async function pickProfileFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.oncancel = () => reject(new DOMException('File selection cancelled.', 'AbortError'));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new DOMException('File selection cancelled.', 'AbortError'));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('Profile is too large. Choose a PROFSAVE_profile smaller than 2 MB.'));
        return;
      }
      try { resolve(await file.text()); }
      catch (error) { reject(error); }
    };
    input.click();
  });
}

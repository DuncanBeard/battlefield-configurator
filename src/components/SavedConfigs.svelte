<script lang="ts">
  import { onMount } from 'svelte';
  import { api, metadata, savedConfig } from '../lib/cloud';
  import type { ConfigMetadata, SavedConfig } from '$lib/saved-configs';
  import { isRecord } from '$lib/saved-configs';

  let { refresh, locked, onload, onrename, ondelete, onerror }: {
    refresh: number;
    locked: boolean;
    onload: (config: SavedConfig) => void;
    onrename: (config: SavedConfig) => void;
    ondelete: (id: string) => void;
    onerror: (error: unknown) => void;
  } = $props();
  let configs = $state<ConfigMetadata[]>([]);
  let nextOffset = $state<number | null>(null);
  let busy = $state(false);
  let alive = true;
  onMount(() => () => { alive = false; });

  async function list(offset = 0) {
    busy = true;
    try {
      const data = await api(`configs?offset=${offset}&limit=20`);
      if (!isRecord(data) || !Array.isArray(data.configs) || (data.nextOffset !== null && typeof data.nextOffset !== 'number')) throw new Error('Invalid config list response.');
      const items = data.configs.map(metadata);
      if (!alive) return;
      configs = offset ? [...configs, ...items] : items;
      nextOffset = data.nextOffset;
    } catch (error) { if (alive) onerror(error); }
    finally { if (alive) busy = false; }
  }

  $effect(() => { void refresh; void list(); });

  async function act(item: ConfigMetadata, action: 'load' | 'rename' | 'delete') {
    const name = action === 'rename' ? window.prompt('Config name', item.name) : undefined;
    if (name === null) return;
    if (action === 'delete' && !window.confirm(`Delete "${item.name}" from your account? This cannot be undone.`)) return;
    busy = true;
    try {
      if (action === 'load') {
        const config = savedConfig(await api(`configs/${item.id}`));
        if (alive) onload(config);
      } else if (action === 'rename') {
        const config = savedConfig(await api(`configs/${item.id}`, 'PATCH', { name, revision: item.revision }));
        if (alive) { onrename(config); await list(); }
      } else {
        await api(`configs/${item.id}`, 'DELETE', { revision: item.revision });
        if (alive) { ondelete(item.id); await list(); }
      }
    } catch (error) { if (alive) onerror(error); }
    finally { if (alive) busy = false; }
  }
</script>

<section aria-label="Saved configs">
  <div class="list-heading"><p>Private to your account. Local edits are uploaded only when you save.</p><button onclick={() => list()} disabled={busy}>Refresh list</button></div>
  {#if !configs.length && !busy}<p>No saved configs yet. Use Save as to save the current profile.</p>{/if}
  <ul>
    {#each configs as config (config.id)}
      <li>
        <div><strong>{config.name}</strong><small>{config.deviceKey} / revision {config.revision}</small></div>
        <div class="actions">
          <button onclick={() => act(config, 'load')} disabled={busy || locked}>Load <span class="sr-only">{config.name}</span></button>
          <button onclick={() => act(config, 'rename')} disabled={busy || locked}>Rename <span class="sr-only">{config.name}</span></button>
          <button onclick={() => act(config, 'delete')} disabled={busy || locked}>Delete <span class="sr-only">{config.name}</span></button>
        </div>
      </li>
    {/each}
  </ul>
  {#if busy}<p role="status">Loading saved configs...</p>{/if}
  {#if nextOffset !== null}<button onclick={() => list(nextOffset ?? 0)} disabled={busy}>More configs</button>{/if}
</section>

<style>
  .list-heading, li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
  p { font-size: 12px; color: var(--muted); }
  ul { list-style: none; padding: 0; }
  li { background: white; padding: 16px; border: 1px solid var(--border); margin: 12px 0; border-radius: 4px; }
  strong { overflow-wrap: anywhere; }
  small { display: block; color: var(--muted); margin-top: 6px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>

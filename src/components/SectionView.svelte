<script lang="ts">
  import { ChevronLeft, ChevronRight, Search, RotateCcw, LockKeyhole, Info, SlidersHorizontal } from 'lucide-svelte';
  import { displayValue, getSetting } from '$lib/settings';
  import SettingControl from './SettingControl.svelte';

  let { name, values, overrideKeys, baseline = {}, editKeys = new Set<string>(), onvaluechange = () => {}, onreset = () => {} }: {
    name: string;
    values: Record<string, string>;
    overrideKeys: Set<string>;
    baseline?: Record<string, string>;
    editKeys?: Set<string>;
    onvaluechange?: (key: string, value: string) => void;
    onreset?: (key: string) => void;
  } = $props();

  let search = $state('');
  let group = $state('all');
  let editedOnly = $state(false);
  let advanced = $state(false);
  let page = $state(1);
  const pageSize = 40;

  const rows = $derived(Object.entries(values).map(([field, value]) => {
    const key = `${name}.${field}`;
    return { key, field, value, definition: getSetting(key, value) };
  }));
  const groupNames = $derived([...new Set(rows.filter((row) => advanced || !row.definition.advanced).map((row) => row.definition.group))]);
  const filtered = $derived(rows.filter((row) =>
    (advanced || !row.definition.advanced) &&
    (group === 'all' || row.definition.group === group) &&
    (!editedOnly || editKeys.has(row.key)) &&
    `${row.key} ${row.definition.label} ${row.definition.group} ${displayValue(row.key, row.value)}`.toLowerCase().includes(search.toLowerCase().trim())
  ));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const currentPage = $derived(Math.min(page, pageCount));
  const visible = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));
  const visibleGroups = $derived([...new Set(visible.map((row) => row.definition.group))]);

  function changeFilters() { page = 1; }
</script>

<div class="settings-toolbar">
  <div class="search-field">
    <Search size={16} aria-hidden="true" />
    <input aria-label="Search settings" placeholder="Search settings or keys" bind:value={search} oninput={changeFilters} type="search" />
  </div>
  <select aria-label="Settings group" bind:value={group} onchange={changeFilters}>
    <option value="all">All groups</option>
    {#each groupNames as groupName}<option value={groupName}>{groupName}</option>{/each}
  </select>
  <label class="check-label"><input type="checkbox" bind:checked={editedOnly} onchange={changeFilters} />Edited only</label>
  <label class="check-label"><input type="checkbox" bind:checked={advanced} onchange={() => { group = 'all'; changeFilters(); }} />Advanced</label>
</div>

<div class="list-caption"><span><SlidersHorizontal size={13} aria-hidden="true" /> {filtered.length} settings</span><span>Profile value</span></div>

{#if !filtered.length}
  <div class="empty-state"><Search size={26} /><h3>No matching settings</h3></div>
{/if}

{#each visibleGroups as groupName}
  <section class="settings-group" aria-label={groupName}>
    <h2>{groupName}<span>{filtered.filter((row) => row.definition.group === groupName).length}</span></h2>
    {#each visible.filter((row) => row.definition.group === groupName) as row (row.key)}
      {@const edited = editKeys.has(row.key)}
      <div class="setting-row" class:edited data-setting={row.key}>
        <div class="setting-name">
          <div class="label-line">
            {#if row.definition.readonly}<LockKeyhole size={13} aria-label="Engine managed" />{/if}
            <label for={`setting-${row.key}`}>{row.definition.label}</label>
            {#if row.definition.note}<button type="button" class="setting-note" title={row.definition.note} aria-label={row.definition.note}><Info size={14} /></button>{/if}
          </div>
          <code>{row.field}</code>
          <div class="origin">
            <span class:override={overrideKeys.has(row.key)}>{row.definition.readonly ? 'Engine managed' : overrideKeys.has(row.key) ? 'Device override' : 'Base config'}</span>
            {#if edited}<span class="edited-label">Edited</span>{/if}
          </div>
        </div>
        <div class="value-area">
          <SettingControl settingKey={row.key} value={row.value} definition={row.definition} onchange={(value) => onvaluechange(row.key, value)} />
          {#if edited}<span class="original-value">Original: {displayValue(row.key, baseline[row.field] ?? null)}</span>{/if}
        </div>
        <button class="icon-button reset-setting" disabled={!edited} onclick={() => onreset(row.key)} aria-label={`Reset ${row.definition.label}`} title={`Reset ${row.definition.label}`}><RotateCcw size={15} /></button>
      </div>
    {/each}
  </section>
{/each}

{#if filtered.length > pageSize}
  <div class="pagination">
    <span>{(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span>
    <div><button class="icon-button" aria-label="Previous settings page" title="Previous page" disabled={currentPage === 1} onclick={() => page = currentPage - 1}><ChevronLeft size={17} /></button><span>{currentPage} / {pageCount}</span><button class="icon-button" aria-label="Next settings page" title="Next page" disabled={currentPage === pageCount} onclick={() => page = currentPage + 1}><ChevronRight size={17} /></button></div>
  </div>
{/if}

<style>
  .settings-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding: 0 0 22px; }
  .search-field { flex: 1 1 230px; }
  .settings-toolbar select { max-width: 200px; }
  .list-caption { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 12px; color: var(--muted); font-size: 11px; }
  .list-caption > span:first-child { display: flex; align-items: center; gap: 7px; }
  .list-caption > span:last-child { padding-right: 45px; }
  .settings-group { margin: 0 0 26px; }
  .settings-group h2 { display: flex; align-items: center; gap: 9px; font-size: 12px; text-transform: uppercase; font-weight: 600; padding: 22px 0 10px; margin: 0; color: var(--muted); }
  .settings-group h2 span { font-family: var(--mono); font-size: 10px; font-weight: 400; }
  .setting-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 270px) 28px; gap: 16px; align-items: center; min-height: 87px; padding: 14px 0; border-bottom: 1px solid var(--border-soft); }
  .setting-row.edited { border-left: 2px solid var(--ochre); padding-left: 12px; }
  .setting-name, .value-area { min-width: 0; }
  .label-line { display: flex; align-items: center; gap: 6px; }
  .label-line label { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .setting-note { display: flex; color: var(--muted); cursor: help; flex: 0 0 auto; padding: 2px; min-height: 22px; border: 0; background: transparent; }
  .setting-name > code { display: block; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; margin: 3px 0 5px; }
  .origin { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 10px; }
  .origin .override { color: var(--blue); }
  .origin .edited-label { color: var(--ochre); font-weight: 600; }
  .original-value { display: block; font-size: 10px; color: var(--muted); text-align: right; margin-top: 5px; overflow-wrap: anywhere; }
  .reset-setting { width: 28px; height: 30px; border: none; padding: 4px; background: transparent; }
  @media (max-width: 640px) {
    .settings-toolbar { gap: 12px; }
    .search-field { flex-basis: 100%; }
    .settings-toolbar select { max-width: 100%; flex: 1 1 100%; }
    .setting-row { grid-template-columns: minmax(0, 1fr) 28px; gap: 10px; }
    .setting-name { grid-column: 1; }
    .value-area { grid-column: 1; grid-row: 2; }
    .reset-setting { grid-column: 2; grid-row: 1 / 3; }
    .list-caption > span:last-child { display: none; }
  }
</style>

<script lang="ts">
  import { ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Columns2, Download, LockKeyhole, Minus, Plus, Rows3, Search } from 'lucide-svelte';
  import type { ChangeKind, ProfileChange } from '$lib/editor';
  import { displayValue, getSetting, sectionNames } from '$lib/settings';
  import { downloadText } from '../lib/fsAccess';

  let { changes, beforeLabel, afterLabel, actionLabel, onapply }: {
    changes: ProfileChange[];
    beforeLabel: string;
    afterLabel: string;
    actionLabel: string;
    onapply: (selected: ProfileChange[]) => void;
  } = $props();

  let search = $state('');
  let section = $state('all');
  let kind = $state<ChangeKind | 'all'>('all');
  let layout = $state<'split' | 'unified'>('split');
  let raw = $state(false);
  let selected = $state(new Set<string>());
  let page = $state(1);
  const pageSize = 50;
  const kinds = ['all', 'changed', 'added', 'removed'] as const;
  const kindLabels = { all: 'All', changed: 'Changed', added: 'Added', removed: 'Removed' };
  const sections = $derived([...new Set(changes.map((change) => change.section))]);
  const filtered = $derived(changes.filter((change) =>
    (section === 'all' || change.section === section) &&
    (kind === 'all' || change.kind === kind) &&
    `${change.key} ${getSetting(change.key).label} ${displayValue(change.key, change.before)} ${displayValue(change.key, change.after)} ${change.before ?? ''} ${change.after ?? ''}`.toLowerCase().includes(search.toLowerCase().trim())
  ));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const currentPage = $derived(Math.min(page, pageCount));
  const visible = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));
  const selectable = $derived(visible.filter((change) => !getSetting(change.key).readonly));
  const selectedRows = $derived(changes.filter((change) => selected.has(change.key) && !getSetting(change.key).readonly));
  const selectedOnPage = $derived(selectable.filter((change) => selected.has(change.key)).length);
  const allOnPage = $derived(selectable.length > 0 && selectedOnPage === selectable.length);

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    selected = next;
  }

  function selectPage(checked: boolean) {
    const next = new Set(selected);
    for (const change of selectable) {
      if (checked) next.add(change.key);
      else next.delete(change.key);
    }
    selected = next;
  }

  function exportDiff() {
    const lines = changes.flatMap((change) => [
      ...(change.before !== null ? [`- ${change.key}${change.before === '' ? '' : ' ' + change.before}`] : []),
      ...(change.after !== null ? [`+ ${change.key}${change.after === '' ? '' : ' ' + change.after}`] : []),
    ]);
    downloadText('PROFSAVE_profile.diff', [`--- ${beforeLabel}`, `+++ ${afterLabel}`, ...lines, ''].join('\n'));
  }
</script>

{#snippet valueDisplay(key: string, value: string | null)}
  {#if value === null}
    <span class="absent">Not present</span>
  {:else if value === ''}
    <span class="absent">Empty value</span><code>""</code>
  {:else}
    <span class:raw-value={raw}>{raw ? value : displayValue(key, value)}</span>
    {#if !raw && displayValue(key, value) !== value}<code>Raw: {value}</code>{/if}
  {/if}
{/snippet}

<div class="diff-summary">
  <div class="kind-filters" aria-label="Change type">
    {#each kinds as filter}
      <button class:active={kind === filter} class={filter} aria-pressed={kind === filter} onclick={() => { kind = filter; page = 1; }}>
        {kindLabels[filter]}<span>{filter === 'all' ? changes.length : changes.filter((change) => change.kind === filter).length}</span>
      </button>
    {/each}
  </div>
  <button class="icon-button" onclick={exportDiff} disabled={!changes.length} title="Download comparison" aria-label="Download comparison"><Download size={17} /></button>
</div>

<div class="diff-toolbar">
  <div class="search-field"><Search size={16} /><input type="search" aria-label="Search changes" placeholder="Search changes" bind:value={search} oninput={() => page = 1} /></div>
  <select aria-label="Filter changes by section" bind:value={section} onchange={() => page = 1}>
    <option value="all">All sections</option>
    {#each sections as sectionName}<option value={sectionName}>{sectionNames[sectionName] ?? sectionName}</option>{/each}
  </select>
  <label class="check-label"><input type="checkbox" bind:checked={raw} />Raw values</label>
  <div class="layout-toggle" aria-label="Diff layout">
    <button class="icon-button" class:active={layout === 'split'} aria-pressed={layout === 'split'} onclick={() => layout = 'split'} title="Side-by-side diff" aria-label="Side-by-side diff"><Columns2 size={16} /></button>
    <button class="icon-button" class:active={layout === 'unified'} aria-pressed={layout === 'unified'} onclick={() => layout = 'unified'} title="Unified diff" aria-label="Unified diff"><Rows3 size={16} /></button>
  </div>
</div>

{#if changes.length === 0}
  <div class="empty-state"><CheckCircle2 size={32} /><h3>No differences</h3><p>{beforeLabel} matches {afterLabel}.</p></div>
{:else if filtered.length === 0}
  <div class="empty-state"><Search size={28} /><h3>No matching changes</h3></div>
{:else}
  <table class:unified={layout === 'unified'}>
    <caption class="sr-only">{beforeLabel} compared with {afterLabel}</caption>
    <thead><tr>
      <th class="select-column"><input type="checkbox" aria-label="Select visible changes" checked={allOnPage} indeterminate={selectedOnPage > 0 && !allOnPage} disabled={!selectable.length} onchange={(event) => selectPage(event.currentTarget.checked)} /></th>
      <th class="setting-column">Setting</th>
      {#if layout === 'split'}<th>{beforeLabel}</th><th>{afterLabel}</th>{:else}<th>{beforeLabel} / {afterLabel}</th>{/if}
    </tr></thead>
    <tbody>
      {#each visible as change (change.key)}
        {@const definition = getSetting(change.key, change.after ?? change.before ?? '')}
        <tr class={`diff-row ${change.kind}`} class:selected={selected.has(change.key)} data-key={change.key}>
          <td class="select-column"><input type="checkbox" aria-label={`Select ${change.key}`} disabled={definition.readonly} checked={selected.has(change.key)} onchange={(event) => toggle(change.key, event.currentTarget.checked)} /></td>
          <td class="setting-column">
            <div class="change-meta"><span class={`change-kind ${change.kind}`}>{kindLabels[change.kind]}</span><span>{sectionNames[change.section] ?? change.section}</span>{#if definition.readonly}<LockKeyhole size={12} aria-label="Engine managed" />{/if}</div>
            <strong>{definition.label}</strong><code class="qualified-key">{change.key}</code>
          </td>
          {#if layout === 'split'}
            <td class="before-value" data-label={beforeLabel}>{@render valueDisplay(change.key, change.before)}</td>
            <td class="after-value" data-label={afterLabel}>{@render valueDisplay(change.key, change.after)}</td>
          {:else}
            <td class="unified-values">
              <div class="before-line"><Minus size={13} /><div>{@render valueDisplay(change.key, change.before)}</div></div>
              <div class="after-line"><Plus size={13} /><div>{@render valueDisplay(change.key, change.after)}</div></div>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if filtered.length > pageSize}
  <div class="pagination">
    <span>{(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span>
    <div><button class="icon-button" aria-label="Previous changes page" title="Previous page" disabled={currentPage === 1} onclick={() => page = currentPage - 1}><ChevronLeft size={17} /></button><span>{currentPage} / {pageCount}</span><button class="icon-button" aria-label="Next changes page" title="Next page" disabled={currentPage === pageCount} onclick={() => page = currentPage + 1}><ChevronRight size={17} /></button></div>
  </div>
{/if}

<div class="diff-actions">
  <div><Check size={15} /><span>{selectedRows.length} selected{selectedRows.length > selectedOnPage ? ` (${selectedRows.length - selectedOnPage} on other pages or filters)` : ''}</span></div>
  <button class="primary" disabled={!selectedRows.length} onclick={() => { onapply(selectedRows); selected = new Set(); }}><ArrowRight size={16} />{actionLabel}</button>
</div>

<style>
  .diff-summary { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding-bottom: 22px; }
  .kind-filters { display: flex; flex-wrap: wrap; gap: 4px; }
  .kind-filters button { background: transparent; border-color: transparent; }
  .kind-filters button.active { background: white; border-color: var(--border); }
  .kind-filters button > span { font-family: var(--mono); font-size: 10px; }
  .kind-filters .added { color: var(--accent); }
  .kind-filters .changed { color: var(--ochre); }
  .kind-filters .removed { color: var(--red); }
  .diff-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-bottom: 18px; }
  .diff-toolbar .search-field { flex: 1 1 180px; }
  .diff-toolbar select { max-width: 180px; }
  .layout-toggle { display: flex; gap: 3px; }
  .layout-toggle .active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }
  th { padding: 12px; text-align: left; font-size: 11px; font-weight: 500; background: #eaf0e9; color: var(--muted); border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
  td { padding: 15px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; overflow-wrap: anywhere; }
  .select-column { width: 35px; padding-left: 8px; padding-right: 8px; }
  .setting-column { width: 43%; }
  .setting-column strong { font-size: 12px; font-weight: 500; display: block; }
  .qualified-key { display: block; font-size: 10px; margin-top: 5px; color: var(--muted); }
  .change-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 10px; color: var(--muted); margin-bottom: 7px; }
  .change-kind { font-weight: 600; }
  .change-kind.changed { color: var(--ochre); }
  .change-kind.added { color: var(--accent); }
  .change-kind.removed { color: var(--red); }
  .before-value { background: #fcf3ef; }
  .after-value { background: #eef5ee; }
  .before-value code, .after-value code, .unified-values code { display: block; font-size: 10px; color: var(--muted); margin-top: 5px; }
  .absent { color: var(--muted); font-style: italic; }
  .raw-value { font-family: var(--mono); font-size: 11px; }
  tr.selected .setting-column, tr.selected .select-column { background: #f0f3ea; }
  .before-line, .after-line { display: flex; align-items: center; gap: 8px; padding: 8px; min-width: 0; }
  .before-line { background: #fcf3ef; }
  .after-line { background: #eef5ee; }
  .before-line > div, .after-line > div { min-width: 0; }
  .before-line > :global(svg), .after-line > :global(svg) { flex-shrink: 0; }
  .diff-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; padding: 16px 0; border-top: 1px solid var(--border); }
  .diff-actions > div { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  @media (max-width: 680px) {
    .kind-filters { gap: 0; }
    .kind-filters button { padding: 8px; gap: 5px; font-size: 11px; }
    .diff-toolbar .search-field { flex-basis: 100%; }
    .diff-toolbar select { max-width: 100%; flex: 1 1 100%; }
    table, tbody, tr, td { display: block; width: 100%; }
    thead { display: block; }
    thead tr { display: flex; align-items: center; }
    thead th:not(.select-column) { display: none; }
    thead .select-column { width: auto; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; }
    thead .select-column::after { content: 'Select visible'; font-size: 11px; font-weight: 400; }
    tbody tr { display: grid; grid-template-columns: 30px minmax(0, 1fr); margin: 10px 0 18px; border-bottom: 1px solid var(--border); }
    td { border: 0; padding: 10px; }
    td.select-column { width: 30px; grid-column: 1; grid-row: 1; }
    td.setting-column { width: auto; grid-column: 2; grid-row: 1; padding-left: 0; }
    .before-value, .after-value, .unified-values { grid-column: 2; }
    .before-value::before, .after-value::before { content: attr(data-label); display: block; color: var(--muted); font-size: 10px; margin-bottom: 5px; }
    .diff-actions { align-items: stretch; flex-direction: column; }
  }
</style>

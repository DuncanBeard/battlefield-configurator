<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertCircle, CheckCircle2, Download, GitCompareArrows, HardDrive, Headphones, Keyboard, Monitor, MousePointer2, Redo2, RotateCcw, Shield, SlidersHorizontal, Undo2, Upload, Users, X } from 'lucide-svelte';
  import { baseConfigs, deviceConfigs, deviceNames } from './lib/configs';
  import { emitEntries, flatten, merge, combineBase } from '$lib/build';
  import { deviceOverrideKeys } from '$lib/import';
  import { applyEdits, changesToEdits, parseImportedProfile, profileChanges } from '$lib/editor';
  import type { ProfileChange, ProfileEdits } from '$lib/editor';
  import { getSetting, humanize, sameValue, sectionNames } from '$lib/settings';
  import { recommendationEdits } from '$lib/recommendations';
  import type { Recommendation } from '$lib/recommendations';
  import { deployProfile, downloadText, pickProfileFile, isTauri } from './lib/fsAccess';
  import type { ProfileEntries } from '$lib/types';
  import SectionView from './components/SectionView.svelte';
  import DiffView from './components/DiffView.svelte';
  import Recommendations from './components/Recommendations.svelte';
  import gameImage from './battlefield-header.jpg';

  type Comparison = { id: number; label: string } & (
    { kind: 'import'; entries: ProfileEntries } | { kind: 'preset'; patch: ProfileEdits }
  );

  const storageKey = 'bf6-configurator.workspace.v1';
  const profileIds = ['base', ...deviceNames];
  const base = combineBase(Object.values(baseConfigs));
  const sectionIcons: Record<string, typeof Monitor> = { GstRender: Monitor, GstAudio: Headphones, GstInput: MousePointer2, GstKeyBinding: Keyboard };
  const canDeploy = isTauri() || 'showDirectoryPicker' in window;

  let selectedDevice = $state(deviceNames.includes('desktop') ? 'desktop' : 'base');
  let activePanel = $state('GstRender');
  let drafts = $state<Record<string, ProfileEdits>>({});
  let undoHistory = $state<Record<string, ProfileEdits[]>>({});
  let redoHistory = $state<Record<string, ProfileEdits[]>>({});
  let ready = $state(false);
  let persistenceEnabled = $state(true);
  let storageState = $state('Local draft');
  let busy = $state<'import' | 'deploy' | null>(null);
  let notice = $state<{ message: string; error: boolean } | null>(null);
  let comparison = $state<Comparison | null>(null);
  let comparisonId = 0;
  let diffMode = $state<'draft' | 'comparison'>('draft');

  const device = $derived(selectedDevice === 'base' ? {} : deviceConfigs[selectedDevice] ?? {});
  const baseline = $derived(flatten(merge(base, device)));
  const edits = $derived(drafts[selectedDevice] ?? {});
  const entries = $derived(applyEdits(baseline, edits));
  const profileText = $derived(emitEntries(entries));
  const draftChanges = $derived(profileChanges(baseline, entries));
  const editKeys = $derived(new Set(draftChanges.map((change) => change.key)));
  const overrideKeys = $derived(deviceOverrideKeys(device));
  const sections = $derived([...new Set([...Object.keys(sectionNames), ...Object.keys(entries).map((key) => key.split('.')[0])])]);
  const displayedChanges = $derived(diffMode === 'comparison' && comparison
    ? profileChanges(entries, comparison.kind === 'preset' ? applyEdits(entries, comparison.patch) : comparison.entries)
    : draftChanges);
  const pageTitle = $derived(activePanel === 'recommendations' ? 'Community recommendations' : activePanel === 'changes' ? 'Review changes' : sectionNames[activePanel] ?? humanize(activePanel));

  onMount(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.version !== 1 || !parsed.drafts || typeof parsed.drafts !== 'object') throw new Error('Invalid saved draft');
        const restored: Record<string, ProfileEdits> = {};
        for (const [profile, patch] of Object.entries(parsed.drafts)) {
          if (!profileIds.includes(profile)) continue;
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid saved profile');
          const valid: ProfileEdits = {};
          for (const [key, value] of Object.entries(patch)) {
            if (!/^Gst[A-Za-z0-9_]+\.[A-Za-z0-9_.-]+$/.test(key) || (value !== null && (typeof value !== 'string' || /[\r\n\0]/.test(value)))) throw new Error('Invalid saved setting');
            if (!getSetting(key).readonly) valid[key] = value as string | null;
          }
          restored[profile] = valid;
        }
        drafts = restored;
        if (typeof parsed.selectedDevice === 'string' && profileIds.includes(parsed.selectedDevice)) selectedDevice = parsed.selectedDevice;
      }
    } catch {
      persistenceEnabled = false;
      storageState = 'Session only';
      notice = { message: 'Local drafts could not be restored. Existing saved data has not been overwritten; export your changes before closing.', error: true };
    }
    ready = true;
  });

  $effect(() => {
    if (!ready || !persistenceEnabled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, selectedDevice, drafts }));
      storageState = 'Local draft saved';
    } catch {
      storageState = 'Session only';
      notice = { message: 'Local storage is unavailable or full. Export your profile before closing this session.', error: true };
    }
  });

  function saveEdits(next: ProfileEdits) {
    if (JSON.stringify(next) === JSON.stringify(edits)) return;
    undoHistory = { ...undoHistory, [selectedDevice]: [...(undoHistory[selectedDevice] ?? []).slice(-39), { ...edits }] };
    redoHistory = { ...redoHistory, [selectedDevice]: [] };
    drafts = { ...drafts, [selectedDevice]: next };
  }

  function stage(patch: ProfileEdits) {
    const next = { ...edits };
    for (const [key, value] of Object.entries(patch)) {
      if (getSetting(key).readonly) continue;
      if (value === (baseline[key] ?? null)) delete next[key];
      else next[key] = value;
    }
    saveEdits(next);
  }

  function changeValue(key: string, value: string) {
    stage({ [key]: baseline[key] !== undefined && sameValue(baseline[key], value) ? baseline[key] : value });
  }

  function undo() {
    const history = undoHistory[selectedDevice] ?? [];
    if (!history.length) return;
    redoHistory = { ...redoHistory, [selectedDevice]: [...(redoHistory[selectedDevice] ?? []), { ...edits }] };
    drafts = { ...drafts, [selectedDevice]: history.at(-1)! };
    undoHistory = { ...undoHistory, [selectedDevice]: history.slice(0, -1) };
  }

  function redo() {
    const history = redoHistory[selectedDevice] ?? [];
    if (!history.length) return;
    undoHistory = { ...undoHistory, [selectedDevice]: [...(undoHistory[selectedDevice] ?? []), { ...edits }] };
    drafts = { ...drafts, [selectedDevice]: history.at(-1)! };
    redoHistory = { ...redoHistory, [selectedDevice]: history.slice(0, -1) };
  }

  function switchDevice() {
    comparison = null;
    diffMode = 'draft';
    notice = null;
  }

  function valuesInSection(source: ProfileEntries, section: string): ProfileEntries {
    return Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith(`${section}.`)).map(([key, value]) => [key.slice(section.length + 1), value]));
  }

  function reportError(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    notice = { message: error instanceof Error ? error.message : String(error), error: true };
  }

  async function handleDeploy() {
    if (!window.confirm('Replace the game PROFSAVE_profile with this draft? Close Battlefield 6 first so it does not overwrite your settings.')) return;
    busy = 'deploy';
    try {
      const result = await deployProfile(profileText);
      notice = { message: result.path ? `Written to ${result.path}` : 'PROFSAVE_profile downloaded.', error: false };
    } catch (error) { reportError(error); }
    finally { busy = null; }
  }

  async function handleImport() {
    busy = 'import';
    try {
      const text = await pickProfileFile();
      comparison = { id: ++comparisonId, label: 'Imported profile', kind: 'import', entries: parseImportedProfile(text) };
      diffMode = 'comparison';
      activePanel = 'changes';
      notice = null;
    } catch (error) { reportError(error); }
    finally { busy = null; }
  }

  function previewRecommendation(recommendation: Recommendation) {
    comparison = { id: ++comparisonId, label: recommendation.title, kind: 'preset', patch: recommendationEdits(recommendation, entries) };
    diffMode = 'comparison';
    activePanel = 'changes';
  }

  function applySelection(changes: ProfileChange[]) {
    const patch = diffMode === 'draft' ? Object.fromEntries(changes.map((change) => [change.key, change.before])) : changesToEdits(changes);
    const removals = Object.values(patch).filter((value) => value === null).length;
    if (removals && !window.confirm(`Remove ${removals} selected ${removals === 1 ? 'setting' : 'settings'} from this draft?`)) return;
    stage(patch);
    notice = { message: `${diffMode === 'draft' ? 'Reverted' : 'Applied'} ${changes.length} changes in the ${selectedDevice} draft.`, error: false };
  }
</script>

<svelte:head><meta name="description" content="Battlefield 6 profile editor with device presets, community settings and profile comparisons." /></svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand"><Shield size={25} strokeWidth={1.5} /><div><strong>BATTLEFIELD 6</strong><span>CONFIGURATOR</span></div></div>
    <a class="game-art" href="https://store.steampowered.com/app/2807960/Battlefield_6/" target="_blank" rel="noopener noreferrer" title="Battlefield 6 on Steam"><img src={gameImage} alt="Battlefield 6" width="460" height="215" /></a>
    <div class="profile-picker"><label for="device">ACTIVE PROFILE</label><select id="device" aria-label="Device profile" bind:value={selectedDevice} onchange={switchDevice} disabled={!!busy || !ready}><option value="base">Base only</option>{#each deviceNames as name}<option value={name}>{humanize(name)}</option>{/each}</select></div>
    <nav aria-label="Configuration sections">
      <div class="nav-label">SETTINGS</div>
      {#each sections as section}
        {@const Icon = sectionIcons[section] ?? SlidersHorizontal}
        <button class:active={activePanel === section} aria-current={activePanel === section ? 'page' : undefined} onclick={() => activePanel = section}><Icon size={17} /><span>{sectionNames[section] ?? humanize(section)}</span><small>{Object.keys(valuesInSection(entries, section)).length}</small></button>
      {/each}
      <div class="nav-label tools-label">WORKSPACE</div>
      <button class:active={activePanel === 'recommendations'} aria-current={activePanel === 'recommendations' ? 'page' : undefined} onclick={() => activePanel = 'recommendations'}><Users size={17} /><span>Community guides</span></button>
      <button class:active={activePanel === 'changes'} aria-current={activePanel === 'changes' ? 'page' : undefined} onclick={() => { activePanel = 'changes'; diffMode = comparison ? 'comparison' : 'draft'; }}><GitCompareArrows size={17} /><span>Changes</span><small class:has-changes={draftChanges.length > 0}>{draftChanges.length}</small></button>
    </nav>
    <div class="sidebar-bottom"><span class="connection-dot"></span><span>{isTauri() ? 'Desktop workspace' : 'Browser workspace'}</span><span class="version">v0.2</span></div>
  </aside>

  <div class="workspace">
    <header class="topbar">
      <div class="workspace-title"><span class="workspace-dot"></span><strong>Profile workspace</strong><span class="profile-breadcrumb">/ {selectedDevice}</span></div>
      <div class="topbar-actions">
        <button onclick={handleImport} disabled={!!busy || !ready}><Upload size={15} />{busy === 'import' ? 'Opening...' : 'Import profile'}</button>
        {#if canDeploy}<button onclick={handleDeploy} disabled={!!busy || !ready}><HardDrive size={15} />{busy === 'deploy' ? 'Writing...' : 'Deploy to game'}</button>{/if}
        <button class="primary" onclick={() => { downloadText('PROFSAVE_profile', profileText); notice = { message: 'PROFSAVE_profile exported from the current draft.', error: false }; }} disabled={!ready}><Download size={15} />Export profile</button>
      </div>
    </header>

    <main>
      {#if notice}<div class="notice" class:error={notice.error} role={notice.error ? 'alert' : 'status'}>{#if notice.error}<AlertCircle size={17} />{:else}<CheckCircle2 size={17} />{/if}<span>{notice.message}</span><button class="icon-button" aria-label="Dismiss message" title="Dismiss" onclick={() => notice = null}><X size={15} /></button></div>{/if}

      <div class="page-heading">
        <div><div class="eyebrow">{selectedDevice === 'base' ? 'BASE CONFIGURATION' : `${humanize(selectedDevice).toUpperCase()} / DEVICE PROFILE`}</div><h1>{pageTitle}</h1></div>
        <div class="edit-actions"><span class="edit-count" class:dirty={draftChanges.length > 0}>{draftChanges.length} local edits</span><div class="history-actions"><button class="icon-button" aria-label="Undo edit" title="Undo edit" disabled={!undoHistory[selectedDevice]?.length} onclick={undo}><Undo2 size={16} /></button><button class="icon-button" aria-label="Redo edit" title="Redo edit" disabled={!redoHistory[selectedDevice]?.length} onclick={redo}><Redo2 size={16} /></button><button class="icon-button" aria-label="Reset profile edits" title="Reset profile edits" disabled={!draftChanges.length} onclick={() => { if (window.confirm(`Reset all ${draftChanges.length} local edits for ${selectedDevice}?`)) saveEdits({}); }}><RotateCcw size={16} /></button></div></div>
      </div>

      {#if activePanel === 'recommendations'}
        <Recommendations {entries} onpreview={previewRecommendation} />
      {:else if activePanel === 'changes'}
        <div class="comparison-picker"><label for="comparison">Comparison</label><select id="comparison" aria-label="Comparison" bind:value={diffMode}><option value="draft">Source config / Local draft</option>{#if comparison}<option value="comparison">Local draft / {comparison.label}</option>{/if}</select></div>
        {#key `${selectedDevice}-${diffMode}-${comparison?.id ?? 0}`}
          <DiffView changes={displayedChanges} beforeLabel={diffMode === 'draft' ? 'Source config' : 'Current draft'} afterLabel={diffMode === 'draft' ? 'Local draft' : comparison?.label ?? 'Imported profile'} actionLabel={diffMode === 'draft' ? 'Revert selected' : 'Apply selected'} onapply={applySelection} />
        {/key}
      {:else}
        {#key `${selectedDevice}-${activePanel}`}
          <SectionView name={activePanel} values={valuesInSection(entries, activePanel)} baseline={valuesInSection(baseline, activePanel)} {overrideKeys} {editKeys} onvaluechange={changeValue} onreset={(key) => stage({ [key]: baseline[key] ?? null })} />
        {/key}
      {/if}
    </main>

    <footer><span><span class="save-dot" class:warning={storageState === 'Session only'}></span>{storageState}</span><span><code>PROFSAVE_profile</code><span class="footer-count">{Object.keys(entries).length} keys</span></span></footer>
  </div>
</div>

<style>
  .app-shell { display: grid; grid-template-columns: 230px minmax(0, 1fr); min-height: 100vh; }
  .sidebar { background: #242d28; color: #e2e8e2; padding: 28px 18px 20px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .brand { display: flex; gap: 10px; align-items: center; padding: 0 6px; }
  .brand > :global(svg) { color: #cce88d; flex-shrink: 0; }
  .brand strong { font-family: var(--display); font-size: 24px; line-height: 1; font-weight: 600; display: block; }
  .brand span { display: block; font-family: var(--mono); font-size: 9px; color: #a7b3a9; margin-top: 6px; }
  .game-art { display: block; margin: 28px 0 24px; background: #151a16; overflow: hidden; border-radius: 3px; }
  .game-art img { display: block; width: 100%; height: auto; aspect-ratio: 460 / 215; object-fit: cover; }
  .profile-picker label { display: block; font-size: 9px; font-weight: 500; color: #a7b3a9; margin-bottom: 9px; }
  .profile-picker select { width: 100%; background: #303c33; color: #e2e8e2; border-color: #4a594d; text-transform: capitalize; }
  nav { padding-top: 28px; }
  .nav-label { font-family: var(--mono); font-size: 9px; color: #97a69b; padding: 0 10px; margin-bottom: 10px; }
  nav button { width: 100%; background: transparent; color: #bac6bc; border: 0; border-radius: 4px; justify-content: flex-start; gap: 10px; padding: 12px 10px; font-size: 12px; margin-bottom: 3px; text-align: left; }
  nav button:hover { color: white; background: #344238; }
  nav button.active { background: #d7ed9f; color: #243323; }
  nav button > span { flex: 1; min-width: 0; }
  nav small { font-family: var(--mono); font-size: 9px; opacity: 0.8; }
  nav .has-changes { background: #cad991; color: #253822; border-radius: 3px; padding: 2px 5px; }
  .tools-label { margin-top: 28px; }
  .sidebar-bottom { margin-top: auto; padding: 32px 6px 0; display: flex; align-items: center; gap: 7px; color: #a9b5ad; font-size: 9px; }
  .connection-dot { width: 5px; height: 5px; border-radius: 50%; background: #cce88d; flex-shrink: 0; }
  .version { margin-left: auto; font-family: var(--mono); }
  .workspace { min-width: 0; display: flex; flex-direction: column; background-image: linear-gradient(90deg, #cdd6cc1c 1px, transparent 1px); background-size: 40px 40px; }
  .topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 32px; border-bottom: 1px solid var(--border); background: #ffffffc9; }
  .workspace-title { display: flex; gap: 9px; align-items: center; font-size: 11px; }
  .workspace-title strong { font-weight: 500; }
  .workspace-dot { width: 7px; height: 7px; background: var(--accent); border-radius: 1px; }
  .profile-breadcrumb { color: var(--muted); }
  .topbar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  main { width: 100%; max-width: 1420px; margin: 0 auto; padding: 34px 40px 40px; flex: 1; }
  .page-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 32px; }
  .eyebrow { font-family: var(--mono); font-size: 9px; color: var(--muted); margin-bottom: 8px; }
  h1 { font-family: var(--display); font-size: 40px; line-height: 1.05; font-weight: 600; margin: 0; }
  .edit-actions { display: flex; align-items: center; gap: 16px; }
  .edit-count { font-family: var(--mono); color: var(--muted); font-size: 10px; }
  .edit-count.dirty { color: var(--ochre); }
  .history-actions { display: flex; gap: 3px; }
  .history-actions button { background: transparent; }
  .notice { display: flex; gap: 10px; align-items: center; border: 1px solid #b8cdbb; background: #eaf3ea; border-radius: 4px; padding: 10px 14px; margin-bottom: 24px; font-size: 12px; }
  .notice > :global(svg) { flex-shrink: 0; }
  .notice > span { flex: 1; overflow-wrap: anywhere; }
  .notice > button { border: none; background: transparent; }
  .notice.error { border-color: #e4bbb0; background: #fcf0ea; color: #8e3c2c; }
  .comparison-picker { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 24px; }
  .comparison-picker label { color: var(--muted); font-size: 12px; }
  .comparison-picker select { min-width: 240px; max-width: 100%; }
  footer { margin-top: auto; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border); padding: 15px 32px; font-size: 10px; color: var(--muted); background: #ffffff80; }
  footer > span { display: flex; align-items: center; gap: 9px; }
  .footer-count { padding-left: 8px; border-left: 1px solid var(--border); }
  .save-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
  .save-dot.warning { background: var(--ochre); }
  @media (min-width: 1600px) { main { padding-left: 56px; padding-right: 56px; } }
  @media (max-width: 1100px) { .topbar { padding: 20px 24px; } main { padding: 28px 24px; } .profile-breadcrumb { display: none; } }
  @media (max-width: 850px) {
    .app-shell { grid-template-columns: minmax(0, 1fr); }
    .sidebar { position: static; height: auto; padding: 18px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(130px, 190px); gap: 18px; overflow: visible; }
    .brand { padding: 0; }
    .brand strong { font-size: 22px; }
    .brand > :global(svg) { display: none; }
    .game-art, .sidebar-bottom, .nav-label { display: none; }
    .profile-picker { min-width: 0; }
    .profile-picker label { margin-bottom: 5px; }
    nav { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; padding: 0; }
    nav button { width: auto; flex: 1 0 auto; min-width: 0; padding: 9px 10px; font-size: 11px; margin: 0; }
    nav small { display: none; }
    .topbar { padding: 16px 20px; }
    .topbar-actions { width: 100%; }
    .topbar-actions button { flex: 1 1 auto; }
    main { padding: 26px 20px; }
    h1 { font-size: 34px; }
    .page-heading { margin-bottom: 26px; }
    footer { padding: 16px 20px; }
  }
  @media (max-width: 430px) {
    .sidebar { gap: 16px 10px; }
    .brand strong { font-size: 20px; }
    nav button { flex-basis: calc(50% - 4px); }
    main { padding: 24px 16px; }
    .topbar { padding: 16px; }
    .topbar-actions button { font-size: 11px; padding: 8px 10px; }
    .edit-actions { width: 100%; justify-content: space-between; }
    .comparison-picker select { min-width: 0; width: 100%; }
  }
</style>

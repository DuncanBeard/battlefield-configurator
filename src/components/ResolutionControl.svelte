<script lang="ts">
  import { getResolutionPreset, getSetting, resolutionPresets, sameValue } from '$lib/settings';
  import SettingControl from './SettingControl.svelte';

  let { width, height, defaultWidth, defaultHeight, onchange }: {
    width: string;
    height: string;
    defaultWidth?: string;
    defaultHeight?: string;
    onchange: (width: string, height: string) => void;
  } = $props();

  let custom = $state(false);
  const groups = [...new Set(resolutionPresets.map((preset) => preset.group))];
  const hasDefault = $derived(defaultWidth !== undefined && defaultHeight !== undefined);
  const selected = $derived(custom ? 'custom'
    : hasDefault && sameValue(width, defaultWidth!) && sameValue(height, defaultHeight!) ? 'default'
      : getResolutionPreset(width, height)?.value ?? 'custom');

  function choose(value: string) {
    custom = value === 'custom';
    if (custom) return;
    if (value === 'default' && hasDefault) {
      onchange(defaultWidth!, defaultHeight!);
      return;
    }
    const preset = resolutionPresets.find((preset) => preset.value === value);
    if (preset) onchange(preset.width, preset.height);
  }
</script>

<div class="resolution-control">
  <select id="setting-GstRender.Resolution" aria-label="Resolution preset" value={selected} onchange={(event) => choose(event.currentTarget.value)}>
    {#if hasDefault}<option value="default">Profile default ({Number(defaultWidth)} x {Number(defaultHeight)})</option>{/if}
    {#each groups as group}
      <optgroup label={group}>
        {#each resolutionPresets.filter((preset) => preset.group === group) as preset}<option value={preset.value}>{preset.label}</option>{/each}
      </optgroup>
    {/each}
    <option value="custom">Custom</option>
  </select>
  {#if selected === 'custom'}
    <div class="dimensions">
      <div><label for="setting-GstRender.ResolutionWidth">Width</label><SettingControl settingKey="GstRender.ResolutionWidth" value={width} definition={getSetting('GstRender.ResolutionWidth')} onchange={(value) => onchange(value, height)} /></div>
      <div><label for="setting-GstRender.ResolutionHeight">Height</label><SettingControl settingKey="GstRender.ResolutionHeight" value={height} definition={getSetting('GstRender.ResolutionHeight')} onchange={(value) => onchange(width, value)} /></div>
    </div>
  {/if}
</div>

<style>
  .resolution-control, select { width: 100%; min-width: 0; }
  .dimensions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
  .dimensions > div { min-width: 0; }
  .dimensions label { display: block; color: var(--muted); font-size: 11px; margin-bottom: 5px; }
</style>
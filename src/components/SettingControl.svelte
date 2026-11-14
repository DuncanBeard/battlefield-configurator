<script lang="ts">
  import { colorValue, profileColor, sameValue, validateValue } from '$lib/settings';
  import type { SettingDefinition } from '$lib/settings';

  let { settingKey, value, definition, onchange }: {
    settingKey: string;
    value: string;
    definition: SettingDefinition;
    onchange: (value: string) => void;
  } = $props();

  let error = $state('');
  const controlId = $derived(`setting-${settingKey}`);
  const toggleSupported = $derived(['0', '1'].some((option) => sameValue(option, value)));
  const selectedOption = $derived(definition.options?.find((option) => sameValue(option.value, value))?.value ?? value);

  function commit(next: string) {
    error = validateValue(definition, next) ?? '';
    if (!error) onchange(next);
  }
</script>

<div class="setting-control">
  {#if definition.readonly}
    <code class="managed-value">{value}</code>
  {:else if definition.kind === 'select' || (definition.kind === 'toggle' && !toggleSupported)}
    {@const choices = definition.options ?? [{ value: '0', label: 'Off' }, { value: '1', label: 'On' }]}
    <select id={controlId} aria-label={definition.label} value={selectedOption} onchange={(event) => commit(event.currentTarget.value)}>
      {#if !choices.some((option) => sameValue(option.value, value))}
        <option value={value}>Custom value: {value || '(empty)'}</option>
      {/if}
      {#each choices as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if definition.kind === 'toggle'}
    <div class="toggle-control">
      <span class="toggle-value">{Number(value) === 1 ? 'On' : 'Off'}</span>
      <input id={controlId} aria-label={definition.label} class="switch" type="checkbox" role="switch" checked={Number(value) === 1} onchange={(event) => commit(event.currentTarget.checked ? '1' : '0')} />
    </div>
  {:else if definition.kind === 'color'}
    <div class="color-control">
      <input id={controlId} aria-label={definition.label} type="color" value={profileColor(value)} oninput={(event) => commit(colorValue(event.currentTarget.value, value))} />
      <code>{profileColor(value)}</code>
    </div>
  {:else if definition.kind === 'range'}
    <div class="range-control">
      <input id={controlId} aria-label={definition.label} type="range" min={definition.min} max={definition.max} step={definition.step} value={Number(value)} oninput={(event) => commit(event.currentTarget.value)} />
      <input class="number-value" aria-label={`${definition.label} value`} type="number" min={definition.min} max={definition.max} step="any" value={Number(value)} aria-invalid={!!error} onchange={(event) => commit(event.currentTarget.value)} />
      {#if definition.unit}<span class="unit">{definition.unit}</span>{/if}
    </div>
  {:else if definition.kind === 'number'}
    <div class="number-control">
      <input id={controlId} aria-label={definition.label} type="number" min={definition.min} max={definition.max} step="any" value={value} aria-invalid={!!error} onchange={(event) => commit(event.currentTarget.value)} />
      {#if definition.unit}<span class="unit">{definition.unit}</span>{/if}
    </div>
  {:else}
    <input id={controlId} aria-label={definition.label} type="text" value={value} aria-invalid={!!error} onchange={(event) => commit(event.currentTarget.value)} />
  {/if}
  {#if error}<span class="field-error" role="alert">{error}</span>{/if}
</div>

<style>
  .setting-control { min-width: 0; width: 100%; }
  select, input[type='text'] { width: 100%; }
  .toggle-control, .color-control, .range-control, .number-control { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-height: 38px; }
  .toggle-value { font-size: 13px; color: var(--muted); }
  .switch { appearance: none; width: 38px; height: 22px; border: 0; border-radius: 12px; background: #b6c1ba; padding: 3px; cursor: pointer; flex: 0 0 38px; }
  .switch::before { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 120ms; }
  .switch:checked { background: var(--accent); }
  .switch:checked::before { transform: translateX(16px); }
  input[type='range'] { min-width: 40px; width: 100%; padding: 0; border: 0; accent-color: var(--accent); cursor: pointer; }
  input[type='number'] { width: 100%; min-width: 0; font-family: var(--mono); font-size: 12px; text-align: right; }
  .range-control .number-value { flex: 0 0 76px; width: 76px; }
  .unit { font-size: 11px; color: var(--muted); min-width: 20px; }
  input[type='color'] { width: 42px; height: 34px; padding: 3px; cursor: pointer; }
  .color-control code { font-size: 12px; min-width: 70px; }
  .managed-value { display: block; font-size: 11px; text-align: right; overflow-wrap: anywhere; color: var(--muted); }
  .field-error { display: block; font-size: 12px; color: var(--red); margin-top: 5px; }
</style>
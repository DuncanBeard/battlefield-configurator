<script lang="ts">
  import { ArrowRight, Check, Crosshair, ExternalLink, Gauge, Info, Zap } from 'lucide-svelte';
  import { recommendations, recommendationEdits } from '$lib/recommendations';
  import type { Recommendation } from '$lib/recommendations';
  import type { ProfileEntries } from '$lib/types';
  import { displayValue, getSetting } from '$lib/settings';

  let { entries, onpreview }: { entries: ProfileEntries; onpreview: (recommendation: Recommendation) => void } = $props();
  let rtxConfirmed = $state(false);
  const icons = [Crosshair, Gauge, Zap];
</script>

<div class="provenance"><Info size={17} /><p>Curated from published community guides, not live rankings. These launch-era recommendations are starting points, not a universal best. Hardware, drivers and game updates can change the results.</p></div>

<div class="recommendations">
  {#each recommendations as recommendation, index}
    {@const Icon = icons[index]}
    {@const count = Object.keys(recommendationEdits(recommendation, entries)).length}
    <article data-recommendation={recommendation.id}>
      <div class="preset-heading"><Icon size={22} /><span>{recommendation.focus}</span><span class="preset-number">0{index + 1}</span></div>
      <h2>{recommendation.title}</h2>
      <span class="badge">{recommendation.hardware}</span>
      <p class="summary">{recommendation.summary}</p>
      <p class="tradeoff">{recommendation.tradeoff}</p>
      <details>
        <summary>{Object.keys(recommendation.values).length} suggested settings</summary>
        <dl>{#each Object.entries(recommendation.values) as [key, value]}<div><dt>{getSetting(key).label}</dt><dd>{displayValue(key, value)}</dd></div>{/each}</dl>
      </details>
      {#if recommendation.requiresRtx}<label class="check-label hardware-confirmation"><input type="checkbox" bind:checked={rtxConfirmed} />This device has an NVIDIA RTX GPU</label>{/if}
      <div class="preset-source">
        <a href={recommendation.source.url} target="_blank" rel="noopener noreferrer">{recommendation.source.publisher} guide<ExternalLink size={12} /></a>
        <span>{recommendation.source.author} / <time datetime={recommendation.source.published}>10 Oct 2025</time></span>
      </div>
      <div class="preset-action">
        <span>{count ? `${count} changes` : 'Already matched'}</span>
        <button disabled={!count || (recommendation.requiresRtx && !rtxConfirmed)} onclick={() => onpreview(recommendation)} aria-label={`Review ${recommendation.title}`}>
          {#if count}<ArrowRight size={15} />Review changes{:else}<Check size={15} />Matched{/if}
        </button>
      </div>
    </article>
  {/each}
</div>

<div class="recommendation-note"><span>UNCHANGED</span><p>Resolution, refresh rate, frame caps, field of view, sensitivity and keybindings remain personal to your setup. Presets only propose keys already present in your profile.</p></div>

<style>
  .provenance { display: flex; gap: 12px; align-items: flex-start; padding: 0 0 28px; color: var(--muted); }
  .provenance > :global(svg) { flex-shrink: 0; margin-top: 2px; }
  .provenance p { font-size: 13px; line-height: 1.7; margin: 0; max-width: 780px; }
  .recommendations { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: start; }
  article { border: 1px solid var(--border); border-radius: 6px; padding: 22px; background: var(--surface); min-width: 0; }
  .preset-heading { display: flex; gap: 9px; align-items: center; font-size: 10px; text-transform: uppercase; color: var(--accent); }
  .preset-number { margin-left: auto; color: var(--muted); font-family: var(--mono); }
  h2 { font-family: var(--display); font-size: 28px; line-height: 1.1; font-weight: 600; margin: 22px 0 12px; }
  .summary { font-size: 13px; line-height: 1.7; margin: 20px 0 12px; }
  .tradeoff { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 0 0 20px; }
  details { border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); padding: 13px 0; font-size: 11px; }
  summary { cursor: pointer; font-weight: 500; }
  dl { margin-bottom: 0; }
  dl > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(50px, 0.7fr); gap: 10px; margin: 10px 0; }
  dt, dd { overflow-wrap: anywhere; }
  dd { margin: 0; text-align: right; color: var(--accent); }
  .hardware-confirmation { font-size: 11px; line-height: 1.5; margin-top: 16px; align-items: flex-start; }
  .hardware-confirmation input { margin-top: 2px; }
  .preset-source { margin-top: 20px; }
  .preset-source a { display: inline-flex; gap: 6px; align-items: center; font-size: 11px; }
  .preset-source > span { display: block; margin-top: 5px; font-size: 10px; color: var(--muted); }
  .preset-action { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
  .preset-action > span { font-family: var(--mono); font-size: 10px; color: var(--muted); }
  .preset-action button { font-size: 11px; padding: 8px 10px; }
  .recommendation-note { display: flex; gap: 25px; padding: 28px 0; margin-top: 24px; border-top: 1px solid var(--border); align-items: baseline; }
  .recommendation-note > span { font-size: 10px; font-family: var(--mono); color: var(--muted); }
  .recommendation-note p { font-size: 12px; line-height: 1.7; max-width: 750px; color: var(--muted); margin: 0; }
  @media (max-width: 1200px) { .recommendations { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .recommendations { grid-template-columns: minmax(0, 1fr); } .recommendation-note { flex-direction: column; gap: 10px; } }
</style>
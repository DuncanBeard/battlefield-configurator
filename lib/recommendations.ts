import type { ProfileEntries } from './types';
import type { ProfileEdits } from './editor';
import { getSetting, sameValue } from './settings';

export interface Recommendation {
  id: string;
  title: string;
  focus: string;
  summary: string;
  tradeoff: string;
  hardware: string;
  requiresRtx?: boolean;
  values: ProfileEntries;
  source: { publisher: string; author: string; title: string; url: string; published: string };
}

const source = {
  publisher: 'GameSpot',
  author: 'Joey Carr',
  title: 'Best PC Graphics Settings in Battlefield 6',
  url: 'https://www.gamespot.com/articles/best-pc-graphics-settings-in-battlefield-6/1100-6533746/',
  published: '2025-10-10',
};

export const recommendations: Recommendation[] = [
  {
    id: 'clarity',
    title: 'Clear sightlines',
    focus: 'Visibility',
    summary: 'Remove motion smearing, grain and edge effects while keeping your existing quality settings.',
    tradeoff: 'A cleaner image, with less cinematic post-processing. No FPS gain is promised.',
    hardware: 'Any GPU',
    values: {
      'GstRender.MotionBlurWorld': '0',
      'GstRender.MotionBlurWeapon': '0',
      'GstRender.FilmGrain': '0',
      'GstRender.ChromaticAberration': '0',
      'GstRender.Vignette': '0',
    },
    source,
  },
  {
    id: 'competitive',
    title: 'Competitive baseline',
    focus: 'Performance',
    summary: 'High textures and filtering, with low shadows, terrain, effects and reflections.',
    tradeoff: 'Less scenery detail and lighting depth. High textures still need sufficient VRAM.',
    hardware: 'Any GPU',
    values: {
      'GstRender.TextureQuality': '2',
      'GstRender.TextureFiltering': '2',
      'GstRender.MeshQuality': '0',
      'GstRender.TerrainQuality': '0',
      'GstRender.UndergrowthQuality': '0',
      'GstRender.SunShadowQuality': '0',
      'GstRender.LocalLightShadowQuality': '0',
      'GstRender.LightingQuality': '0',
      'GstRender.VolumetricQuality': '0',
      'GstRender.EffectsQuality': '0',
      'GstRender.ReflectionQuality': '0',
      'GstRender.ScreenSpaceReflections': '0',
      'GstRender.PostProcessQuality': '0',
      'GstRender.AmbientOcclusion': '0',
      'GstRender.MotionBlurWorld': '0',
      'GstRender.MotionBlurWeapon': '0',
      'GstRender.FilmGrain': '0',
      'GstRender.ChromaticAberration': '0',
      'GstRender.Vignette': '0',
    },
    source,
  },
  {
    id: 'rtx',
    title: 'RTX responsiveness',
    focus: 'Latency',
    summary: 'DLSS Quality and Reflex On, without frame generation or future frame rendering.',
    tradeoff: 'A lower internal resolution can soften fine detail. Disabling frame generation lowers displayed FPS.',
    hardware: 'NVIDIA RTX only',
    requiresRtx: true,
    values: {
      'GstRender.NvidiaAntiAliasing': '1',
      'GstRender.AMDNvidiaUpscalingQuality': '3',
      'GstRender.NvidiaLowLatency': '1',
      'GstRender.NVIDIAFrameGenerationEnabled': '0',
      'GstRender.FrameGeneration': '0',
      'GstRender.FutureFrameRendering': '0',
    },
    source,
  },
];

export function recommendationEdits(recommendation: Recommendation, entries: ProfileEntries): ProfileEdits {
  return Object.fromEntries(Object.entries(recommendation.values).filter(([key, value]) =>
    Object.hasOwn(entries, key) && !getSetting(key).readonly && !sameValue(entries[key], value)
  ));
}
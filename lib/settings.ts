export interface SettingOption {
  value: string;
  label: string;
}

export interface ResolutionPreset extends SettingOption {
  width: string;
  height: string;
  group: string;
}

export interface SettingDefinition {
  label: string;
  group: string;
  kind: 'select' | 'toggle' | 'range' | 'number' | 'text' | 'color';
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
  display?: { scale?: number; unit?: string; zeroLabel?: string };
  note?: string;
  advanced?: boolean;
  readonly?: boolean;
}

export const sectionNames: Record<string, string> = {
  GstRender: 'Graphics & display',
  GstAudio: 'Audio',
  GstInput: 'Mouse & controller',
  GstKeyBinding: 'Keybindings',
};

const options = (...labels: string[]): SettingOption[] => labels.map((label, index) => ({ value: String(index), label }));
const quality = options('Low', 'Medium', 'High', 'Ultra');
const extendedQuality = [...quality, { value: '4', label: 'Insane' }];
const select = (label: string, group: string, choices: SettingOption[], note?: string): SettingDefinition => ({ label, group, kind: 'select', options: choices, note });
const toggle = (label: string, group: string, note?: string): SettingDefinition => ({ label, group, kind: 'toggle', note });
const number = (label: string, group: string, min?: number, max?: number, step = 1, unit?: string): SettingDefinition => ({ label, group, kind: 'number', min, max, step, unit });
const range = (label: string, group: string, min: number, max: number, step: number, unit?: string): SettingDefinition => ({ label, group, kind: 'range', min, max, step, unit });
const percentage = (label: string, group: string, min = 0, max = 1): SettingDefinition => ({ ...range(label, group, min, max, 0.01), display: { scale: 100, unit: '%' } });
const frameLimit = (label: string): SettingDefinition => ({ ...number(label, 'Frame rate', 0, 1000, 1, 'FPS'), display: { zeroLabel: 'Uncapped' } });
const displayNumber = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 6 });
const resolution = (width: number, height: number, group: string): ResolutionPreset => ({ value: `${width}x${height}`, label: `${width} x ${height}`, width: String(width), height: String(height), group });

export const resolutionPresets: ResolutionPreset[] = [
  resolution(1280, 720, '16:9'),
  resolution(1366, 768, '16:9'),
  resolution(1600, 900, '16:9'),
  resolution(1920, 1080, '16:9'),
  resolution(2560, 1440, '16:9'),
  resolution(3840, 2160, '16:9'),
  resolution(1280, 800, '16:10'),
  resolution(1440, 900, '16:10'),
  resolution(1680, 1050, '16:10'),
  resolution(1920, 1200, '16:10'),
  resolution(2560, 1600, '16:10'),
  resolution(2560, 1080, 'Ultrawide'),
  resolution(3440, 1440, 'Ultrawide'),
  resolution(3840, 1600, 'Ultrawide'),
  resolution(3840, 1080, 'Super ultrawide'),
  resolution(5120, 1440, 'Super ultrawide'),
];

export function getResolutionPreset(width: string | undefined, height: string | undefined): ResolutionPreset | undefined {
  if (width === undefined || height === undefined) return undefined;
  return resolutionPresets.find((preset) => sameValue(preset.width, width) && sameValue(preset.height, height));
}

const render: Record<string, SettingDefinition> = {
  ResolutionWidth: { ...number('Resolution width', 'Display', 1, 16384, 1, 'px'), integer: true },
  ResolutionHeight: { ...number('Resolution height', 'Display', 1, 16384, 1, 'px'), integer: true },
  ResolutionHertz: number('Refresh rate', 'Display', 1, 1000, 0.001, 'Hz'),
  FullscreenRefreshRate: number('Fullscreen refresh rate', 'Display', 1, 1000, 0.001, 'Hz'),
  FullscreenScreen: number('Monitor index', 'Display', 0, undefined),
  FullscreenEnabled: toggle('Fullscreen', 'Display'),
  FullscreenMode: select('Window mode', 'Display', options('Borderless', 'Exclusive fullscreen')),
  WindowBordersEnable: toggle('Window borders', 'Display'),
  HighDynamicRangeMode: select('Dynamic range', 'Display', options('SDR', 'HDR'), 'HDR requires a compatible display and Windows HDR enabled.'),
  Brightness: percentage('Brightness', 'Display'),
  Contrast: percentage('Contrast', 'Display'),
  FrameRateLimiterEnable: toggle('Gameplay FPS limiter', 'Frame rate'),
  FrameRateLimit: frameLimit('Gameplay FPS limit'),
  FrameRateLimiterMenuEnable: toggle('Menu FPS limiter', 'Frame rate'),
  FrameRateLimitMenu: frameLimit('Menu FPS limit'),
  FrameRateLimiterTabbedOutEnable: toggle('Background FPS limiter', 'Frame rate'),
  FrameRateLimitTabbedOut: frameLimit('Background FPS limit'),
  VSyncMode: select('Vertical sync', 'Frame rate', options('Off', 'On', 'Adaptive')),
  FutureFrameRendering: toggle('Future frame rendering', 'Frame rate', 'A longer render queue can improve throughput at the cost of latency.'),
  NvidiaLowLatency: select('NVIDIA Reflex', 'Frame rate', options('Off', 'On', 'On + Boost'), 'NVIDIA only. Boost can increase power use and heat.'),
  AMDLowLatency: toggle('AMD low latency', 'Frame rate'),
  IntelLowLatency: toggle('Intel low latency', 'Frame rate'),
  NvidiaAntiAliasing: select('NVIDIA anti-aliasing', 'Upscaling', options('TAA', 'DLSS', 'DLAA'), 'DLSS and DLAA require a supported NVIDIA GPU.'),
  NvidiaDLSSModel: select('DLSS model', 'Upscaling', options('CNN', 'Transformer')),
  NvidiaDLAAModel: select('DLAA model', 'Upscaling', options('CNN', 'Transformer')),
  AMDIntelAntiAliasing: select('AMD / Intel anti-aliasing', 'Upscaling', options('TAA', 'FSR', 'XeSS')),
  AMDNvidiaUpscalingQuality: select('Upscaling quality', 'Upscaling', options('Ultra performance', 'Performance', 'Balanced', 'Quality', 'Ultra quality')),
  ResolutionScale: percentage('Render resolution scale', 'Upscaling', 0.5, 2),
  FixedResolutionScale: range('Fixed resolution scale', 'Upscaling', 25, 200, 1, '%'),
  DRSEnabled: toggle('Dynamic resolution', 'Upscaling'),
  DRSFrameRateTarget: number('Dynamic resolution target', 'Upscaling', 1, 1000, 1, 'FPS'),
  DRSMinimumResolutionScale: range('Minimum dynamic resolution', 'Upscaling', 25, 100, 1, '%'),
  FrameGeneration: toggle('Frame generation', 'Upscaling', 'Generated frames do not improve input response and can add latency.'),
  NVIDIAFrameGenerationEnabled: toggle('NVIDIA frame generation', 'Upscaling'),
  AMDFrameGenerationEnabled: toggle('AMD frame generation', 'Upscaling'),
  IntelFrameGenerationEnabled: toggle('Intel frame generation', 'Upscaling'),
  TextureQuality: select('Texture quality', 'Quality', quality, 'Higher texture quality needs more VRAM.'),
  TextureFiltering: select('Texture filtering', 'Quality', quality),
  MeshQuality: select('Mesh quality', 'Quality', extendedQuality),
  TerrainQuality: select('Terrain quality', 'Quality', quality),
  UndergrowthQuality: select('Undergrowth quality', 'Quality', quality),
  SunShadowQuality: select('Sun shadows', 'Quality', extendedQuality),
  ShadowQuality: select('Shadow quality', 'Quality', quality),
  LocalLightShadowQuality: select('Local light shadows', 'Quality', quality),
  LightingQuality: select('Lighting quality', 'Quality', quality),
  VolumetricQuality: select('Volumetric quality', 'Quality', quality),
  ReflectionQuality: select('Reflections', 'Quality', quality),
  EffectsQuality: select('Effects quality', 'Quality', quality),
  PostProcessQuality: select('Post-processing quality', 'Quality', quality),
  ScreenSpaceReflections: toggle('Screen-space reflections', 'Quality'),
  AmbientOcclusion: select('Ambient occlusion', 'Quality', options('Off', 'SSAO', 'HBAO', 'HDAO', 'HBAO+')),
  MotionBlurWorld: percentage('World motion blur', 'Camera'),
  MotionBlurWeapon: percentage('Weapon motion blur', 'Camera'),
  FilmGrain: toggle('Film grain', 'Camera'),
  ChromaticAberration: toggle('Chromatic aberration', 'Camera'),
  Vignette: toggle('Vignette', 'Camera'),
  LensDistortion: toggle('Lens distortion', 'Camera'),
  WeaponDOF: toggle('Weapon depth of field', 'Camera'),
  FieldOfViewVertical: number('Vertical field of view', 'Camera', 1, 120, 1, 'deg'),
  FieldOfViewVerticalVehicle: number('Vehicle vertical FOV', 'Camera', 1, 120, 1, 'deg'),
  FieldOfViewScaleADS: toggle('ADS field-of-view scaling', 'Camera'),
  SharpnessSlider: percentage('Sharpness', 'Camera'),
  UIBrightness: percentage('Interface brightness', 'HUD'),
  OptionHudBackgroundOpacity: percentage('HUD background opacity', 'HUD'),
  PerformanceOverlay: toggle('Performance overlay', 'HUD'),
  SubtitleBackgroundAlpha: percentage('Subtitle background opacity', 'HUD'),
  SubtitleTextAlpha: percentage('Subtitle text opacity', 'HUD'),
  SubtitleUseOutline: toggle('Subtitle outlines', 'HUD'),
};

const audio: Record<string, SettingDefinition> = {
  '3dEnabled': toggle('Spatial audio', 'Output'),
  YourSoundSystem: select('Sound system', 'Output', options('Stereo speakers', 'Headphones', '5.1 surround', '7.1 surround')),
  AudioQuality: select('Audio quality', 'Output', quality),
  StereoBalance: range('Stereo balance', 'Output', -1, 1, 0.01),
  Volume: percentage('Master volume', 'Mixer'),
  Volume_Music: percentage('Music volume', 'Mixer'),
  Volume_MusicInMenus: percentage('Menu music volume', 'Mixer'),
  Volume_SFX: percentage('Effects volume', 'Mixer'),
  Volume_UI: percentage('Interface volume', 'Mixer'),
  Volume_VO: percentage('Voice-over volume', 'Mixer'),
  Volume_Tinnitus: percentage('Tinnitus effect volume', 'Mixer'),
  VoipOn: toggle('Voice chat', 'Voice chat'),
  VoipMode: select('Microphone mode', 'Voice chat', [{ value: '1', label: 'Push to talk' }, { value: '2', label: 'Open mic' }]),
  VOIPVolume: percentage('Voice chat volume', 'Voice chat'),
  MicrophoneVolume: percentage('Microphone gain', 'Voice chat'),
  OpenMicThreshold: percentage('Open mic threshold', 'Voice chat'),
  VoipAutoLevel: toggle('Automatic mic level', 'Voice chat'),
  STTEnabled: toggle('Speech to text', 'Accessibility'),
  TTSEnabled: toggle('Text to speech', 'Accessibility'),
  MenuNarration: toggle('Menu narration', 'Accessibility'),
  PlaySoundInBackground_OnOff: toggle('Play audio in background', 'Output'),
};

const input: Record<string, SettingDefinition> = {
  MouseRawInput: toggle('Raw mouse input', 'Mouse'),
  MouseSensitivity: number('Mouse sensitivity', 'Mouse', 0, undefined, 0.001),
  MouseSensitivityVehicle: number('Vehicle mouse sensitivity', 'Mouse', 0, undefined, 0.001),
  FreelookSensitivity: number('Freelook sensitivity', 'Mouse', 0, undefined, 0.01),
  UniformSoldierAiming: toggle('Uniform soldier aiming', 'Aiming'),
  UniformSoldierAimingCoefficient: number('Soldier aiming coefficient', 'Aiming', 0, undefined, 0.01),
  UniformVehicleAiming: toggle('Uniform vehicle aiming', 'Aiming'),
  UniformVehicleAimingCoefficient: number('Vehicle aiming coefficient', 'Aiming', 0, undefined, 0.01),
  HoldButtonToZoom: select('Aim down sights', 'Movement', options('Toggle', 'Hold')),
  HoldButtonToZoomVehicle: select('Vehicle aim down sights', 'Movement', options('Toggle', 'Hold')),
  SprintHold: select('Sprint behavior', 'Movement', options('Toggle', 'Hold')),
  LeanHold: select('Lean behavior', 'Movement', options('Toggle', 'Hold')),
  HoldForBreathControl: toggle('Hold for breath control', 'Movement'),
  SprintDoubleTap: toggle('Double-tap to sprint', 'Movement'),
  SprintDoorBarge: toggle('Sprint through doors', 'Movement'),
  SprintVaultOver: toggle('Auto-vault while sprinting', 'Movement'),
  QuickThrowGrenade: toggle('Quick throw grenade', 'Movement'),
  Vibration: toggle('Controller vibration', 'Controller'),
  VibrationIntensity: percentage('Vibration intensity', 'Controller'),
  GyroDisabled: toggle('Disable gyro', 'Controller'),
};

const definitions: Record<string, Record<string, SettingDefinition>> = { GstRender: render, GstAudio: audio, GstInput: input };

export function humanize(value: string): string {
  return value.replace(/[_.-]/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

export function getSetting(key: string, value = ''): SettingDefinition {
  const separator = key.indexOf('.');
  const section = key.slice(0, separator);
  const field = key.slice(separator + 1);
  const defined = definitions[section]?.[field];
  if (defined) return defined;
  const label = humanize(field);
  if (section === 'GstRender' && field.startsWith('ShaderBundleVersion_')) {
    return { label: 'Shader cache ' + field.slice('ShaderBundleVersion_'.length), group: 'Engine managed', kind: 'text', readonly: true, advanced: true };
  }
  if (section === 'GstRender' && field.startsWith('HUD-')) return { label: humanize(field.slice(4)), group: 'HUD colors', kind: 'color' };
  if (section === 'GstAudio' && field.startsWith('Volume_')) return percentage(label, 'Mixer');
  if (section === 'GstAudio' && /^Subtitles(Commander|Enemies|Friendlies|ShowSpeakerName|Squad)$/.test(field)) return toggle(label, 'Accessibility');
  if (section === 'GstInput' && /^Gamepad.*(Deadzone|MaxThreshold)/.test(field)) return percentage(label, 'Controller');
  if (section === 'GstInput' && /^(SoldierZoomSensitivity|VehicleSensitivity|Vertical.*Ratio)/.test(field)) return number(label, 'Aiming', 0, undefined, 0.01);
  if (section === 'GstKeyBinding') {
    const parts = field.split('.');
    const group = humanize(parts[0]);
    const bindingLabel = humanize(parts.slice(1, -2).join('.').replace(/^Concept/, '')) + ` / slot ${parts.at(-2)} / ${parts.at(-1)}`;
    if (field.endsWith('.type')) return select(bindingLabel, group, [{ value: '-1', label: 'Disabled' }, ...options('Mouse', 'Gamepad', 'Keyboard (DIK)', 'Joystick')]);
    if (field.endsWith('.negate')) return toggle(bindingLabel, group);
    return { ...number(bindingLabel, group, -1, undefined), note: 'Raw device code; keyboard bindings use DirectInput scan codes.' };
  }
  return { label, group: 'Advanced', kind: value !== '' && Number.isFinite(Number(value)) ? 'number' : 'text', step: undefined, advanced: true };
}

export function sameValue(left: string, right: string): boolean {
  return left === right || (left.trim() !== '' && right.trim() !== '' && Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left) === Number(right));
}

export function displayValue(key: string, value: string | null): string {
  if (value === null) return 'Not present';
  if (value === '') return 'Empty value';
  const definition = getSetting(key, value);
  if (definition.kind === 'toggle' && ['0', '1'].some((option) => sameValue(option, value))) return Number(value) === 0 ? 'Off' : 'On';
  const option = definition.options?.find((option) => sameValue(option.value, value));
  if (option) return option.label;
  const numeric = Number(value);
  if (value.trim() === '' || !Number.isFinite(numeric)) return value;
  if (definition.kind === 'color' && Number.isInteger(numeric) && numeric >= -2147483648 && numeric <= 4294967295) {
    return '#' + (numeric >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  if (definition.kind !== 'number' && definition.kind !== 'range') return value;
  if (validateValue(definition, value)) return value;
  if (numeric === 0 && definition.display?.zeroLabel) return definition.display.zeroLabel;
  const unit = definition.display?.unit ?? definition.unit;
  if (!unit) return value;
  const formatted = displayNumber.format(numeric * (definition.display?.scale ?? 1));
  return `${formatted}${unit === '%' ? '' : ' '}${unit}`;
}

export function validateValue(definition: SettingDefinition, value: string): string | null {
  if (/[\r\n\0]/.test(value)) return 'A value must fit on one line.';
  if (definition.kind !== 'number' && definition.kind !== 'range') return null;
  const numeric = Number(value);
  if (value.trim() === '' || !Number.isFinite(numeric)) return 'Enter a finite number.';
  if (definition.integer && !Number.isInteger(numeric)) return 'Enter a whole number of pixels.';
  if (definition.min !== undefined && numeric < definition.min) return `Minimum: ${definition.min}`;
  if (definition.max !== undefined && numeric > definition.max) return `Maximum: ${definition.max}`;
  return null;
}

export function profileColor(value: string): string {
  return '#' + ((Number(value) >>> 8) & 0xffffff).toString(16).padStart(6, '0');
}

export function colorValue(color: string, previous: string): string {
  return String((Number.parseInt(color.slice(1), 16) * 256 + (Number(previous) & 0xff)) | 0);
}
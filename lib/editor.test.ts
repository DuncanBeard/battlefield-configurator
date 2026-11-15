import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { combineBase, flatten, emitEntries, emit } from './build';
import { applyEdits, changesToEdits, parseImportedProfile, profileChanges } from './editor';
import { colorValue, displayValue, getResolutionPreset, getSetting, profileColor, resolutionPresets, validateValue } from './settings';
import { recommendationEdits, recommendations } from './recommendations';
import { parse } from './toml-parser';

describe('shared profile editor', () => {
  test('quoted TOML values discard trailing comments but preserve embedded hashes and numeric precision', () => {
    expect(parse('[GstAudio]\nVoipInputDevice = "" # Set in game\nName = "Headset #1" # Output\nVolume = 0.500000 # Half volume\n[GstKeyBinding]\ndefault.Fire.0.button = 1')).toEqual({
      GstAudio: { VoipInputDevice: '', Name: 'Headset #1', Volume: '0.500000' },
      GstKeyBinding: { 'default.Fire.0.button': '1' },
    });
    expect(parse('[GstAudio]\nName = "Headset \\"#1\\"" # Output').GstAudio).toEqual({ Name: 'Headset \\"#1\\"' });
  });

  test('applies changes without modifying the source or losing empty values', () => {
    const source = { 'GstRender.VSyncEnabled': '1', 'GstAudio.Device': '' };
    const result = applyEdits(source, { 'GstRender.VSyncEnabled': '0', 'GstInput.NewSetting': '2' });
    expect(source['GstRender.VSyncEnabled']).toBe('1');
    expect(result).toEqual({ 'GstRender.VSyncEnabled': '0', 'GstAudio.Device': '', 'GstInput.NewSetting': '2' });
  });

  test('selectively applies additions, changes and removals, including dotted keybindings', () => {
    const before = { 'GstInput.Sensitivity': '0.5', 'GstAudio.Device': '', 'GstKeyBinding.infantry.Fire.0.button': '1' };
    const after = { 'GstInput.Sensitivity': '0.8', 'GstKeyBinding.infantry.Fire.0.button': '2', 'GstRender.NewSetting': '1' };
    const changes = profileChanges(before, after);
    expect(changes.find((change) => change.section === 'GstKeyBinding')?.field).toBe('infantry.Fire.0.button');
    expect(changes.find((change) => change.kind === 'removed')?.before).toBe('');
    expect(applyEdits(before, changesToEdits(changes))).toEqual(after);
    expect(applyEdits(before, changesToEdits(changes.filter((change) => change.kind === 'added')))).toEqual({ ...before, 'GstRender.NewSetting': '1' });
  });

  test('edited exports keep the CLI format and round-trip empty values', () => {
    const entries = { 'GstRender.Width': '1920', 'GstAudio.Device': '' };
    expect(emitEntries(entries)).toBe(emit({ GstRender: { Width: '1920' }, GstAudio: { Device: '' } }));
    expect(parseImportedProfile(emitEntries(entries))).toEqual(entries);
  });

  test('rejects empty, binary and unrelated imports before generating removals', () => {
    for (const invalid of ['', '\0save', '<html>Not a profile</html>', 'hostname desktop']) {
      expect(() => parseImportedProfile(invalid)).toThrow();
    }
    expect(parseImportedProfile('\uFEFFGstRender.Width 1920\r\n')).toEqual({ 'GstRender.Width': '1920' });
  });

  test('recommendations reference real keys with supported values and exclude personal settings', () => {
    const directory = join(import.meta.dirname, '..', 'base');
    const baseline = flatten(combineBase(readdirSync(directory).filter((file) => file.endsWith('.toml')).map((file) => parse(readFileSync(join(directory, file), 'utf8')))));
    for (const recommendation of recommendations) {
      for (const [key, value] of Object.entries(recommendation.values)) {
        expect(Object.hasOwn(baseline, key)).toBe(true);
        expect(key).not.toMatch(/ResolutionWidth|ResolutionHeight|Hertz|Sensitivity|KeyBinding|ShaderBundle/);
        const definition = getSetting(key, value);
        expect(definition.advanced).not.toBe(true);
        expect(validateValue(definition, value)).toBeNull();
        if (definition.options) expect(definition.options.map((option) => option.value)).toContain(value);
      }
      const applied = applyEdits(baseline, recommendationEdits(recommendation, baseline));
      expect(recommendationEdits(recommendation, applied)).toEqual({});
      expect(recommendationEdits(recommendation, {})).toEqual({});
    }
  });

  test('known options have labels while unsupported values remain visible', () => {
    expect(displayValue('GstRender.TextureQuality', '2.000000')).toBe('High');
    expect(displayValue('GstRender.TextureQuality', '99')).toBe('99');
    expect(displayValue('GstAudio.Volume', '')).toBe('Empty value');
    expect(displayValue('GstAudio.Volume', null)).toBe('Not present');
    expect(getSetting('GstRender.ShaderBundleVersion_123').readonly).toBe(true);
    expect(validateValue(getSetting('GstAudio.Volume'), '1.2')).not.toBeNull();
    expect(validateValue(getSetting('GstAudio.Volume'), '')).not.toBeNull();
  });

  test('HUD color editing preserves the alpha byte and signed integer format', () => {
    const original = String(0xff002280 | 0);
    expect(profileColor(original)).toBe('#ff0022');
    expect(colorValue('#ff0022', original)).toBe(original);
    expect(Number(colorValue('#123456', original)) & 0xff).toBe(0x80);
  });

  test('numeric displays map documented scales and units without changing exported values', () => {
    const examples = [
      ['GstAudio.Volume', '0.500000', '50%'],
      ['GstAudio.Volume_Radio_Driver', '0.290000', '29%'],
      ['GstRender.MotionBlurWeapon', '0.000000', '0%'],
      ['GstRender.SharpnessSlider', '0.425000', '42.5%'],
      ['GstInput.GamepadLeftStickDeadzoneAxis', '0.060000', '6%'],
      ['GstRender.ResolutionScale', '1.250000', '125%'],
      ['GstRender.FixedResolutionScale', '100.000000', '100%'],
      ['GstRender.DRSMinimumResolutionScale', '80.000000', '80%'],
      ['GstRender.FrameRateLimit', '144.000000', '144 FPS'],
      ['GstRender.FrameRateLimit', '0.000000', 'Uncapped'],
      ['GstRender.FullscreenRefreshRate', '240.084000', '240.084 Hz'],
      ['GstRender.ResolutionWidth', '3840', '3840 px'],
      ['GstRender.FieldOfViewVertical', '89.000000', '89 deg'],
      ['GstRender.HUD-Friendly', '-16776961', '#FF0000FF'],
    ];
    for (const [key, value, expected] of examples) {
      expect(displayValue(key, value)).toBe(expected);
      expect(parseImportedProfile(emitEntries({ [key]: value }))).toEqual({ [key]: value });
    }
    expect(displayValue('GstRender.HUD-Friendly', '-16777088')).toBe('#FF000080');
  });

  test('unverified, invalid and out-of-range numeric mappings remain raw', () => {
    for (const [key, value] of [
      ['GstInput.MouseSensitivity', '0.015000'],
      ['GstInput.UniformSoldierAimingCoefficient', '1.330000'],
      ['GstRender.UnknownOption', '0.500000'],
      ['GstRender.TextureQuality', '99'],
      ['GstAudio.Volume', '1.500000'],
      ['GstAudio.Volume', '-1'],
      ['GstAudio.Volume', 'NaN'],
      ['GstAudio.Volume', 'Infinity'],
      ['GstAudio.Volume', ' '],
    ]) expect(displayValue(key, value)).toBe(value);
  });

  test('resolution presets are valid pairs and unlisted dimensions remain custom', () => {
    expect(new Set(resolutionPresets.map((preset) => preset.value)).size).toBe(resolutionPresets.length);
    for (const preset of resolutionPresets) {
      expect(getResolutionPreset(preset.width, preset.height)).toBe(preset);
      expect(validateValue(getSetting('GstRender.ResolutionWidth'), preset.width)).toBeNull();
      expect(validateValue(getSetting('GstRender.ResolutionHeight'), preset.height)).toBeNull();
    }
    expect(getResolutionPreset('1920.000000', '1080')?.value).toBe('1920x1080');
    expect(getResolutionPreset('2222', '1111')).toBeUndefined();
    expect(getResolutionPreset(undefined, '1080')).toBeUndefined();
    expect(validateValue(getSetting('GstRender.ResolutionWidth'), '1920.5')).toBe('Enter a whole number of pixels.');
  });
});
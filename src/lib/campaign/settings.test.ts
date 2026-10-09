import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DM_QUALITY_LABELS,
  DM_QUALITY_OPTIONS,
  diceInstructions,
  normalizeSettings,
  parseSettingsPatch,
  roundSecondsLabel,
  styleInstructions,
} from './settings';

describe('normalizeSettings', () => {
  it('fills everything missing with the defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and replaces invalid ones one by one', () => {
    expect(
      normalizeSettings({ roundSeconds: 120, difficulty: 'hard', narrationLength: 'epic', diceEnabled: 'yes' })
    ).toEqual({ ...DEFAULT_SETTINGS, roundSeconds: 120, difficulty: 'hard' });
  });

  it('defaults permadeath to off and only accepts a real boolean', () => {
    expect(DEFAULT_SETTINGS.permadeath).toBe(false);
    expect(normalizeSettings({}).permadeath).toBe(false);
    expect(normalizeSettings({ permadeath: true }).permadeath).toBe(true);
    expect(normalizeSettings({ permadeath: 'yes' }).permadeath).toBe(false);
  });
});

describe('dmQuality', () => {
  it('defaults to good, including for old rooms without the value', () => {
    expect(DEFAULT_SETTINGS.dmQuality).toBe('good');
    expect(normalizeSettings({ permadeath: true }).dmQuality).toBe('good');
    expect(normalizeSettings({ dmQuality: 'fast' }).dmQuality).toBe('fast');
    expect(normalizeSettings({ dmQuality: 'ultra' }).dmQuality).toBe('good');
  });

  it('is validated in patches', () => {
    expect(parseSettingsPatch({ dmQuality: 'fast' })).toEqual({ dmQuality: 'fast' });
    expect(parseSettingsPatch({ dmQuality: 'good' })).toEqual({ dmQuality: 'good' });
    expect(parseSettingsPatch({ dmQuality: 'ultra' })).toBeNull();
    expect(parseSettingsPatch({ dmQuality: true })).toBeNull();
  });

  it('has Thai labels', () => {
    expect(DM_QUALITY_LABELS.fast).toBe('เร็ว (ประหยัด)');
    expect(DM_QUALITY_LABELS.good).toBe('ดี (เล่าเรื่องละเอียดกว่า อาจช้ากว่า)');
    expect(DM_QUALITY_OPTIONS).toEqual(['fast', 'good']);
  });
});

describe('parseSettingsPatch', () => {
  it('accepts a valid partial update', () => {
    expect(parseSettingsPatch({ roundSeconds: 0, diceEnabled: false })).toEqual({
      roundSeconds: 0,
      diceEnabled: false,
    });
  });

  it('validates the permadeath switch', () => {
    expect(parseSettingsPatch({ permadeath: true })).toEqual({ permadeath: true });
    expect(parseSettingsPatch({ permadeath: 'on' })).toBeNull();
  });

  it('rejects unknown keys, bad values and empty updates', () => {
    for (const bad of [{ roundSeconds: 7 }, { difficulty: 'nightmare' }, { admin: true }, {}, null, [], 'x']) {
      expect(parseSettingsPatch(bad)).toBeNull();
    }
  });
});

describe('prompt instructions', () => {
  it('asks for the chosen length and tone', () => {
    expect(styleInstructions({ ...DEFAULT_SETTINGS, narrationLength: 'short', difficulty: 'hard' }).join(' ')).toMatch(
      /short.*unforgiving/
    );
    expect(styleInstructions(DEFAULT_SETTINGS)).toHaveLength(1);
  });

  it('scales how rolls are read with the difficulty', () => {
    const easy = diceInstructions({ ...DEFAULT_SETTINGS, difficulty: 'easy' }, true).join(' ');
    const hard = diceInstructions({ ...DEFAULT_SETTINGS, difficulty: 'hard' }, true).join(' ');
    expect(easy).toContain('5 or more succeeds');
    expect(hard).toContain('12-17 succeeds with complications');
  });

  it('says so when the table plays without dice', () => {
    expect(diceInstructions({ ...DEFAULT_SETTINGS, diceEnabled: false }, false).join(' ')).toContain('without dice');
    expect(diceInstructions(DEFAULT_SETTINGS, false)).toEqual([]);
  });
});

describe('roundSecondsLabel', () => {
  it('reads naturally', () => {
    expect(roundSecondsLabel(0)).toBe('ไม่จำกัดเวลา');
    expect(roundSecondsLabel(300)).toBe('5 นาที');
    expect(roundSecondsLabel(90)).toBe('90 วินาที');
  });
});

describe('scopeInstructions', () => {
  it('tells the DM to stay in the fiction and redirect out-of-game requests instead of chatting along', async () => {
    const { scopeInstructions } = await import('./settings');
    const text = scopeInstructions().join('\n').toLowerCase();
    expect(text).toContain('stay strictly inside');
    expect(text).toContain('do not answer out-of-game requests');
    expect(text).toContain('redirect');
  });
});

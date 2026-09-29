import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
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
});

describe('parseSettingsPatch', () => {
  it('accepts a valid partial update', () => {
    expect(parseSettingsPatch({ roundSeconds: 0, diceEnabled: false })).toEqual({
      roundSeconds: 0,
      diceEnabled: false,
    });
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

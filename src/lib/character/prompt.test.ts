import { describe, it, expect } from 'vitest';
import { characterPrompt } from './prompt';
import type { Character } from './types';

const party: Character[] = [
  { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 15, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 },
  { id: 'p2', displayName: 'Suki', weaponId: null, hp: 0, maxHp: 20, status: 'downed', revivesSinceSanctuary: 0 },
];

describe('characterPrompt', () => {
  it('is empty when there are no characters', () => {
    expect(characterPrompt([], false, 'a chapel')).toEqual([]);
  });

  it('lists each character with HP, weapon and standing/downed', () => {
    const text = characterPrompt(party, false, undefined).join('\n');
    expect(text).toContain('Prem (Lv 1): HP 15/18, shortsword (1d8), standing');
    expect(text).toContain('Suki (Lv 1): HP 0/20, fists (1d2), DOWNED');
  });

  it('teaches the tags and forbids inventing HP numbers', () => {
    const text = characterPrompt(party, false, undefined).join('\n');
    expect(text).toContain('[[hurt: PlayerName | light]]');
    expect(text).toContain('[[heal: PlayerName | medium]]');
    expect(text).toContain('[[revive: PlayerName]]');
    expect(text).toContain('never state or invent HP numbers');
  });

  it("shows each character's level, derived from xp", () => {
    const text = characterPrompt([{ ...party[0], xp: 150 }], false, undefined).join('\n');
    expect(text).toContain('Prem (Lv 3):');
  });

  it('teaches the xp and milestone tags without leaking XP numbers', () => {
    const text = characterPrompt([{ ...party[0], xp: 150 }], false, undefined).join('\n');
    expect(text).toContain('[[xp: small]]');
    expect(text).toContain('[[milestone]]');
    expect(text).not.toMatch(/\b150\b/);
    const statusLines = text.split('\n').filter((line) => line.startsWith('- '));
    expect(statusLines.join('\n')).not.toMatch(/XP/);
  });

  it('names the sanctuary only when the adventure has one', () => {
    expect(characterPrompt(party, false, 'the old chapel').join('\n')).toContain('[[sanctuary]] only when the party is at: the old chapel');
    expect(characterPrompt(party, false, undefined).join('\n')).not.toContain('[[sanctuary]]');
  });

  it('adds the aftermath instruction only after a wipe', () => {
    expect(characterPrompt(party, true, undefined).join('\n')).toContain('defeated last round');
    expect(characterPrompt(party, false, undefined).join('\n')).not.toContain('defeated last round');
  });
});

describe('characterPrompt harm-risk guidance', () => {
  it('tells the DM to only hurt a player when the action was actually risky', () => {
    const text = characterPrompt(party, false, undefined).join('\n').toLowerCase();
    expect(text).toContain('only use [[hurt');
    expect(text).toContain('never cause harm');
    expect(text).toContain('routine activity');
    expect(text).toContain('putting away belongings');
  });

  it('offers a roll-free full heal for a paid treatment', () => {
    const text = characterPrompt(party, false, undefined).join('\n').toLowerCase();
    expect(text).toContain('full to restore them completely with no roll');
  });
});

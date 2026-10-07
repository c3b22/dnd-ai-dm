import { describe, it, expect } from 'vitest';
import { shortRest, longRest, shortRestDiceCount } from './rest';
import type { RestCharacter } from './rest';

const c = (over: Partial<RestCharacter> = {}): RestCharacter => ({
  id: 'p1', displayName: 'Aria', weaponId: null, hp: 5, maxHp: 30, status: 'active', revivesSinceSanctuary: 0, ...over,
});
const fixed = (n: number) => () => n;

describe('shortRestDiceCount', () => {
  it('is 1 die per 2 levels, at least 1', () => {
    expect([1, 2, 3, 4, 5, 10].map(shortRestDiceCount)).toEqual([1, 1, 1, 2, 2, 5]);
  });
});

describe('shortRest', () => {
  it('heals d8 per 2 levels plus CON mod and clears the cooldown', () => {
    // level 4 (xp 270) = 2 dice of 4 each, CON 14 = +2
    const r = shortRest(c({ xp: 270, abilities: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 }, abilityCooldown: 3 }), fixed(4));
    expect(r.ok).toBe(true);
    expect(r.healed).toBe(10);
    expect(r.character.hp).toBe(15);
    expect(r.character.abilityCooldown).toBe(0);
    expect(r.character.shortRestsUsed).toBe(1);
  });
  it('caps HP at max and never heals below zero', () => {
    expect(shortRest(c({ hp: 28 }), fixed(8)).character.hp).toBe(30);
    const weak = shortRest(c({ abilities: { STR: 10, DEX: 10, CON: 3, INT: 10, WIS: 10, CHA: 10 } }), fixed(1));
    expect(weak.character.hp).toBe(5);
    expect(weak.healed).toBe(0);
  });
  it('restores one spell slot when slots are present, no-op otherwise', () => {
    const r = shortRest(c({ spellSlots: { current: 0, max: 3 } }), fixed(1));
    expect(r.character.spellSlots).toEqual({ current: 1, max: 3 });
    expect(shortRest(c({ spellSlots: { current: 3, max: 3 } }), fixed(1)).character.spellSlots).toEqual({ current: 3, max: 3 });
    expect(shortRest(c(), fixed(1)).character.spellSlots).toBeUndefined();
  });
  it('is refused after 2 short rests', () => {
    const r = shortRest(c({ shortRestsUsed: 2 }), fixed(8));
    expect(r.ok).toBe(false);
    expect(r.character).toEqual(c({ shortRestsUsed: 2 }));
  });
  it('is refused for downed and dead characters', () => {
    for (const status of ['downed', 'dead'] as const) {
      const r = shortRest(c({ status, hp: 0 }), fixed(8));
      expect(r.ok).toBe(false);
      expect(r.character.hp).toBe(0);
    }
  });
  it('does not roll dice when refused', () => {
    let rolls = 0;
    shortRest(c({ status: 'downed' }), () => { rolls++; return 1; });
    expect(rolls).toBe(0);
  });
});

describe('longRest', () => {
  const tired = () => c({ abilityCooldown: 2, shortRestsUsed: 2, spellSlots: { current: 0, max: 4 }, deathSaves: { successes: 1, failures: 1, stable: false, dead: false } });
  it('restores everything when the place is safe', () => {
    const r = longRest(tired(), { safe: true });
    expect(r.ok).toBe(true);
    expect(r.character).toMatchObject({ hp: 30, abilityCooldown: 0, shortRestsUsed: 0, spellSlots: { current: 4, max: 4 }, deathSaves: null });
  });
  it('works in a sanctuary even if not marked safe', () => {
    expect(longRest(tired(), { safe: false, sanctuary: true }).ok).toBe(true);
  });
  it('is refused when the place is not safe', () => {
    const r = longRest(tired(), { safe: false });
    expect(r.ok).toBe(false);
    expect(r.character).toEqual(tired());
  });
  it('is refused for downed and dead characters', () => {
    for (const status of ['downed', 'dead'] as const) {
      expect(longRest(c({ status, hp: 0 }), { safe: true }).ok).toBe(false);
    }
  });
});

describe('rest and the per-ability cooldown map (K2)', () => {
  it('short rest clears the map when the character has one', () => {
    expect(shortRest(c({ abilityCooldown: 2, abilityCooldowns: { a: 3 } }), fixed(4)).character.abilityCooldowns).toEqual({});
  });
  it('long rest clears the map when the character has one', () => {
    expect(longRest(c({ abilityCooldowns: { a: 3 } }), { safe: true }).character.abilityCooldowns).toEqual({});
  });
  it('does not add a map to a character without one', () => {
    expect('abilityCooldowns' in shortRest(c(), fixed(4)).character).toBe(false);
    expect('abilityCooldowns' in longRest(c(), { safe: true }).character).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { CharacterTag } from '@/lib/character/tags';
import { applyEnemyTags, normalizeEncounter, type Encounter } from './encounter';

const enemy = (name: string, tier: 'minion' | 'normal' | 'strong' | 'boss'): CharacterTag => ({ kind: 'enemy', name, tier });
const hurt = (name: string, tier: 'light' | 'medium' | 'heavy'): CharacterTag => ({ kind: 'enemy_hurt', name, tier });
const flee = (name: string): CharacterTag => ({ kind: 'enemy_flee', name });

describe('normalizeEncounter', () => {
  it('returns null for junk', () => {
    for (const v of [null, undefined, 0, 'x', [], {}, { enemies: [] }, { enemies: 'a' }]) {
      expect(normalizeEncounter(v)).toBeNull();
    }
  });

  it('accepts a valid encounter', () => {
    const e: Encounter = { enemies: [{ name: 'หมาป่า', tier: 'normal', pip: 2, maxPip: 4, fled: false }] };
    expect(normalizeEncounter(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('rejects bad enemies, duplicate names, too many, and finished encounters', () => {
    const ok = { name: 'a', tier: 'minion', pip: 2, maxPip: 2, fled: false };
    expect(normalizeEncounter({ enemies: [ok] })).not.toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, tier: 'god' }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, pip: 3 }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, pip: -1 }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, pip: 0.5 }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, maxPip: 1 }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, name: ' ' }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, fled: 'no' }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [ok, ok] })).toBeNull();
    const many = Array.from({ length: 9 }, (_, i) => ({ ...ok, name: `a${i}` }));
    expect(normalizeEncounter({ enemies: many })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, pip: 0 }] })).toBeNull();
    expect(normalizeEncounter({ enemies: [{ ...ok, fled: true }] })).toBeNull();
  });
});

describe('applyEnemyTags', () => {
  it('starts an encounter with tier pips', () => {
    const r = applyEnemyTags(null, [enemy('a', 'minion'), enemy('b', 'normal'), enemy('c', 'strong'), enemy('d', 'boss')]);
    expect(r?.enemies.map((e) => [e.name, e.pip, e.maxPip])).toEqual([['a', 2, 2], ['b', 4, 4], ['c', 6, 6], ['d', 10, 10]]);
  });

  it('numbers duplicate names', () => {
    const r = applyEnemyTags(null, [enemy('หมาป่า', 'normal'), enemy('หมาป่า', 'normal'), enemy('หมาป่า', 'normal')]);
    expect(r?.enemies.map((e) => e.name)).toEqual(['หมาป่า', 'หมาป่า 2', 'หมาป่า 3']);
  });

  it('caps at 8 enemies', () => {
    const r = applyEnemyTags(null, Array.from({ length: 10 }, () => enemy('x', 'normal')));
    expect(r?.enemies).toHaveLength(8);
  });

  it('applies hurt amounts and ignores unknown names', () => {
    const start = applyEnemyTags(null, [enemy('a', 'strong')])!;
    expect(applyEnemyTags(start, [hurt('a', 'light')])?.enemies[0].pip).toBe(5);
    expect(applyEnemyTags(start, [hurt('a', 'medium')])?.enemies[0].pip).toBe(5);
    expect(applyEnemyTags(start, [hurt('a', 'heavy')])?.enemies[0].pip).toBe(4);
    expect(applyEnemyTags(start, [hurt('zzz', 'heavy')])).toEqual(start);
  });

  it('does not mutate its input', () => {
    const start = applyEnemyTags(null, [enemy('a', 'strong')])!;
    const copy = JSON.parse(JSON.stringify(start));
    applyEnemyTags(start, [hurt('a', 'heavy')]);
    expect(start).toEqual(copy);
  });

  it('a boss at full pips is never killed by one blow, and can still fall later', () => {
    const start = applyEnemyTags(null, [enemy('b', 'boss')])!;
    const hit = applyEnemyTags(start, [hurt('b', 'heavy')])!;
    expect(hit.enemies[0].pip).toBe(8);
    const low = { enemies: [{ ...hit.enemies[0], pip: 1 }] };
    const other = applyEnemyTags(low, [enemy('m', 'minion'), hurt('b', 'light')])!;
    expect(other.enemies[0].pip).toBe(0);
  });

  it('downed enemies stay while others remain; pip 0 is down and cannot be hurt again', () => {
    const start = applyEnemyTags(null, [enemy('a', 'minion'), enemy('b', 'normal')])!;
    const r = applyEnemyTags(start, [hurt('a', 'light')])!;
    expect(r.enemies[0].pip).toBe(1);
    expect(r.enemies).toHaveLength(2);
    const down = applyEnemyTags(r, [hurt('a', 'light')])!;
    expect(down.enemies[0].pip).toBe(0);
    expect(applyEnemyTags(down, [hurt('a', 'light')])).toEqual(down);
  });

  it('targets numbered duplicates by base name, skipping downed ones', () => {
    const start = applyEnemyTags(null, [enemy('หมาป่า', 'minion'), enemy('หมาป่า', 'normal')])!;
    const r = applyEnemyTags(start, [hurt('หมาป่า', 'light'), hurt('หมาป่า', 'light'), hurt('หมาป่า', 'light')])!;
    expect(r.enemies.map((e) => e.pip)).toEqual([0, 3]);
    expect(applyEnemyTags(start, [hurt('หมาป่า 2', 'light')])?.enemies[1].pip).toBe(3);
  });

  it('enemy_flee marks fled', () => {
    const start = applyEnemyTags(null, [enemy('a', 'normal'), enemy('b', 'normal')])!;
    expect(applyEnemyTags(start, [flee('a')])?.enemies[0].fled).toBe(true);
  });

  it('ends (null) when all are down or fled', () => {
    const start = applyEnemyTags(null, [enemy('a', 'minion'), enemy('b', 'normal')])!;
    expect(applyEnemyTags(start, [hurt('a', 'heavy'), flee('b')])).toBeNull();
    expect(applyEnemyTags(start, [hurt('a', 'heavy'), hurt('b', 'heavy'), hurt('b', 'heavy')])).toBeNull();
  });

  it('combat_end ends it', () => {
    const start = applyEnemyTags(null, [enemy('a', 'normal')])!;
    expect(applyEnemyTags(start, [{ kind: 'combat_end' }])).toBeNull();
    expect(applyEnemyTags(null, [{ kind: 'combat_end' }])).toBeNull();
  });

  it('hurt/flee with no encounter do nothing; other tags are ignored', () => {
    expect(applyEnemyTags(null, [hurt('a', 'heavy'), flee('a'), { kind: 'milestone' }])).toBeNull();
    const start = applyEnemyTags(null, [enemy('a', 'normal')])!;
    expect(applyEnemyTags(start, [{ kind: 'milestone' }])).toEqual(start);
  });

  it('adds enemies mid-combat with numbering against existing names', () => {
    const start = applyEnemyTags(null, [enemy('a', 'normal')])!;
    expect(applyEnemyTags(start, [enemy('a', 'normal')])?.enemies.map((e) => e.name)).toEqual(['a', 'a 2']);
  });
});

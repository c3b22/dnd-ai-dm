import { describe, it, expect } from 'vitest';
import { CATALOG } from './catalog';
import { SKILL_IDS } from '@/lib/character/classes';
import {
  MAGIC_ITEMS, MAGIC_RARITIES, MAGIC_MECHANIC_KINDS, magicSellPrice, isSoldInShop,
  type MagicItem,
} from './magicItems';

const byKind = <K extends MagicItem['mechanic']['kind']>(kind: K) =>
  MAGIC_ITEMS.filter((i) => i.mechanic.kind === kind);

describe('magic item catalogue', () => {
  it('has at least 100 items with unique ids and unique Thai names', () => {
    expect(MAGIC_ITEMS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(MAGIC_ITEMS.map((i) => i.id)).size).toBe(MAGIC_ITEMS.length);
    expect(new Set(MAGIC_ITEMS.map((i) => i.nameTh)).size).toBe(MAGIC_ITEMS.length);
  });

  it('does not collide with ordinary catalog ids', () => {
    const magicIds = new Set(MAGIC_ITEMS.map((i) => i.id));
    const ordinary = Object.keys(CATALOG).filter((id) => !magicIds.has(id));
    expect(ordinary).toEqual(
      expect.arrayContaining(['shortsword', 'dagger', 'armor_light', 'potion_minor'])
    );
    for (const id of ['shortsword', 'shortbow', 'staff', 'dagger', 'armor_light', 'armor_medium', 'armor_heavy', 'potion_minor', 'potion_major'])
      expect(magicIds.has(id)).toBe(false);
  });

  it('gives every item a flavour sentence, a supported mechanic, a rarity, weight and positive integer price', () => {
    for (const i of MAGIC_ITEMS) {
      expect(i.flavorTh.trim().length).toBeGreaterThan(0);
      expect(MAGIC_MECHANIC_KINDS).toContain(i.mechanic.kind);
      expect(MAGIC_RARITIES).toContain(i.rarity);
      expect(i.weight).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(i.price) && i.price > 0).toBe(true);
    }
  });

  it('meets the per-category minimums', () => {
    expect(byKind('weapon').length).toBeGreaterThanOrEqual(32);
    expect(byKind('armor').length).toBeGreaterThanOrEqual(20);
    expect(byKind('consumable').length).toBeGreaterThanOrEqual(12);
    expect(byKind('scroll').length).toBeGreaterThanOrEqual(12);
    expect(byKind('accessory').length).toBeGreaterThanOrEqual(20);
    expect(byKind('charm').length).toBeGreaterThanOrEqual(4);
  });

  it('has at least 8 distinct names for each of the 4 weapon types', () => {
    for (const w of ['shortsword', 'shortbow', 'staff', 'dagger']) {
      const names = MAGIC_ITEMS.filter((i) => i.mechanic.kind === 'weapon' && i.mechanic.weaponId === w);
      expect(names.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('keeps weapon damage bonus within +1..+3 and tied to rarity', () => {
    const expected = { uncommon: 1, rare: 2, legendary: 3 } as const;
    for (const i of byKind('weapon')) {
      if (i.mechanic.kind !== 'weapon') continue;
      expect(i.mechanic.damageBonus).toBeGreaterThanOrEqual(1);
      expect(i.mechanic.damageBonus).toBeLessThanOrEqual(3);
      expect(i.mechanic.damageBonus).toBe(expected[i.rarity]);
    }
  });

  it('keeps armor reduction 2..4 and lighter than the ordinary armor of equal reduction', () => {
    for (const i of byKind('armor')) {
      if (i.mechanic.kind !== 'armor') continue;
      const r = i.mechanic.reduction;
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThanOrEqual(4);
      const ordinary = { 2: CATALOG.armor_medium.weight, 3: CATALOG.armor_heavy.weight, 4: CATALOG.armor_heavy.weight + 1 }[r]!;
      expect(i.weight).toBeLessThan(ordinary);
    }
  });

  it('covers every skill with at least one accessory', () => {
    const covered = new Set(byKind('accessory').map((i) => (i.mechanic.kind === 'accessory' ? i.mechanic.skill : '')));
    for (const s of SKILL_IDS) expect(covered.has(s)).toBe(true);
  });

  it('has the rarity mix: ~50% uncommon, ~35% rare, at least 10 legendary', () => {
    const n = MAGIC_ITEMS.length;
    const share = (r: string) => MAGIC_ITEMS.filter((i) => i.rarity === r).length / n;
    expect(share('uncommon')).toBeGreaterThan(0.45);
    expect(share('uncommon')).toBeLessThan(0.6);
    expect(share('rare')).toBeGreaterThan(0.3);
    expect(share('rare')).toBeLessThan(0.4);
    expect(MAGIC_ITEMS.filter((i) => i.rarity === 'legendary').length).toBeGreaterThanOrEqual(10);
  });

  it('sells back at half price rounded down, and never sells legendaries in shops', () => {
    expect(magicSellPrice({ price: 75 } as MagicItem)).toBe(37);
    for (const i of MAGIC_ITEMS) expect(isSoldInShop(i)).toBe(i.rarity !== 'legendary');
  });
});

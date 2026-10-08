import { describe, it, expect } from 'vitest';
import { CATALOG } from './catalog';
import { SKILL_IDS } from '@/lib/character/classes';
import { ITEM_EFFECT_IDS, KEEN_EYE_MAX, WARD_MAX, DEEP_PACK_MAX } from './effects';
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

  describe('effects and themes (F5j9)', () => {
    const SLOT_OK: Record<string, string[]> = {
      crit_surge: ['weapon'], lifesteal: ['weapon'], ward: ['armor'], keen_eye: ['weapon', 'accessory'],
      deep_pack: ['accessory'], lucky_purse: ['accessory'], quick_tempo: ['accessory'],
    };
    const slot = (i: MagicItem) => (['weapon', 'armor', 'accessory'].includes(i.mechanic.kind) ? i.mechanic.kind : null);

    it('puts no effect on uncommon items', () => {
      for (const i of MAGIC_ITEMS.filter((x) => x.rarity === 'uncommon')) expect(i.effect).toBeUndefined();
    });

    it('allows only small effects on rare items and main effects on legendary ones, at most one each', () => {
      for (const i of MAGIC_ITEMS.filter((x) => x.rarity === 'rare' && x.effect))
        expect(['lifesteal', 'keen_eye', 'lucky_purse', 'quick_tempo']).toContain(i.effect);
      for (const i of MAGIC_ITEMS.filter((x) => x.rarity === 'legendary' && x.effect))
        expect(['crit_surge', 'ward', 'deep_pack']).toContain(i.effect);
      expect(MAGIC_ITEMS.filter((x) => x.rarity === 'legendary' && slot(x) && !x.effect)).toEqual([]);
    });

    it('keeps each effect on its allowed slot and effectValue in range', () => {
      for (const i of MAGIC_ITEMS.filter((x) => x.effect)) {
        expect(ITEM_EFFECT_IDS).toContain(i.effect);
        expect(SLOT_OK[i.effect!]).toContain(slot(i));
        if (i.effect === 'keen_eye' && i.effectValue !== undefined) expect([1, KEEN_EYE_MAX]).toContain(i.effectValue);
        if (i.effect === 'ward' && i.effectValue !== undefined) { expect(i.effectValue).toBeGreaterThanOrEqual(2); expect(i.effectValue).toBeLessThanOrEqual(WARD_MAX); }
        if (i.effect === 'deep_pack' && i.effectValue !== undefined) { expect(i.effectValue).toBeGreaterThanOrEqual(3); expect(i.effectValue).toBeLessThanOrEqual(DEEP_PACK_MAX); }
      }
    });

    it('uses every implemented effect, and deep_pack sits only on legendary accessories', () => {
      const used = new Set(MAGIC_ITEMS.flatMap((i) => (i.effect ? [i.effect] : [])));
      for (const e of ITEM_EFFECT_IDS) expect(used.has(e)).toBe(true);
      const packs = MAGIC_ITEMS.filter((i) => i.effect === 'deep_pack');
      expect(packs.length).toBeGreaterThanOrEqual(1);
      for (const i of packs) {
        expect(i.mechanic.kind).toBe('accessory');
        expect(i.rarity).toBe('legendary');
        expect(isSoldInShop(i)).toBe(false);
        expect(i.theme).toBeTruthy();
      }
    });

    it('has at least 8 themes, each with a full weapon + armor + accessory set', () => {
      const themes = new Set(MAGIC_ITEMS.flatMap((i) => (i.theme ? [i.theme] : [])));
      expect(themes.size).toBeGreaterThanOrEqual(8);
      for (const t of themes) {
        const slots = new Set(MAGIC_ITEMS.filter((i) => i.theme === t).map(slot));
        for (const s of ['weapon', 'armor', 'accessory']) expect(slots.has(s as never)).toBe(true);
        expect(slots.has(null)).toBe(false);
      }
    });
  });
});

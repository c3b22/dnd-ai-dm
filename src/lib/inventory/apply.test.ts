import { describe, it, expect } from 'vitest';
import { magicPool } from './magicGrant';
import { applyInventoryTags, applyPotionActions, applyScrollActions } from './apply';
import type { Encounter } from '@/lib/combat/encounter';
import type { Character } from '@/lib/character/types';
import type { InventoryItem, Inventories } from './types';

const four = () => 4;
const person = (id: string, displayName: string, over: Partial<Character> = {}): Character => ({
  id, displayName, weaponId: null, hp: 10, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over,
});
const potion = (quantity = 1): InventoryItem => ({ itemId: 'potion_minor', customName: '', quantity, slot: null, equipped: false });
const party = [person('p1', 'Prem'), person('p2', 'Suki')];

describe('applyInventoryTags [[magic]]', () => {
  const magicTag = (name: string, rarity: 'uncommon' | 'rare' | 'legendary', itemType: 'weapon' | 'armor' | 'accessory' | 'potion' | 'scroll' | null = null) =>
    ({ kind: 'magic' as const, name, rarity, itemType });

  it('gives a server-picked item of that rarity and type, and reports its name and rarity', () => {
    const r = applyInventoryTags(party, {}, [magicTag('prem', 'rare', 'scroll')], { given: [], rand: () => 0 });
    const id = r.magicGiven[0];
    expect(magicPool('rare', 'scroll').map((i) => i.id)).toContain(id);
    expect(r.inventories.p1[0]).toMatchObject({ itemId: id, quantity: 1 });
    expect(r.changes[0]).toMatch(/^Prem ได้รับไอเท็มวิเศษ .+ \(หายาก\)$/);
    expect(r.changedPlayerIds).toEqual(['p1']);
  });

  it('never repeats within the room, across tags in one round or earlier rounds', () => {
    const pool = magicPool('uncommon', 'potion').map((i) => i.id);
    const r = applyInventoryTags(party, {}, [magicTag('Prem', 'uncommon', 'potion'), magicTag('Suki', 'uncommon', 'potion')], { given: [pool[0]], rand: () => 0 });
    expect(r.magicGiven).toEqual([pool[1], pool[2]]);
  });

  it('starts repeating once the whole pool was given', () => {
    const pool = magicPool('uncommon', 'potion').map((i) => i.id);
    const r = applyInventoryTags(party, {}, [magicTag('Prem', 'uncommon', 'potion')], { given: pool, rand: () => 0 });
    expect(pool).toContain(r.magicGiven[0]);
  });

  it('gives at most one legendary per campaign', () => {
    const r = applyInventoryTags(party, {}, [magicTag('Prem', 'legendary'), magicTag('Suki', 'legendary')], { given: [], rand: () => 0 });
    expect(r.magicGiven).toHaveLength(1);
    expect(r.inventories.p2).toBeUndefined();
    expect(r.changes[1]).toContain('ตำนาน');
    const later = applyInventoryTags(party, {}, [magicTag('Prem', 'legendary')], { given: r.magicGiven });
    expect(later.magicGiven).toEqual([]);
    expect(later.changedPlayerIds).toEqual([]);
  });

  it('ignores an unknown player name', () => {
    const r = applyInventoryTags(party, {}, [magicTag('Nobody', 'rare')], { given: [] });
    expect(r).toMatchObject({ changes: [], changedPlayerIds: [], magicGiven: [] });
  });

  it('ignores the tag when the given-table is unavailable', () => {
    const r = applyInventoryTags(party, {}, [magicTag('Prem', 'rare')]);
    expect(r).toMatchObject({ changes: [], changedPlayerIds: [], magicGiven: [] });
  });

  it('a full pack gets the usual full message and the item is not recorded as given', () => {
    const full: Inventories = { p1: [potion(10)] };
    const r = applyInventoryTags(party, full, [magicTag('Prem', 'rare', 'scroll')], { given: [], rand: () => 0 });
    expect(r.magicGiven).toEqual([]);
    expect(r.changes[0]).toContain('แบกไม่ไหว');
    expect(r.inventories.p1).toBe(full.p1);
  });

  it('plain [[give]] still works for ordinary items', () => {
    const r = applyInventoryTags(party, {}, [{ kind: 'give', name: 'Prem', itemId: 'dagger', customName: '' }], { given: [] });
    expect(r.inventories.p1[0].itemId).toBe('dagger');
    expect(r.magicGiven).toEqual([]);
  });
});

describe('applyInventoryTags', () => {
  it('gives a catalog item and a story item and reports them in the log', () => {
    const result = applyInventoryTags(
      party, {},
      [
        { kind: 'give', name: 'prem', itemId: 'potion_minor', customName: '' },
        { kind: 'give', name: 'Suki', itemId: 'story', customName: 'Rusty Key' },
      ]
    );
    expect(result.inventories.p1[0]).toMatchObject({ itemId: 'potion_minor', quantity: 1 });
    expect(result.inventories.p2[0]).toMatchObject({ itemId: 'story', customName: 'Rusty Key' });
    expect(result.changes).toEqual(['Prem ได้รับ ยาฟื้นฟูเล็ก', 'Suki ได้รับ Rusty Key']);
    expect(result.changedPlayerIds.sort()).toEqual(['p1', 'p2']);
  });

  it('says so when the pack is full and changes nothing', () => {
    const full: Inventories = { p1: [potion(10)] };
    const result = applyInventoryTags(party, full, [{ kind: 'give', name: 'Prem', itemId: 'potion_minor', customName: '' }]);
    expect(result.inventories.p1).toBe(full.p1);
    expect(result.changes).toEqual(['Prem แบกไม่ไหว: ไม่ได้รับ ยาฟื้นฟูเล็ก']);
    expect(result.changedPlayerIds).toEqual([]);
  });

  it('takes items away, and ignores unknown names, unknown items and missing items', () => {
    const inv: Inventories = { p1: [potion(2)] };
    const result = applyInventoryTags(party, inv, [
      { kind: 'take', name: 'Prem', itemId: 'potion_minor', customName: '' },
      { kind: 'take', name: 'Nobody', itemId: 'potion_minor', customName: '' },
      { kind: 'give', name: 'Prem', itemId: 'lightsaber', customName: '' },
      { kind: 'take', name: 'Suki', itemId: 'potion_minor', customName: '' },
    ]);
    expect(result.inventories.p1[0].quantity).toBe(1);
    expect(result.changes).toEqual(['Prem เสียไป ยาฟื้นฟูเล็ก']);
  });

  it('does not mutate the input inventories', () => {
    const inv: Inventories = { p1: [potion()] };
    applyInventoryTags(party, inv, [{ kind: 'take', name: 'Prem', itemId: 'potion_minor', customName: '' }]);
    expect(inv.p1[0].quantity).toBe(1);
  });
});

describe('applyPotionActions', () => {
  it('heals, consumes the potion, and produces a log line and a prompt note', () => {
    const result = applyPotionActions(party, { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(result.characters.find((c) => c.id === 'p1')!.hp).toBe(15); // 1d6+1 with a 4 = 5
    expect(result.inventories.p1).toEqual([]);
    expect(result.changes).toEqual(['Prem ดื่ม ยาฟื้นฟูเล็ก (+5 HP)']);
    expect(result.notes.p1).toBe('drank ยาฟื้นฟูเล็ก and recovered 5 HP');
    expect(result.changedPlayerIds).toEqual(['p1']);
  });

  it('never heals past max HP', () => {
    const result = applyPotionActions([person('p1', 'Prem', { hp: 18 })], { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(result.characters[0].hp).toBe(20);
    expect(result.changes).toEqual(['Prem ดื่ม ยาฟื้นฟูเล็ก (+2 HP)']);
  });

  it('ignores a downed player, a potion they do not own, and an item that is not a consumable', () => {
    const downed = [person('p1', 'Prem', { hp: 0, status: 'downed' }), person('p2', 'Suki')];
    const result = applyPotionActions(
      downed,
      { p1: [potion()], p2: [] },
      [
        { playerId: 'p1', useItemId: 'potion_minor' },
        { playerId: 'p2', useItemId: 'potion_minor' },
        { playerId: 'p2', useItemId: 'shortsword' },
        { playerId: 'p2' },
        { useItemId: 'potion_minor' },
      ],
      four
    );
    expect(result.changes).toEqual([]);
    expect(result.changedPlayerIds).toEqual([]);
    expect(result.inventories.p1).toHaveLength(1);
  });

  it('does not mutate the input characters', () => {
    const input = [person('p1', 'Prem')];
    applyPotionActions(input, { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(input[0].hp).toBe(10);
  });
});

describe('applyScrollActions (F5e)', () => {
  const scroll = (itemId = 'scroll_spark', quantity = 1): InventoryItem => ({ itemId, customName: '', quantity, slot: null, equipped: false });
  const enemy = (name: string, tier: 'minion' | 'normal' | 'strong' | 'boss', pip: number, max: number) => ({ name, tier, pip, maxPip: max, fled: false });
  const fight = () => ({ enemies: [enemy('หมาป่า', 'strong', 3, 3), enemy('เจ้าป่า', 'boss', 5, 5)] });
  const use = (over = {}) => ({ playerId: 'p1', useItemId: 'scroll_spark', itemTarget: 'หมาป่า', ...over });

  it('removes the scroll pips from the target, consumes the scroll and logs it', () => {
    const r = applyScrollActions(party, { p1: [scroll('scroll_flame')] }, fight(), [use({ useItemId: 'scroll_flame' })]);
    expect(r.encounter!.enemies[0].pip).toBe(1);
    expect(r.inventories.p1).toEqual([]);
    expect(r.changes).toEqual(['Prem ใช้ ม้วนคัมภีร์เปลวไฟ ใส่ หมาป่า (-2 pip)']);
    expect(r.notes.p1).toContain('หมาป่า');
    expect(r.changedPlayerIds).toEqual(['p1']);
  });

  it('hits a boss through the shared damage rule, and decrements stacked scrolls', () => {
    const r = applyScrollActions(party, { p1: [scroll('scroll_starfall', 2)] }, fight(), [use({ useItemId: 'scroll_starfall', itemTarget: 'เจ้าป่า' })]);
    expect(r.encounter!.enemies[1].pip).toBe(2); // 5 - 3
    const stronger = applyScrollActions(party, { p1: [scroll('scroll_starfall')] }, { enemies: [enemy('เจ้าป่า', 'boss', 5, 5)] }, [use({ useItemId: 'scroll_starfall', itemTarget: 'เจ้าป่า' })]);
    expect(stronger.encounter!.enemies[0].pip).toBe(2);
    expect(r.inventories.p1[0].quantity).toBe(1);
  });

  it('does not use the scroll without a fight, with a bad target, a fled/downed target, or an unowned scroll', () => {
    const inv = { p1: [scroll()] };
    const cases: [Encounter | null, object][] = [
      [null, {}],
      [fight(), { itemTarget: 'มังกร' }],
      [fight(), { itemTarget: null }],
      [{ enemies: [{ ...enemy('หมาป่า', 'strong', 3, 3), fled: true }, enemy('x', 'minion', 1, 1)] }, {}],
      [{ enemies: [enemy('หมาป่า', 'strong', 0, 3), enemy('x', 'minion', 1, 1)] }, {}],
      [fight(), { playerId: 'p9' }],
    ];
    for (const [enc, over] of cases) {
      const r = applyScrollActions(party, inv, enc, [use(over)]);
      expect(r.inventories).toBe(inv);
      expect(r.encounter).toBe(enc);
      expect(r.changes).toEqual([]);
    }
    const none = applyScrollActions(party, { p1: [] }, fight(), [use()]);
    expect(none.changes).toEqual([]);
  });

  it('ignores a downed user, potions and does not mutate the input', () => {
    const downed = [person('p1', 'Prem', { status: 'downed' })];
    expect(applyScrollActions(downed, { p1: [scroll()] }, fight(), [use()]).changes).toEqual([]);
    expect(applyScrollActions(party, { p1: [potion()] }, fight(), [use({ useItemId: 'potion_minor' })]).changes).toEqual([]);
    const enc = fight();
    applyScrollActions(party, { p1: [scroll()] }, enc, [use()]);
    expect(enc.enemies[0].pip).toBe(3);
  });

  it('applyPotionActions leaves a scroll alone', () => {
    const r = applyPotionActions(party, { p1: [scroll()] }, [{ playerId: 'p1', useItemId: 'scroll_spark' }], four);
    expect(r.changes).toEqual([]);
  });
});

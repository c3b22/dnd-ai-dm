import { describe, it, expect } from 'vitest';
import { applyInventoryTags, applyPotionActions } from './apply';
import type { Character } from '@/lib/character/types';
import type { InventoryItem, Inventories } from './types';

const four = () => 4;
const person = (id: string, displayName: string, over: Partial<Character> = {}): Character => ({
  id, displayName, weaponId: null, hp: 10, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over,
});
const potion = (quantity = 1): InventoryItem => ({ itemId: 'potion_minor', customName: '', quantity, slot: null, equipped: false });
const party = [person('p1', 'Prem'), person('p2', 'Suki')];

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

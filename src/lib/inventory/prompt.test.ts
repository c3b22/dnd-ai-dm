import { describe, it, expect } from 'vitest';
import { inventoryPrompt } from './prompt';
import type { Character } from '@/lib/character/types';

const prem: Character = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0 };

describe('inventoryPrompt', () => {
  it('is empty when there are no characters', () => {
    expect(inventoryPrompt([], {})).toEqual([]);
  });

  it("lists each player's items with equipped markers and weight, plus the catalog and tag rules", () => {
    const text = inventoryPrompt([prem], {
      p1: [
        { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true },
        { itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false },
        { itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false },
      ],
    }).join('\n');
    expect(text).toContain('Prem: ดาบสั้น (equipped), ยาฟื้นฟูเล็ก x2, Rusty Key; weight 4/10');
    expect(text).toContain('potion_major');
    expect(text).toContain('[[give: PlayerName | item_id]]');
    expect(text).toContain('[[give: PlayerName | story: Title]]');
    expect(text).toContain('[[take: PlayerName | item_id]]');
  });

  it('teaches the [[magic]] tag and rarity rules without listing magic item ids', () => {
    const text = inventoryPrompt([prem], {}).join(String.fromCharCode(10));
    expect(text).toContain('[[magic: PlayerName | uncommon]]');
    expect(text).toContain('weapon, armor, accessory, potion or scroll');
    expect(text).toContain('legendary only when a whole story arc ends');
    expect(text).toContain('Narrate the player receiving that item by name');
    expect(text).not.toContain('dagger_tamarind');
    expect(text).toContain('dagger');
  });

  it('shows an empty pack as nothing', () => {
    expect(inventoryPrompt([prem], {}).join('\n')).toContain('Prem: nothing; weight 0/10');
  });
});

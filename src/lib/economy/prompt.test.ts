import { describe, it, expect } from 'vitest';
import { economyPrompt } from './prompt';
import type { Character } from '@/lib/character/types';

const prem: Character = { id: 'p1', displayName: 'Prem', weaponId: null, hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 14 };

describe('economyPrompt', () => {
  it('is empty without characters', () => {
    expect(economyPrompt([], null)).toEqual([]);
  });

  it("shows each player's gold, the tag rules, and that no shop is open", () => {
    const text = economyPrompt([prem], null).join('\n');
    expect(text).toContain('Prem: 14 gold');
    expect(text).toContain('[[gold: PlayerName | small]]');
    expect(text).toContain('[[pay: PlayerName | small]]');
    expect(text).toContain('[[shop: Merchant Name | item_id, item_id]]');
    expect(text).toContain('[[shop_close]]');
    expect(text).toContain('No shop is open');
    expect(text.toLowerCase()).toContain('do not narrate prices');
  });

  it('names the open shop and what it sells', () => {
    const text = economyPrompt([prem], { name: 'Old Mara', itemIds: ['potion_minor', 'shortsword'] }).join('\n');
    expect(text).toContain('Old Mara');
    expect(text).toContain('potion_minor');
    expect(text).toContain('shortsword');
    expect(text).not.toContain('No shop is open');
  });
});

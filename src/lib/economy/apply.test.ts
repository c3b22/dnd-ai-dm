import { describe, it, expect } from 'vitest';
import { applyEconomyTags } from './apply';

const ones = () => 1; // small = 4, medium = 8, large = 16
const party = [
  { id: 'p1', displayName: 'Prem', gold: 20 },
  { id: 'p2', displayName: 'Suki', gold: 3 },
];

describe('applyEconomyTags gold and pay', () => {
  it('awards the rolled tier and logs it', () => {
    const result = applyEconomyTags(party, [{ kind: 'gold', name: 'prem', tier: 'medium' }], ones);
    expect(result.goldDeltas).toEqual({ p1: 8 });
    expect(result.changes).toEqual(['Prem ได้รับ 8 ทอง']);
  });

  it('deducts a pay tier but never more than the player has', () => {
    const result = applyEconomyTags(
      party,
      [{ kind: 'pay', name: 'Prem', tier: 'small' }, { kind: 'pay', name: 'Suki', tier: 'small' }],
      ones
    );
    expect(result.goldDeltas).toEqual({ p1: -4, p2: -3 });
    expect(result.changes).toEqual(['Prem เสียไป 4 ทอง', 'Suki จ่ายเท่าที่มี 3 ทอง']);
  });

  it('counts gold earned earlier in the same narration toward a later pay', () => {
    const result = applyEconomyTags(
      [{ id: 'p2', displayName: 'Suki', gold: 0 }],
      [{ kind: 'gold', name: 'Suki', tier: 'small' }, { kind: 'pay', name: 'Suki', tier: 'medium' }],
      ones
    );
    expect(result.goldDeltas).toEqual({ p2: 0 });
    expect(result.changes).toEqual(['Suki ได้รับ 4 ทอง', 'Suki จ่ายเท่าที่มี 4 ทอง']);
  });

  it('says nothing for a player who has no gold to pay, and ignores unknown or ambiguous names', () => {
    const broke = [{ id: 'p1', displayName: 'Prem', gold: 0 }, { id: 'p2', displayName: 'Prem', gold: 5 }];
    expect(applyEconomyTags(broke, [{ kind: 'pay', name: 'Prem', tier: 'small' }], ones).changes).toEqual([]);
    expect(applyEconomyTags(party, [{ kind: 'gold', name: 'Nobody', tier: 'small' }], ones).changes).toEqual([]);
  });
});

describe('applyEconomyTags shop', () => {
  it('opens a shop keeping only known buyable ids, deduplicated', () => {
    const result = applyEconomyTags(
      party,
      [{ kind: 'shop', merchant: 'Old Mara', itemIds: ['potion_minor', 'lightsaber', 'potion_minor', 'story'] }],
      ones
    );
    expect(result.shop).toEqual({ action: 'open', shop: { name: 'Old Mara', itemIds: ['potion_minor'] } });
  });

  it('ignores a shop with nothing sellable and a blank merchant name', () => {
    expect(applyEconomyTags(party, [{ kind: 'shop', merchant: 'Mara', itemIds: ['lightsaber'] }], ones).shop).toBeNull();
    expect(applyEconomyTags(party, [{ kind: 'shop', merchant: '  ', itemIds: ['staff'] }], ones).shop).toBeNull();
  });

  it('shortens a long merchant name to 40 characters', () => {
    const result = applyEconomyTags(party, [{ kind: 'shop', merchant: 'M'.repeat(60), itemIds: ['staff'] }], ones);
    expect(result.shop && result.shop.action === 'open' && result.shop.shop.name).toHaveLength(40);
  });

  it('lets the last shop tag win, and a close after an open cancels it', () => {
    const open = (name: string) => ({ kind: 'shop' as const, merchant: name, itemIds: ['staff'] });
    expect(applyEconomyTags(party, [open('A'), open('B')], ones).shop).toEqual({ action: 'open', shop: { name: 'B', itemIds: ['staff'] } });
    expect(applyEconomyTags(party, [open('A'), { kind: 'shop_close' }], ones).shop).toEqual({ action: 'close' });
  });
});

describe('applyEconomyTags lucky_purse', () => {
  const purse = (luckyPurse?: number) => ({ effects: ['lucky_purse' as const], setTheme: null, setSkillBonus: 0, luckyPurse });
  it('adds +2 by default to gold-tag rewards only', () => {
    const chars = [{ id: 'p1', displayName: 'Prem', gold: 20, itemEffects: purse() }];
    const r = applyEconomyTags(chars, [{ kind: 'gold', name: 'Prem', tier: 'small' }, { kind: 'pay', name: 'Prem', tier: 'small' }], ones);
    expect(r.goldDeltas).toEqual({ p1: 2 }); // +4+2 then -4
    expect(r.changes[0]).toBe('Prem ได้รับ 6 ทอง');
  });
  it('uses the per-item value and leaves non-wearers unchanged', () => {
    const chars = [
      { id: 'p1', displayName: 'Prem', gold: 0, itemEffects: purse(4) },
      { id: 'p2', displayName: 'Suki', gold: 0 },
    ];
    const r = applyEconomyTags(chars, [{ kind: 'gold', name: 'Prem', tier: 'small' }, { kind: 'gold', name: 'Suki', tier: 'small' }], ones);
    expect(r.goldDeltas).toEqual({ p1: 8, p2: 4 });
  });
});

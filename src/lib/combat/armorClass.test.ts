import { describe, it, expect } from 'vitest';
import { armorClass } from './armorClass';

const dex = (score: number) => ({ STR: 10, DEX: score, CON: 10, INT: 10, WIS: 10, CHA: 10 });

describe('armorClass', () => {
  it('is 10 plus DEX with no armor, and treats missing abilities as 10', () => {
    expect(armorClass({})).toBe(10);
    expect(armorClass({ abilities: dex(16) })).toBe(13);
    expect(armorClass({ abilities: dex(8) })).toBe(9);
  });
  it('light armor (reduction 1) is 12 + DEX with no cap', () => {
    expect(armorClass({ abilities: dex(10), armorReduction: 1, armorWeight: 1 })).toBe(12);
    expect(armorClass({ abilities: dex(18), armorReduction: 1, armorWeight: 1 })).toBe(16);
  });
  it('medium armor (reduction 2) is 14 + DEX capped at +2', () => {
    expect(armorClass({ abilities: dex(10), armorReduction: 2, armorWeight: 2 })).toBe(14);
    expect(armorClass({ abilities: dex(14), armorReduction: 2, armorWeight: 2 })).toBe(16);
    expect(armorClass({ abilities: dex(20), armorReduction: 2, armorWeight: 2 })).toBe(16);
  });
  it('heavy armor (reduction 3) is 16 and never adds DEX, but a negative DEX still hurts', () => {
    expect(armorClass({ abilities: dex(20), armorReduction: 3, armorWeight: 3 })).toBe(16);
    expect(armorClass({ abilities: dex(8), armorReduction: 3, armorWeight: 3 })).toBe(15);
  });
  it('magic armor with higher reduction gives more AC by itself', () => {
    expect(armorClass({ abilities: dex(10), armorReduction: 4, armorWeight: 1 })).toBe(18);
    expect(armorClass({ abilities: dex(10), armorReduction: 4, armorWeight: 3 })).toBe(18);
  });
});

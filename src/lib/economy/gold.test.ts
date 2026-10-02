import { describe, it, expect } from 'vitest';
import { GOLD_TIERS, STARTING_GOLD, rollGold } from './gold';

describe('gold', () => {
  it('starts everyone with 20', () => {
    expect(STARTING_GOLD).toBe(20);
  });

  it('rolls each tier from its dice', () => {
    const ones = () => 1;
    const max = (sides: number) => sides;
    expect(rollGold('small', ones)).toBe(4); // 2d4+2
    expect(rollGold('small', max)).toBe(10);
    expect(rollGold('medium', ones)).toBe(8); // 3d6+5
    expect(rollGold('medium', max)).toBe(23);
    expect(rollGold('large', ones)).toBe(16); // 6d6+10
    expect(rollGold('large', max)).toBe(46);
    expect(Object.keys(GOLD_TIERS)).toEqual(['small', 'medium', 'large']);
  });
});

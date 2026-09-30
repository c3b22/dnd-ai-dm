import { describe, it, expect } from 'vitest';
import { rollDice, randomDie } from './dice';

describe('rollDice', () => {
  it('sums each die plus the bonus', () => {
    const rolls = [3, 5];
    expect(rollDice({ count: 2, sides: 6, bonus: 1 }, () => rolls.shift()!)).toBe(9);
  });

  it('rolls the requested number of sides', () => {
    const seen: number[] = [];
    rollDice({ count: 1, sides: 8, bonus: 0 }, (sides) => {
      seen.push(sides);
      return 1;
    });
    expect(seen).toEqual([8]);
  });
});

describe('randomDie', () => {
  it('stays within 1..sides', () => {
    for (let i = 0; i < 200; i++) {
      const value = randomDie(4);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
    }
  });
});

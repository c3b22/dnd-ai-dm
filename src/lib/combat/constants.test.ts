import { describe, expect, it } from 'vitest';
import { ENEMY_ATTACK_BONUS, ENEMY_DAMAGE_DICE, TIER_PIPS } from './constants';

describe('I6 tuned combat numbers', () => {
  it('pips per tier are 2 / 4 / 6 / 10', () => {
    expect(TIER_PIPS).toEqual({ minion: 2, normal: 4, strong: 6, boss: 10 });
  });
  it('enemy attack bonus is +3 / +5 / +6 / +9', () => {
    expect(ENEMY_ATTACK_BONUS).toEqual({ minion: 3, normal: 5, strong: 6, boss: 9 });
  });
  it('enemy damage dice: minion 1d4, normal 1d8+2, strong 2d6+3, boss 3d6+4', () => {
    expect(ENEMY_DAMAGE_DICE).toEqual({
      minion: { count: 1, sides: 4, bonus: 0 },
      normal: { count: 1, sides: 8, bonus: 2 },
      strong: { count: 2, sides: 6, bonus: 3 },
      boss: { count: 3, sides: 6, bonus: 4 },
    });
  });
});

import { describe, it, expect } from 'vitest';
import { aggregateEffects, SET_SKILL_BONUS } from './effects';

describe('aggregateEffects', () => {
  it('returns an empty result for nothing worn or items without effects', () => {
    expect(aggregateEffects([])).toEqual({ effects: [], setTheme: null, setSkillBonus: 0 });
    expect(aggregateEffects([{ slot: 'weapon' }, { slot: 'armor', theme: 'เงา' }])).toEqual({ effects: [], setTheme: null, setSkillBonus: 0 });
  });

  it('collects each effect once even when worn on several items', () => {
    const r = aggregateEffects([
      { slot: 'weapon', effect: 'lifesteal' },
      { slot: 'armor', effect: 'ward' },
      { slot: 'accessory', effect: 'lifesteal' },
    ]);
    expect(r.effects).toEqual(['lifesteal', 'ward']);
  });

  it('grants the set bonus only when weapon, armor and accessory share one theme', () => {
    const full = aggregateEffects([
      { slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }, { slot: 'accessory', theme: 'เงา' },
    ]);
    expect(full).toMatchObject({ setTheme: 'เงา', setSkillBonus: SET_SKILL_BONUS });
    expect(aggregateEffects([{ slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }]).setTheme).toBeNull();
    expect(aggregateEffects([
      { slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'มิธริล' }, { slot: 'accessory', theme: 'เงา' },
    ]).setTheme).toBeNull();
    expect(aggregateEffects([
      { slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }, { slot: 'accessory' },
    ]).setTheme).toBeNull();
  });
});

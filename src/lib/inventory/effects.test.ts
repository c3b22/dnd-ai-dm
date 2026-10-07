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

describe('keen_eye value (F5j3)', () => {
  it('defaults to 1, takes the strongest worn value once, clamps to 1-2, absent without keen_eye', async () => {
    const { aggregateEffects } = await import('./effects');
    expect(aggregateEffects([{ slot: 'weapon', effect: 'keen_eye' }]).keenEye).toBe(1);
    expect(aggregateEffects([{ slot: 'weapon', effect: 'keen_eye', effectValue: 1 }, { slot: 'accessory', effect: 'keen_eye', effectValue: 2 }]).keenEye).toBe(2);
    expect(aggregateEffects([{ slot: 'weapon', effect: 'keen_eye', effectValue: 5 }]).keenEye).toBe(2);
    expect('keenEye' in aggregateEffects([{ slot: 'weapon', effect: 'lifesteal' }])).toBe(false);
  });
});

describe('ward value (F5j4)', () => {
  it('defaults to 2, strongest worn value, clamps to 2-3, absent without ward', async () => {
    const { aggregateEffects } = await import('./effects');
    expect(aggregateEffects([{ slot: 'armor', effect: 'ward' }]).ward).toBe(2);
    expect(aggregateEffects([{ slot: 'armor', effect: 'ward', effectValue: 3 }]).ward).toBe(3);
    expect(aggregateEffects([{ slot: 'armor', effect: 'ward', effectValue: 9 }]).ward).toBe(3);
    expect('ward' in aggregateEffects([{ slot: 'armor', effect: 'keen_eye' }])).toBe(false);
  });
});

describe('deep_pack value (F5j5)', () => {
  it('defaults to 3, strongest worn value, clamps to 3-5, absent without deep_pack', async () => {
    const { aggregateEffects } = await import('./effects');
    expect(aggregateEffects([{ slot: 'accessory', effect: 'deep_pack' }]).deepPack).toBe(3);
    expect(aggregateEffects([{ slot: 'accessory', effect: 'deep_pack', effectValue: 4 }]).deepPack).toBe(4);
    expect(aggregateEffects([{ slot: 'accessory', effect: 'deep_pack', effectValue: 9 }]).deepPack).toBe(5);
    expect('deepPack' in aggregateEffects([{ slot: 'accessory', effect: 'ward' }])).toBe(false);
  });
});

describe('aggregateEffects lucky_purse', () => {
  it('defaults to 2 and takes the strongest worn value', () => {
    expect(aggregateEffects([{ slot: 'accessory', effect: 'lucky_purse' }]).luckyPurse).toBe(2);
    expect(aggregateEffects([{ slot: 'accessory', effect: 'lucky_purse', effectValue: 4 }, { slot: 'weapon', effect: 'lucky_purse', effectValue: 3 }]).luckyPurse).toBe(4);
    expect(aggregateEffects([{ slot: 'accessory' }]).luckyPurse).toBeUndefined();
  });
});

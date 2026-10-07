import { describe, it, expect } from 'vitest';
import { resolveCheck } from './check';

const base = { ability: 10, proficient: false, level: 1, dc: 10 } as const;

describe('resolveCheck', () => {
  it('adds ability modifier (from score) to the d20', () => {
    expect(resolveCheck({ ...base, d20s: [10], ability: 14 }).total).toBe(12);
    expect(resolveCheck({ ...base, d20s: [10], ability: 8 }).total).toBe(9);
  });

  it('adds proficiency bonus by level only when proficient', () => {
    expect(resolveCheck({ ...base, d20s: [10], proficient: true, level: 1 }).total).toBe(12);
    expect(resolveCheck({ ...base, d20s: [10], proficient: true, level: 5 }).total).toBe(13);
    expect(resolveCheck({ ...base, d20s: [10], proficient: false, level: 5 }).total).toBe(10);
  });

  it('succeeds when total >= dc', () => {
    expect(resolveCheck({ ...base, d20s: [10], dc: 10 }).success).toBe(true);
    expect(resolveCheck({ ...base, d20s: [9], dc: 10 }).success).toBe(false);
    expect(resolveCheck({ ...base, d20s: [10] }).critical).toBeNull();
  });

  it('nat 20 always succeeds with critical success', () => {
    const r = resolveCheck({ ...base, d20s: [20], ability: 1, dc: 40 });
    expect(r).toMatchObject({ success: true, critical: 'success', total: 20 + abilityMod1() });
  });

  it('nat 1 always fails with critical failure', () => {
    const r = resolveCheck({ ...base, d20s: [1], ability: 20, proficient: true, level: 10, dc: 2 });
    expect(r).toMatchObject({ success: false, critical: 'failure' });
  });

  it('advantage takes the higher die, disadvantage the lower', () => {
    expect(resolveCheck({ ...base, d20s: [4, 15], advantage: 'advantage' }).total).toBe(15);
    expect(resolveCheck({ ...base, d20s: [4, 15], advantage: 'disadvantage' }).total).toBe(4);
  });

  it('applies nat rule to the chosen die', () => {
    expect(resolveCheck({ ...base, d20s: [1, 20], advantage: 'advantage' }).critical).toBe('success');
    expect(resolveCheck({ ...base, d20s: [1, 20], advantage: 'disadvantage' }).critical).toBe('failure');
  });

  it('uses only the first die without advantage', () => {
    expect(resolveCheck({ ...base, d20s: [3, 18] }).total).toBe(3);
    expect(resolveCheck({ ...base, d20s: [3, 18], advantage: 'none' }).total).toBe(3);
  });

  it('throws on missing dice or invalid d20', () => {
    expect(() => resolveCheck({ ...base, d20s: [] })).toThrow();
    expect(() => resolveCheck({ ...base, d20s: [5], advantage: 'advantage' })).toThrow();
    expect(() => resolveCheck({ ...base, d20s: [21] })).toThrow();
    expect(() => resolveCheck({ ...base, d20s: [0] })).toThrow();
    expect(() => resolveCheck({ ...base, d20s: [1.5] })).toThrow();
  });
});

function abilityMod1() {
  return -5; // score 1 -> floor(-9/2) = -5
}

describe('resolveCheck bonus (F5d)', () => {
  it('adds a flat bonus to the total', () => {
    expect(resolveCheck({ ...base, d20s: [10], bonus: 2 }).total).toBe(12);
    expect(resolveCheck({ ...base, d20s: [8], dc: 10, bonus: 2 }).success).toBe(true);
  });
});

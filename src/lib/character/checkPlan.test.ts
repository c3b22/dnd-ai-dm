import { describe, it, expect } from 'vitest';
import { parseCheckPlan, runChecks } from './checkPlan';
import type { Character } from './types';
import { aggregateEffects } from '@/lib/inventory/effects';

describe('parseCheckPlan', () => {
  it('reads a checks plan, clamping dc and defaulting advantage', () => {
    const plan = parseCheckPlan('{"checks":[{"player":"Prem","skill":"stealth","dc":14,"advantage":"advantage"},{"player":"Nok","skill":"athletics","dc":99}]}');
    expect(plan).toEqual({
      kind: 'checks',
      checks: [
        { player: 'Prem', skill: 'stealth', dc: 14, advantage: 'advantage' },
        { player: 'Nok', skill: 'athletics', dc: 30, advantage: 'none' },
      ],
      attacks: [],
    });
  });
  it('reads attacks (alone or with checks) and drops malformed ones', () => {
    expect(parseCheckPlan('{"attacks":[{"player":"Prem","target":"หมาป่า","advantage":"disadvantage"},{"player":"Nok"},{"target":"x"}]}')).toEqual({
      kind: 'checks',
      checks: [],
      attacks: [{ player: 'Prem', target: 'หมาป่า', advantage: 'disadvantage' }],
    });
    expect(parseCheckPlan('{"attacks":[{"player":"Prem"}]}')).toEqual({ kind: 'invalid' });
  });
  it('reads a narration plan, also inside a code fence', () => {
    expect(parseCheckPlan('```json\n{"narration":"ประตูเปิดออก"}\n```')).toEqual({ kind: 'narration', text: 'ประตูเปิดออก' });
  });
  it('drops checks with an unknown skill and falls to invalid when none remain', () => {
    expect(parseCheckPlan('{"checks":[{"player":"Prem","skill":"hacking","dc":10}]}')).toEqual({ kind: 'invalid' });
  });
  it('treats text that is not JSON at all as plain narration', () => {
    expect(parseCheckPlan('เรื่องเล่าปกติ [[hurt: Prem | light]]')).toEqual({ kind: 'plain', text: 'เรื่องเล่าปกติ [[hurt: Prem | light]]' });
  });
  it('marks broken JSON as invalid', () => {
    expect(parseCheckPlan('{"checks":[{"player":')).toEqual({ kind: 'invalid' });
    expect(parseCheckPlan('{"foo":1}')).toEqual({ kind: 'invalid' });
  });
});

describe('runChecks', () => {
  const rogue: Character = {
    id: 'p1', displayName: 'Prem', weaponId: 'dagger', hp: 10, maxHp: 10, status: 'active',
    revivesSinceSanctuary: 0, classId: 'rogue', xp: 0, abilities: { STR: 8, DEX: 16, CON: 13, INT: 12, WIS: 10, CHA: 14 },
  };
  it('rolls with modifier and proficiency and resolves success', () => {
    const rolls = [10];
    const [r] = runChecks([{ player: 'prem', skill: 'stealth', dc: 15, advantage: 'none' }], [rogue], () => rolls.shift()!);
    expect(r).toMatchObject({ playerDisplayName: 'Prem', die: 10, modifier: 3, proficiency: 2, total: 15, success: true, dice: [10] });
  });
  it('rolls two dice for advantage and ignores unknown players and repeats', () => {
    const rolls = [3, 18];
    const out = runChecks(
      [
        { player: 'Prem', skill: 'stealth', dc: 25, advantage: 'advantage' },
        { player: 'Prem', skill: 'stealth', dc: 5, advantage: 'none' },
        { player: 'Ghost', skill: 'stealth', dc: 5, advantage: 'none' },
      ],
      [rogue],
      () => rolls.shift()!
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dice: [3, 18], die: 18, total: 23, success: false });
  });
});

describe('runChecks with an accessory bonus (F5d)', () => {
  const rogue: Character = {
    id: 'p1', displayName: 'Prem', weaponId: 'dagger', hp: 10, maxHp: 10, status: 'active',
    revivesSinceSanctuary: 0, classId: 'rogue', xp: 0, abilities: { STR: 8, DEX: 16, CON: 13, INT: 12, WIS: 10, CHA: 14 },
    skillBonuses: { stealth: 2 },
  };
  const plan = (skill: 'stealth' | 'athletics') => [{ player: 'Prem', skill, dc: 15, advantage: 'none' as const }];

  it('adds the bonus to a matching skill and can turn a miss into a success', () => {
    const [r] = runChecks(plan('stealth'), [rogue], () => 8);
    expect(r).toMatchObject({ itemBonus: 2, total: 8 + 3 + 2 + 2, success: true });
    const [without] = runChecks(plan('stealth'), [{ ...rogue, skillBonuses: undefined }], () => 8);
    expect(without).toMatchObject({ itemBonus: 0, total: 13, success: false });
  });

  it('gives nothing for a different skill', () => {
    const [r] = runChecks(plan('athletics'), [rogue], () => 8);
    expect(r).toMatchObject({ itemBonus: 0, total: 8 - 1 });
  });
});

describe('runChecks with a complete set bonus (F5j8 X9)', () => {
  const base: Character = {
    id: 'p1', displayName: 'Prem', weaponId: 'dagger', hp: 10, maxHp: 10, status: 'active',
    revivesSinceSanctuary: 0, classId: 'rogue', xp: 0, abilities: { STR: 8, DEX: 16, CON: 13, INT: 12, WIS: 10, CHA: 14 },
  };
  const plan = (skill: 'stealth' | 'athletics') => [{ player: 'Prem', skill, dc: 15, advantage: 'none' as const }];
  const full = aggregateEffects([
    { slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }, { slot: 'accessory', theme: 'เงา' },
  ]);

  it('adds +1 to every skill check with a full set', () => {
    for (const skill of ['stealth', 'athletics'] as const) {
      const [without] = runChecks(plan(skill), [base], () => 8);
      const [r] = runChecks(plan(skill), [{ ...base, itemEffects: full }], () => 8);
      expect(r).toMatchObject({ itemBonus: 1, total: without.total + 1 });
    }
  });

  it('stacks once with the accessory bonus, not twice', () => {
    const [r] = runChecks(plan('stealth'), [{ ...base, skillBonuses: { stealth: 2 }, itemEffects: full }], () => 8);
    expect(r).toMatchObject({ itemBonus: 3, total: 8 + 3 + 2 + 2 + 1 });
  });

  it('gives nothing when one slot is missing', () => {
    const fx = aggregateEffects([{ slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }]);
    const [r] = runChecks(plan('stealth'), [{ ...base, itemEffects: fx }], () => 8);
    expect(r).toMatchObject({ itemBonus: 0, total: 13 });
  });

  it('gives nothing when two themes are mixed', () => {
    const fx = aggregateEffects([{ slot: 'weapon', theme: 'เงา' }, { slot: 'armor', theme: 'เงา' }, { slot: 'accessory', theme: 'ไฟ' }]);
    const [r] = runChecks(plan('stealth'), [{ ...base, itemEffects: fx }], () => 8);
    expect(r).toMatchObject({ itemBonus: 0, total: 13 });
  });
});

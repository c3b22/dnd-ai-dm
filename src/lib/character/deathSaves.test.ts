import { describe, it, expect } from 'vitest';
import {
  DEATH_SAVE_DC,
  EMPTY_DEATH_SAVES,
  normalizeDeathSaves,
  resolveDeathSave,
  runDeathSaves,
  settleDeathSaves,
  onDeathSavesFailed,
} from './deathSaves';
import type { Character } from './types';

const down = (over: Partial<Character> = {}): Character => ({
  id: 'p1', displayName: 'Aria', weaponId: null, hp: 0, maxHp: 10, status: 'downed', revivesSinceSanctuary: 0, ...over,
});

describe('normalizeDeathSaves', () => {
  it('treats missing or junk values as empty', () => {
    expect(normalizeDeathSaves(null)).toEqual(EMPTY_DEATH_SAVES);
    expect(normalizeDeathSaves('x')).toEqual(EMPTY_DEATH_SAVES);
    expect(normalizeDeathSaves({ successes: 9, failures: -2, stable: 1 })).toEqual({ successes: 3, failures: 0, stable: false, dead: false });
    expect(normalizeDeathSaves({ successes: 2, failures: 1, stable: true, dead: true })).toEqual({ successes: 2, failures: 1, stable: true, dead: true });
  });
});

describe('resolveDeathSave', () => {
  it('uses DC 10: 10+ passes, below fails', () => {
    expect(DEATH_SAVE_DC).toBe(10);
    expect(resolveDeathSave(EMPTY_DEATH_SAVES, 10)).toMatchObject({ outcome: 'pass', saves: { successes: 1, failures: 0 } });
    expect(resolveDeathSave(EMPTY_DEATH_SAVES, 9)).toMatchObject({ outcome: 'fail', saves: { successes: 0, failures: 1 } });
  });
  it('nat 1 counts as two failures', () => {
    const r = resolveDeathSave(EMPTY_DEATH_SAVES, 1);
    expect(r.saves.failures).toBe(2);
    expect(r.outcome).toBe('fail');
    expect(r.check.critical).toBe('failure');
  });
  it('nat 20 recovers with 1 HP and clears the tally', () => {
    const r = resolveDeathSave({ successes: 1, failures: 2, stable: false, dead: false }, 20);
    expect(r.outcome).toBe('recovered');
    expect(r.saves).toEqual(EMPTY_DEATH_SAVES);
  });
  it('3 successes stabilise', () => {
    const r = resolveDeathSave({ successes: 2, failures: 1, stable: false, dead: false }, 15);
    expect(r.outcome).toBe('stable');
    expect(r.saves).toMatchObject({ successes: 3, stable: true, dead: false });
  });
  it('3 failures die (nat 1 on 2 failures overshoots to 3)', () => {
    expect(resolveDeathSave({ successes: 0, failures: 2, stable: false, dead: false }, 5).outcome).toBe('dead');
    const r = resolveDeathSave({ successes: 0, failures: 2, stable: false, dead: false }, 1);
    expect(r.outcome).toBe('dead');
    expect(r.saves).toMatchObject({ failures: 3, dead: true });
  });
});

describe('runDeathSaves', () => {
  it('rolls only downed characters that are neither stable nor dead', () => {
    const chars = [
      down({ id: 'a', displayName: 'A' }),
      down({ id: 'b', displayName: 'B', deathSaves: { successes: 3, failures: 0, stable: true, dead: false } }),
      down({ id: 'c', displayName: 'C', deathSaves: { successes: 0, failures: 3, stable: false, dead: true } }),
      down({ id: 'd', displayName: 'D', status: 'active', hp: 5 }),
    ];
    const rolls: number[] = [12];
    const r = runDeathSaves(chars, () => rolls.shift()!);
    expect(r.outcomes.map((o) => o.playerDisplayName)).toEqual(['A']);
    expect(r.characters[0].deathSaves).toMatchObject({ successes: 1 });
    expect(r.characters[3]).toEqual(chars[3]);
    expect(r.changes[0]).toContain('A');
  });
  it('nat 20 makes the character active with 1 HP', () => {
    const r = runDeathSaves([down()], () => 20);
    expect(r.characters[0]).toMatchObject({ status: 'active', hp: 1 });
    expect(r.characters[0].deathSaves).toBeNull();
  });
  it('third failure stays downed (revivable) and calls the single failure hook', () => {
    const c = down({ deathSaves: { successes: 0, failures: 2, stable: false, dead: false } });
    const r = runDeathSaves([c], () => 2);
    expect(r.characters[0].status).toBe('downed');
    expect(r.characters[0].deathSaves?.dead).toBe(true);
    expect(r.characters[0].hp).toBe(0);
    expect(r.died).toEqual(['p1']);
    expect(onDeathSavesFailed(r.characters[0]).changes[0]).toContain('Aria');
  });
  it('outcome carries the display fields for the dice overlay', () => {
    const r = runDeathSaves([down()], () => 14);
    expect(r.outcomes[0]).toMatchObject({ die: 14, dc: 10, total: 14, success: true });
  });
});

describe('F5g revive charm', () => {
  const failing = { successes: 0, failures: 2, stable: false, dead: false };
  it('a worn charm revives at its HP on the third failure and is reported spent', () => {
    const c = down({ deathSaves: failing, reviveCharm: { itemId: 'charm_revive', reviveHp: 1 } });
    const r = runDeathSaves([c], () => 2);
    expect(r.characters[0]).toMatchObject({ status: 'active', hp: 1, deathSaves: null, reviveCharm: null });
    expect(r.died).toEqual([]);
    expect(r.charmsSpent).toEqual([{ characterId: 'p1', itemId: 'charm_revive' }]);
    expect(r.changes.join(' ')).toContain('เครื่องราง');
  });
  it('revive HP is capped at max HP', () => {
    const c = down({ maxHp: 2, deathSaves: failing, reviveCharm: { itemId: 'charm_crossing', reviveHp: 3 } });
    expect(runDeathSaves([c], () => 2).characters[0].hp).toBe(2);
  });
  it('without a charm behaviour is unchanged', () => {
    const r = runDeathSaves([down({ deathSaves: failing })], () => 2);
    expect(r.characters[0]).toMatchObject({ status: 'downed', hp: 0 });
    expect(r.characters[0].deathSaves?.dead).toBe(true);
    expect(r.died).toEqual(['p1']);
    expect(r.charmsSpent).toEqual([]);
  });
  it('a charm does nothing before the third failure', () => {
    const r = runDeathSaves([down({ reviveCharm: { itemId: 'charm_revive', reviveHp: 1 } })], () => 5);
    expect(r.characters[0].status).toBe('downed');
    expect(r.charmsSpent).toEqual([]);
  });
  it('onDeathSavesFailed reports the revive', () => {
    const out = onDeathSavesFailed(down({ reviveCharm: { itemId: 'charm_phoenix', reviveHp: 2 } }));
    expect(out.revive).toEqual({ itemId: 'charm_phoenix', hp: 2 });
    expect(onDeathSavesFailed(down()).revive).toBeUndefined();
  });
});

describe('settleDeathSaves', () => {
  it('clears the tally of anyone who is active again', () => {
    const out = settleDeathSaves([
      down({ status: 'active', hp: 5, deathSaves: { successes: 1, failures: 1, stable: false, dead: false } }),
      down({ id: 'q', deathSaves: { successes: 1, failures: 0, stable: false, dead: false } }),
    ]);
    expect(out[0].deathSaves).toBeNull();
    expect(out[1].deathSaves?.successes).toBe(1);
  });
});

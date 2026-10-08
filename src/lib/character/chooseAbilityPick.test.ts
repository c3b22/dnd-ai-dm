import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AbilityPickError, chooseAbilityPick } from './chooseAbilityPick';

function fakeSupabase(opts: { row?: Record<string, unknown> | null; columnMissing?: boolean; updateRows?: unknown[] }) {
  const updates: unknown[] = [];
  const guards: unknown[] = [];
  const result = () => Promise.resolve({ data: opts.updateRows ?? [{ id: 'p1' }], error: null });
  const client = {
    from: () => ({
      select: (cols: string) => {
        const missing = opts.columnMissing && cols.includes('ability_picks');
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(missing ? { data: null, error: { message: 'column players.ability_picks does not exist' } } : { data: opts.row ?? null, error: null }),
            }),
          }),
        };
      },
      update: (payload: unknown) => {
        updates.push(payload);
        return {
          eq: () => ({
            is: (column: string, value: unknown) => {
              guards.push([column, value]);
              return { select: result };
            },
            select: result,
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, updates, guards };
}

const lv6 = { id: 'p1', xp: 600, class_id: 'warrior', ability_picks: null };
const params = { campaignId: 'c1', userId: 'u1', abilityId: 'warrior_war_cry' as unknown };

const fails = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return e as AbilityPickError;
  }
  throw new Error('expected a rejection');
};

describe('chooseAbilityPick (K6)', () => {
  it('writes the level 6 pick of the caller own character, guarded by "ability_picks is null" on the first pick', async () => {
    const { client, updates, guards } = fakeSupabase({ row: lv6 });
    expect(await chooseAbilityPick(client, params)).toEqual({ abilityId: 'warrior_war_cry', level: 6, abilityPicks: { '6': 'warrior_war_cry' } });
    expect(updates).toEqual([{ ability_picks: { '6': 'warrior_war_cry' } }]);
    expect(guards).toEqual([['ability_picks', null]]);
  });

  it('adds the level 9 pick next to the level 6 one without touching it', async () => {
    const { client, updates, guards } = fakeSupabase({ row: { ...lv6, xp: 1320, ability_picks: { '6': 'warrior_war_cry' } } });
    const r = await chooseAbilityPick(client, { ...params, abilityId: 'warrior_sweep' });
    expect(r.abilityPicks).toEqual({ '6': 'warrior_war_cry', '9': 'warrior_sweep' });
    expect(updates).toEqual([{ ability_picks: { '6': 'warrior_war_cry', '9': 'warrior_sweep' } }]);
    expect(guards).toEqual([]);
  });

  it('forbids a user with no player in the campaign', async () => {
    const e = await fails(chooseAbilityPick(fakeSupabase({ row: null }).client, params));
    expect([e.code, e.status]).toEqual(['forbidden', 403]);
  });

  it('refuses below the level of the ability and allows it from that level on (choosing late is fine)', async () => {
    const low = await fails(chooseAbilityPick(fakeSupabase({ row: { ...lv6, xp: 599 } }).client, params));
    expect([low.code, low.status]).toEqual(['level_too_low', 409]);
    const lowNine = await fails(chooseAbilityPick(fakeSupabase({ row: { ...lv6, xp: 1319 } }).client, { ...params, abilityId: 'warrior_sweep' }));
    expect(lowNine.code).toBe('level_too_low');
    expect((await chooseAbilityPick(fakeSupabase({ row: { ...lv6, xp: 1620 } }).client, params)).level).toBe(6);
  });

  it('only once per level: a second pick for the same level is refused and nothing is written', async () => {
    const { client, updates } = fakeSupabase({ row: { ...lv6, ability_picks: { '6': 'warrior_stone_skin' } } });
    const e = await fails(chooseAbilityPick(client, params));
    expect([e.code, e.status]).toEqual(['already_chosen', 409]);
    expect(updates).toEqual([]);
  });

  it('refuses an unknown ability and an ability of another class', async () => {
    const unknown = await fails(chooseAbilityPick(fakeSupabase({ row: lv6 }).client, { ...params, abilityId: 'warrior_god' }));
    expect([unknown.code, unknown.status]).toEqual(['invalid_ability', 400]);
    const missing = await fails(chooseAbilityPick(fakeSupabase({ row: lv6 }).client, { ...params, abilityId: undefined }));
    expect(missing.code).toBe('invalid_ability');
    const other = await fails(chooseAbilityPick(fakeSupabase({ row: lv6 }).client, { ...params, abilityId: 'mage_meteor' }));
    expect([other.code, other.status]).toEqual(['wrong_class', 400]);
  });

  it('conflict when a concurrent first pick made the guarded update match nothing', async () => {
    const e = await fails(chooseAbilityPick(fakeSupabase({ row: lv6, updateRows: [] }).client, params));
    expect([e.code, e.status]).toEqual(['conflict', 409]);
  });

  it('writes nothing when the ability_picks column does not exist yet', async () => {
    const { client, updates } = fakeSupabase({ row: lv6, columnMissing: true });
    const e = await fails(chooseAbilityPick(client, params));
    expect([e.code, e.status]).toEqual(['unavailable', 409]);
    expect(updates).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { spendAbilityChoice, AbilityChoiceError } from './spendAbilityChoice';

const ABIL = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 19 };

function fakeSupabase(opts: {
  row?: Record<string, unknown> | null;
  columnMissing?: boolean;
  updateRows?: unknown[];
}) {
  const updates: unknown[] = [];
  const selects: string[] = [];
  const client = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        const missing = opts.columnMissing && cols.includes('ability_choices_used');
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  missing
                    ? { data: null, error: { message: 'column players.ability_choices_used does not exist' } }
                    : { data: opts.row ?? null, error: null }
                ),
            }),
          }),
        };
      },
      update: (payload: unknown) => {
        updates.push(payload);
        return {
          eq: () => ({
            eq: () => ({
              select: () => Promise.resolve({ data: opts.updateRows ?? [{ id: 'p1' }], error: null }),
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, updates, selects };
}

const params = { campaignId: 'c1', userId: 'u1', choice: { kind: 'double', ability: 'STR' } as const };
const player = { id: 'p1', xp: 420, abilities: ABIL, ability_choices_used: 0 }; // level 4

describe('spendAbilityChoice', () => {
  it('writes abilities and ability_choices_used together', async () => {
    const { client, updates } = fakeSupabase({ row: player });
    const result = await spendAbilityChoice(client, params);
    expect(result.abilities.STR).toBe(12);
    expect(result.remaining).toBe(0);
    expect(updates).toEqual([{ abilities: { ...ABIL, STR: 12 }, ability_choices_used: 1 }]);
  });

  it('forbids a user with no player in the campaign', async () => {
    const { client } = fakeSupabase({ row: null });
    await expect(spendAbilityChoice(client, params)).rejects.toMatchObject({ status: 403 });
  });

  it('409 when no improvement is left', async () => {
    const low = fakeSupabase({ row: { ...player, xp: 0 } });
    await expect(spendAbilityChoice(low.client, params)).rejects.toMatchObject({ status: 409, code: 'no_choice_available' });
    const spent = fakeSupabase({ row: { ...player, ability_choices_used: 1 } });
    await expect(spendAbilityChoice(spent.client, params)).rejects.toMatchObject({ status: 409 });
    expect(spent.updates).toEqual([]);
  });

  it('400 when the choice would exceed 20, writing nothing', async () => {
    const { client, updates } = fakeSupabase({ row: player });
    const err = await spendAbilityChoice(client, { ...params, choice: { kind: 'double', ability: 'CHA' } }).catch((e) => e);
    expect(err).toBeInstanceOf(AbilityChoiceError);
    expect(err.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('409 conflict when the guarded update matches no row', async () => {
    const { client } = fakeSupabase({ row: player, updateRows: [] });
    await expect(spendAbilityChoice(client, params)).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('does not write when ability_choices_used column is missing', async () => {
    const { client, updates, selects } = fakeSupabase({ row: player, columnMissing: true });
    await expect(spendAbilityChoice(client, params)).rejects.toMatchObject({ status: 409, code: 'unavailable' });
    expect(updates).toEqual([]);
    expect(selects).toHaveLength(2);
  });

  it('treats a missing abilities value as all 10s', async () => {
    const { client } = fakeSupabase({ row: { ...player, abilities: null } });
    const r = await spendAbilityChoice(client, { ...params, choice: { kind: 'split', abilities: ['DEX', 'WIS'] } });
    expect(r.abilities).toMatchObject({ DEX: 11, WIS: 11, STR: 10 });
  });
});

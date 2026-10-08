import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chooseSubclass, SubclassChoiceError } from './chooseSubclass';

function fakeSupabase(opts: { row?: Record<string, unknown> | null; columnMissing?: boolean; updateRows?: unknown[] }) {
  const updates: unknown[] = [];
  const guards: unknown[] = [];
  const client = {
    from: () => ({
      select: (cols: string) => {
        const missing = opts.columnMissing && cols.includes('subclass_id');
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(missing ? { data: null, error: { message: 'column players.subclass_id does not exist' } } : { data: opts.row ?? null, error: null }),
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
              return { select: () => Promise.resolve({ data: opts.updateRows ?? [{ id: 'p1' }], error: null }) };
            },
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, updates, guards };
}

const params = { campaignId: 'c1', userId: 'u1', subclassId: 'warrior_guardian' as unknown };
const lv3 = { id: 'p1', xp: 150, class_id: 'warrior', subclass_id: null };

const fails = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return e as SubclassChoiceError;
  }
  throw new Error('expected a rejection');
};

describe('chooseSubclass (K5)', () => {
  it('writes the subclass of the caller own character, guarded by "subclass_id is null"', async () => {
    const { client, updates, guards } = fakeSupabase({ row: lv3 });
    expect(await chooseSubclass(client, params)).toEqual({ subclassId: 'warrior_guardian' });
    expect(updates).toEqual([{ subclass_id: 'warrior_guardian' }]);
    expect(guards).toEqual([['subclass_id', null]]);
  });

  it('forbids a user with no player in the campaign (only the owner of a character can choose)', async () => {
    const e = await fails(chooseSubclass(fakeSupabase({ row: null }).client, params));
    expect([e.code, e.status]).toEqual(['forbidden', 403]);
  });

  it('refuses below level 3 and allows from level 3', async () => {
    const low = await fails(chooseSubclass(fakeSupabase({ row: { ...lv3, xp: 149 } }).client, params));
    expect([low.code, low.status]).toEqual(['level_too_low', 409]);
    expect(await chooseSubclass(fakeSupabase({ row: { ...lv3, xp: 150 } }).client, params)).toEqual({ subclassId: 'warrior_guardian' });
    // choosing late is fine
    expect(await chooseSubclass(fakeSupabase({ row: { ...lv3, xp: 1620 } }).client, params)).toEqual({ subclassId: 'warrior_guardian' });
  });

  it('only once: a second choice is refused and nothing is written', async () => {
    const { client, updates } = fakeSupabase({ row: { ...lv3, subclass_id: 'warrior_berserker' } });
    const e = await fails(chooseSubclass(client, params));
    expect([e.code, e.status]).toEqual(['already_chosen', 409]);
    expect(updates).toEqual([]);
  });

  it('refuses an unknown subclass and a subclass of another class', async () => {
    const unknown = await fails(chooseSubclass(fakeSupabase({ row: lv3 }).client, { ...params, subclassId: 'warrior_god' }));
    expect([unknown.code, unknown.status]).toEqual(['invalid_subclass', 400]);
    const missing = await fails(chooseSubclass(fakeSupabase({ row: lv3 }).client, { ...params, subclassId: undefined }));
    expect(missing.code).toBe('invalid_subclass');
    const other = await fails(chooseSubclass(fakeSupabase({ row: lv3 }).client, { ...params, subclassId: 'mage_evoker' }));
    expect([other.code, other.status]).toEqual(['wrong_class', 400]);
  });

  it('conflict when a concurrent choice made the guarded update match nothing', async () => {
    const e = await fails(chooseSubclass(fakeSupabase({ row: lv3, updateRows: [] }).client, params));
    expect([e.code, e.status]).toEqual(['conflict', 409]);
  });

  it('writes nothing when the subclass_id column does not exist yet', async () => {
    const { client, updates } = fakeSupabase({ row: lv3, columnMissing: true });
    const e = await fails(chooseSubclass(client, params));
    expect([e.code, e.status]).toEqual(['unavailable', 409]);
    expect(updates).toEqual([]);
  });
});

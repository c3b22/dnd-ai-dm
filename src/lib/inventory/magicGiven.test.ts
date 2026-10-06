import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMagicGiven, persistMagicGiven } from './magicGiven';

const selecting = (result: unknown) =>
  ({ from: vi.fn(() => ({ select: () => ({ eq: () => Promise.resolve(result) }) })) }) as unknown as SupabaseClient;

describe('loadMagicGiven', () => {
  it('returns the item ids', async () => {
    expect(await loadMagicGiven(selecting({ data: [{ item_id: 'a' }, { item_id: 'b' }], error: null }), 'c')).toEqual(['a', 'b']);
  });
  it('returns null when the table is missing or the call throws', async () => {
    expect(await loadMagicGiven(selecting({ data: null, error: { message: 'no table' } }), 'c')).toBeNull();
    const throwing = { from: () => { throw new Error('boom'); } } as unknown as SupabaseClient;
    expect(await loadMagicGiven(throwing, 'c')).toBeNull();
  });
});

describe('persistMagicGiven', () => {
  it('inserts one row per item and skips an empty list', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
    await persistMagicGiven(supabase, 'camp', []);
    expect(insert).not.toHaveBeenCalled();
    await persistMagicGiven(supabase, 'camp', ['x', 'y']);
    expect(insert).toHaveBeenCalledWith([{ campaign_id: 'camp', item_id: 'x' }, { campaign_id: 'camp', item_id: 'y' }]);
  });
});

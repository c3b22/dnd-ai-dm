import { describe, it, expect, vi } from 'vitest';
import { getAdventureById } from './adventures';

function fakeSupabase(row: Record<string, unknown> | null) {
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  }));
  return { from } as any;
}

describe('getAdventureById', () => {
  it('returns a built-in adventure without touching the database', async () => {
    const supabase = fakeSupabase(null);
    const adventure = await getAdventureById(supabase, 'sunken-bell-of-marrowmere');
    expect(adventure?.title).toBe('The Sunken Bell of Marrowmere');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('maps a custom_adventures row into the Adventure shape', async () => {
    const supabase = fakeSupabase({
      id: 'custom-1', title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH',
      tone: 'Tone', tone_th: 'ToneTH', setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [{ name: 'N', role: 'R' }],
    });
    const adventure = await getAdventureById(supabase, 'custom-1');
    expect(adventure).toEqual({
      id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH',
      tone: 'Tone', toneTh: 'ToneTH', setting: 'Setting', hook: 'Hook', openingTh: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [{ name: 'N', role: 'R' }],
    });
  });

  it('returns null for an id that matches neither a built-in nor a row', async () => {
    const supabase = fakeSupabase(null);
    expect(await getAdventureById(supabase, 'nope')).toBeNull();
  });

  it('returns null for a null or undefined id', async () => {
    const supabase = fakeSupabase(null);
    expect(await getAdventureById(supabase, null)).toBeNull();
  });

  it('reads a custom row regardless of who is asking (no owner filter on reads)', async () => {
    const supabase = fakeSupabase({
      id: 'custom-1', title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH',
      tone: 'Tone', tone_th: 'ToneTH', setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [], owner_id: 'someone-else',
    });
    const adventure = await getAdventureById(supabase, 'custom-1');
    expect(adventure?.id).toBe('custom-1');
  });
});

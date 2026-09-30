import { describe, it, expect, vi } from 'vitest';
import { seedStartingKit } from './startingKit';

describe('seedStartingKit', () => {
  it('inserts the chosen weapon equipped plus one minor potion', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase: any = { from: vi.fn(() => ({ insert })) };

    await seedStartingKit(supabase, { campaignId: 'c1', playerId: 'p1', weaponId: 'shortbow' });

    expect(supabase.from).toHaveBeenCalledWith('inventory_items');
    expect(insert).toHaveBeenCalledWith([
      { campaign_id: 'c1', player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
      { campaign_id: 'c1', player_id: 'p1', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false },
    ]);
  });

  it('throws when the insert fails', async () => {
    const supabase: any = { from: () => ({ insert: () => Promise.resolve({ error: new Error('boom') }) }) };
    await expect(seedStartingKit(supabase, { campaignId: 'c1', playerId: 'p1', weaponId: 'staff' })).rejects.toThrow('boom');
  });
});

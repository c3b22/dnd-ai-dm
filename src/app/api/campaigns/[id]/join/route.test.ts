import { describe, it, expect } from 'vitest';
import { joinCampaign } from '@/lib/campaign/joinCampaign';

function createFakeSupabase(playerResponse: any) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: playerResponse, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('joinCampaign', () => {
  it('adds a new player row to the campaign', async () => {
    const supabase = createFakeSupabase({ id: 'player-2', display_name: 'Alex' });
    const player = await joinCampaign(supabase, {
      campaignId: 'camp-1',
      userId: 'user-2',
      displayName: 'Alex',
    });
    expect(player).toEqual({ id: 'player-2', display_name: 'Alex' });
  });
});

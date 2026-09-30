import { describe, it, expect } from 'vitest';
import { joinCampaign } from './joinCampaign';

function fakeSupabase(options: { existing: unknown | null }) {
  const inserts: unknown[] = [];
  const client: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: options.existing, error: null }),
          }),
        }),
      }),
      insert: (payload: unknown) => {
        inserts.push(payload);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-player', ...(payload as object) }, error: null }),
          }),
        };
      },
    }),
  };
  return { client, inserts };
}

describe('joinCampaign', () => {
  it('creates a player when the user is not in the campaign yet', async () => {
    const { client, inserts } = fakeSupabase({ existing: null });

    const player = await joinCampaign(client, {
      campaignId: 'camp-1',
      userId: 'user-1',
      displayName: 'Prem',
    });

    expect(inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword' },
    ]);
    expect(player.id).toBe('new-player');
  });

  it('stores the chosen starting weapon and falls back to the default for anything else', async () => {
    const chosen = fakeSupabase({ existing: null });
    await joinCampaign(chosen.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'staff' });
    expect(chosen.inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'staff' },
    ]);

    const invalid = fakeSupabase({ existing: null });
    await joinCampaign(invalid.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'lightsaber' });
    expect(invalid.inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword' },
    ]);
  });

  it('returns the existing player instead of inserting a duplicate when the user already joined', async () => {
    const { client, inserts } = fakeSupabase({ existing: { id: 'player-9', display_name: 'Prem' } });

    const player = await joinCampaign(client, {
      campaignId: 'camp-1',
      userId: 'user-1',
      displayName: 'Prem again',
    });

    expect(inserts).toEqual([]);
    expect(player.id).toBe('player-9');
  });
});

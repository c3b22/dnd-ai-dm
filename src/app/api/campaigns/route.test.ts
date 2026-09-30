import { describe, it, expect } from 'vitest';
import { createCampaign } from '@/lib/campaign/createCampaign';

function createFakeSupabase(responses: Record<string, any>) {
  const calls: { table: string; action: string; payload?: unknown }[] = [];
  const from = (table: string) => {
    const builder: any = {
      insert: (payload: unknown) => {
        calls.push({ table, action: 'insert', payload });
        return builder;
      },
      update: () => {
        calls.push({ table, action: 'update' });
        return builder;
      },
      eq: () => Promise.resolve({ data: null, error: null }),
      select: () => builder,
      single: () => Promise.resolve({ data: responses[table], error: null }),
    };
    return builder;
  };
  return { client: { from } as any, calls };
}

describe('createCampaign', () => {
  it('creates a campaign, adds the creator as a player, and opens round 1', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    const result = await createCampaign(client, {
      name: 'Test',
      userId: 'user-1',
      displayName: 'Prem',
    });

    expect(result.campaign.id).toBe('camp-1');
    expect(result.player.id).toBe('player-1');
    expect(result.round.id).toBe('round-1');
    expect(calls.map((c) => `${c.action}:${c.table}`)).toEqual([
      'insert:campaigns',
      'insert:players',
      'insert:rounds',
      'update:campaigns',
    ]);
  });

  it('does not post an opening message yet — the campaign waits in the lobby until started', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    await createCampaign(client, {
      name: 'Test',
      userId: 'user-1',
      displayName: 'Prem',
      adventureId: 'sunken-bell-of-marrowmere',
    });

    expect(calls.map((c) => `${c.action}:${c.table}`)).not.toContain('insert:messages');
  });

  it('gives every new campaign a 6-character join code', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    await createCampaign(client, { name: 'Test', userId: 'user-1', displayName: 'Prem' });

    const campaignInsert = calls.find((c) => c.action === 'insert' && c.table === 'campaigns');
    expect((campaignInsert?.payload as { join_code: string }).join_code).toHaveLength(6);
  });

  it('stores the chosen starting weapon on the creator, defaulting to the shortsword', async () => {
    const responses = {
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    };
    const playerInsert = (calls: { table: string; action: string; payload?: unknown }[]) =>
      calls.find((c) => c.action === 'insert' && c.table === 'players')?.payload as { weapon_id: string };

    const chosen = createFakeSupabase(responses);
    await createCampaign(chosen.client, { name: 'Test', userId: 'user-1', displayName: 'Prem', weaponId: 'shortbow' });
    expect(playerInsert(chosen.calls).weapon_id).toBe('shortbow');

    const fallback = createFakeSupabase(responses);
    await createCampaign(fallback.client, { name: 'Test', userId: 'user-1', displayName: 'Prem' });
    expect(playerInsert(fallback.calls).weapon_id).toBe('shortsword');
  });

  it('throws when campaign update fails', async () => {
    const updateError = new Error('network error');
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'camp-1' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: updateError }),
        }),
      }),
    } as any;

    await expect(
      createCampaign(client, {
        name: 'Test',
        userId: 'user-1',
        displayName: 'Prem',
      })
    ).rejects.toThrow(updateError);
  });
});

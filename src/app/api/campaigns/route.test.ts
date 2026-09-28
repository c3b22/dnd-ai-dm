import { describe, it, expect } from 'vitest';
import { createCampaign } from './route';

function createFakeSupabase(responses: Record<string, any>) {
  const calls: { table: string; action: string }[] = [];
  const from = (table: string) => {
    const builder: any = {
      insert: () => {
        calls.push({ table, action: 'insert' });
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
});

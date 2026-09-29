import { describe, it, expect } from 'vitest';
import { StartCampaignError, startCampaign } from './startCampaign';

function fakeSupabase(campaign: Record<string, unknown>) {
  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown }[] = [];
  const client: any = {
    from: (table: string) => {
      if (table === 'players') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: 'p1', user_id: 'u1', created_at: '2026-01-01' },
                  { id: 'p2', user_id: 'u2', created_at: '2026-01-02' },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: campaign, error: null }) }),
          }),
          update: (payload: unknown) => {
            updates.push({ table, payload });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'messages') {
        return {
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, inserts, updates };
}

describe('startCampaign', () => {
  it('lets the owner start the game: marks it started and posts the opening scene', async () => {
    const { client, inserts, updates } = fakeSupabase({
      round_id: 'r1',
      current_round_id: 'r1',
      adventure_id: 'sunken-bell-of-marrowmere',
      started_at: null,
    });

    await startCampaign(client, { campaignId: 'c1', userId: 'u1' });

    expect(updates).toEqual([{ table: 'campaigns', payload: expect.objectContaining({ started_at: expect.any(String) }) }]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('messages');
    expect((inserts[0].payload as { role: string }).role).toBe('dm');
  });

  it('refuses anyone who is not the owner', async () => {
    const { client, updates } = fakeSupabase({ current_round_id: 'r1', adventure_id: null, started_at: null });

    await expect(startCampaign(client, { campaignId: 'c1', userId: 'u2' })).rejects.toMatchObject({
      status: 403,
    });
    expect(updates).toHaveLength(0);
  });

  it('is idempotent: starting an already-started campaign does nothing and does not repost the scene', async () => {
    const { client, inserts, updates } = fakeSupabase({
      current_round_id: 'r1',
      adventure_id: 'sunken-bell-of-marrowmere',
      started_at: '2026-01-01T00:00:00Z',
    });

    await startCampaign(client, { campaignId: 'c1', userId: 'u1' });

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('throws a 404 for a campaign that does not exist', async () => {
    const { client } = fakeSupabase(null as any);
    await expect(startCampaign(client, { campaignId: 'missing', userId: 'u1' })).rejects.toBeInstanceOf(
      StartCampaignError
    );
  });
});

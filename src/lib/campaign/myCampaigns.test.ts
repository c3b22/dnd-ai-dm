import { describe, it, expect } from 'vitest';
import { fetchMyCampaigns } from './myCampaigns';

function fakeSupabase(rows: unknown[]) {
  const calls: unknown[] = [];
  const client: any = {
    from: (table: string) => {
      if (table !== 'players') throw new Error(`Unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          calls.push({ columns });
          return {
            eq: (column: string, value: unknown) => {
              calls.push({ column, value });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe('fetchMyCampaigns', () => {
  it('returns a summary per campaign the user is a player in, newest first', async () => {
    const { client, calls } = fakeSupabase([
      {
        id: 'player-1',
        campaign_id: 'camp-1',
        campaigns: { name: 'ห้องเก่า', adventure_id: 'sunken-bell', started_at: null, created_at: '2026-01-01T00:00:00Z', players: [{ id: 'player-1', created_at: '2026-01-01T00:00:00Z' }, { id: 'other-1', created_at: '2026-01-01T01:00:00Z' }] },
      },
      {
        id: 'player-2',
        campaign_id: 'camp-2',
        campaigns: { name: 'ห้องใหม่', adventure_id: 'orc-castle', started_at: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z', players: [{ id: 'other-2', created_at: '2026-01-02T00:00:00Z' }, { id: 'player-2', created_at: '2026-01-02T00:05:00Z' }] },
      },
    ]);

    const result = await fetchMyCampaigns(client, 'user-1');

    expect(result).toEqual([
      { id: 'camp-2', playerId: 'player-2', name: 'ห้องใหม่', adventureId: 'orc-castle', started: true, ended: false, isOwner: false },
      { id: 'camp-1', playerId: 'player-1', name: 'ห้องเก่า', adventureId: 'sunken-bell', started: false, ended: false, isOwner: true },
    ]);
    expect(calls).toEqual([
      { columns: 'id, campaign_id, campaigns(name, adventure_id, started_at, status, created_at, players(id, created_at))' },
      { column: 'user_id', value: 'user-1' },
    ]);
  });

  it('returns an empty list when the user has no campaigns', async () => {
    const { client } = fakeSupabase([]);
    expect(await fetchMyCampaigns(client, 'user-1')).toEqual([]);
  });

  it('skips a row whose campaign was deleted', async () => {
    const { client } = fakeSupabase([{ id: 'player-1', campaign_id: 'camp-1', campaigns: null }]);
    expect(await fetchMyCampaigns(client, 'user-1')).toEqual([]);
  });

  it('is not the owner when the players list is missing', async () => {
    const { client } = fakeSupabase([
      { id: 'player-1', campaign_id: 'camp-1', campaigns: { name: 'x', adventure_id: null, started_at: null, created_at: '2026-01-01T00:00:00Z' } },
    ]);
    expect((await fetchMyCampaigns(client, 'user-1'))[0].isOwner).toBe(false);
  });
});

describe('fetchMyCampaigns — ended rooms', () => {
  const row = (status: string | undefined) => ({
    id: 'player-1',
    campaign_id: 'camp-1',
    campaigns: { name: 'ห้อง', adventure_id: null, started_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', ...(status ? { status } : {}), players: [{ id: 'player-1', created_at: '2026-01-01T00:00:00Z' }] },
  });

  it('marks a campaign with status ended', async () => {
    const { client } = fakeSupabase([row('ended')]);
    expect((await fetchMyCampaigns(client, 'u'))[0].ended).toBe(true);
  });

  it('falls back to the old column list when campaigns.status is missing', async () => {
    const columns: string[] = [];
    const client: any = {
      from: () => ({
        select: (c: string) => {
          columns.push(c);
          return { eq: () => Promise.resolve(c.includes('status') ? { data: null, error: { message: 'column campaigns_1.status does not exist' } } : { data: [row(undefined)], error: null }) };
        },
      }),
    };
    const result = await fetchMyCampaigns(client, 'u');
    expect(result[0].ended).toBe(false);
    expect(columns).toHaveLength(2);
    expect(columns[1]).not.toContain('status');
  });
});

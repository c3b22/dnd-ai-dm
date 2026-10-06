import { describe, it, expect } from 'vitest';
import { RemoveCampaignError, deleteCampaign, leaveCampaign } from './removeCampaign';

function fakeSupabase(opts: { roundStatus?: string | null; campaignExists?: boolean } = {}) {
  const deletes: { table: string; filters: [string, unknown][] }[] = [];
  const players = [
    { id: 'p1', user_id: 'u1', created_at: '2026-01-01' },
    { id: 'p2', user_id: 'u2', created_at: '2026-01-02' },
  ];
  const client: any = {
    from: (table: string) => {
      if (table === 'players') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: players, error: null }) }),
          delete: () => {
            const filters: [string, unknown][] = [];
            const chain: any = {
              eq: (col: string, val: unknown) => {
                filters.push([col, val]);
                if (filters.length === 2) {
                  deletes.push({ table, filters });
                  return Promise.resolve({ error: null });
                }
                return chain;
              },
            };
            return chain;
          },
        };
      }
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.campaignExists === false ? null : { current_round_id: 'r1' },
                  error: null,
                }),
            }),
          }),
          delete: () => ({
            eq: (col: string, val: unknown) => {
              deletes.push({ table, filters: [[col, val]] });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'rounds') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.roundStatus === null ? null : { status: opts.roundStatus ?? 'pending' },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, deletes };
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    if (e instanceof RemoveCampaignError) return e.status;
    throw e;
  }
  return null;
}

describe('deleteCampaign', () => {
  it('lets the owner delete the whole campaign row', async () => {
    const { client, deletes } = fakeSupabase();
    await deleteCampaign(client, { campaignId: 'c1', userId: 'u1' });
    expect(deletes).toEqual([{ table: 'campaigns', filters: [['id', 'c1']] }]);
  });

  it('rejects a non-owner member with 403 and deletes nothing', async () => {
    const { client, deletes } = fakeSupabase();
    expect(await status(deleteCampaign(client, { campaignId: 'c1', userId: 'u2' }))).toBe(403);
    expect(deletes).toEqual([]);
  });

  it('rejects a stranger with 403', async () => {
    const { client, deletes } = fakeSupabase();
    expect(await status(deleteCampaign(client, { campaignId: 'c1', userId: 'nobody' }))).toBe(403);
    expect(deletes).toEqual([]);
  });

  it('rejects with 409 while the current round is processing', async () => {
    const { client, deletes } = fakeSupabase({ roundStatus: 'processing' });
    expect(await status(deleteCampaign(client, { campaignId: 'c1', userId: 'u1' }))).toBe(409);
    expect(deletes).toEqual([]);
  });

  it('still deletes when the campaign has no current round', async () => {
    const { client, deletes } = fakeSupabase({ roundStatus: null });
    await deleteCampaign(client, { campaignId: 'c1', userId: 'u1' });
    expect(deletes).toHaveLength(1);
  });
});

describe('leaveCampaign', () => {
  it('lets a regular member remove only their own player row', async () => {
    const { client, deletes } = fakeSupabase();
    await leaveCampaign(client, { campaignId: 'c1', userId: 'u2' });
    expect(deletes).toEqual([
      {
        table: 'players',
        filters: [
          ['id', 'p2'],
          ['campaign_id', 'c1'],
        ],
      },
    ]);
  });

  it('refuses the owner with 409 and a message pointing to delete', async () => {
    const { client, deletes } = fakeSupabase();
    const err = await leaveCampaign(client, { campaignId: 'c1', userId: 'u1' }).catch((e) => e);
    expect(err).toBeInstanceOf(RemoveCampaignError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/delete/i);
    expect(deletes).toEqual([]);
  });

  it('returns 404 for someone who is not a member', async () => {
    const { client, deletes } = fakeSupabase();
    expect(await status(leaveCampaign(client, { campaignId: 'c1', userId: 'nobody' }))).toBe(404);
    expect(deletes).toEqual([]);
  });
});

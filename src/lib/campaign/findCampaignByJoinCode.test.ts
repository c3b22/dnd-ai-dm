import { describe, it, expect } from 'vitest';
import { findCampaignByJoinCode } from './findCampaignByJoinCode';

function fakeSupabase(row: unknown) {
  const calls: unknown[] = [];
  const client: any = {
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          calls.push({ column, value });
          return { maybeSingle: () => Promise.resolve({ data: row, error: null }) };
        },
      }),
    }),
  };
  return { client, calls };
}

describe('findCampaignByJoinCode', () => {
  it('finds the campaign for a matching code, case-insensitively', async () => {
    const { client, calls } = fakeSupabase({ id: 'camp-1' });

    const result = await findCampaignByJoinCode(client, 'ab12cd');

    expect(result).toEqual({ id: 'camp-1' });
    expect(calls).toEqual([{ column: 'join_code', value: 'AB12CD' }]);
  });

  it('returns null when no campaign matches', async () => {
    const { client } = fakeSupabase(null);
    expect(await findCampaignByJoinCode(client, 'ZZZZZZ')).toBeNull();
  });
});

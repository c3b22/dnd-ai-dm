import { describe, it, expect } from 'vitest';
import { MAX_OOC_LENGTH, TeamChatError, postTeamChat } from './teamChat';

function fake(players: { id: string; user_id: string }[], insertError: unknown = null) {
  const inserts: unknown[] = [];
  const touched: string[] = [];
  const client: any = {
    from: (table: string) => {
      touched.push(table);
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: players[0] ?? null, error: null }) }),
            }),
          }),
        };
      }
      return {
        insert: (p: unknown) => {
          inserts.push(p);
          return Promise.resolve({ error: insertError });
        },
      };
    },
  };
  return { client, inserts, touched };
}

describe('postTeamChat', () => {
  it('stores a trimmed ooc message with the sender player id and no round', async () => {
    const { client, inserts, touched } = fake([{ id: 'p1', user_id: 'u1' }]);
    await postTeamChat(client, { campaignId: 'c1', userId: 'u1', content: '  hello team  ' });
    expect(inserts).toEqual([{ campaign_id: 'c1', round_id: null, role: 'ooc', player_id: 'p1', content: 'hello team' }]);
    expect(touched).toEqual(['players', 'messages']);
  });

  it('rejects non-members with 403', async () => {
    const { client, inserts } = fake([]);
    await expect(postTeamChat(client, { campaignId: 'c1', userId: 'u9', content: 'hi' })).rejects.toMatchObject({ status: 403 });
    expect(inserts).toHaveLength(0);
  });

  it('rejects empty and over-long messages with 400', async () => {
    const { client, inserts } = fake([{ id: 'p1', user_id: 'u1' }]);
    for (const content of ['', '   ', 'x'.repeat(MAX_OOC_LENGTH + 1), 42 as any]) {
      const attempt = postTeamChat(client, { campaignId: 'c1', userId: 'u1', content });
      await expect(attempt).rejects.toBeInstanceOf(TeamChatError);
      await expect(attempt).rejects.toMatchObject({ status: 400 });
    }
    expect(inserts).toHaveLength(0);
    await postTeamChat(client, { campaignId: 'c1', userId: 'u1', content: 'x'.repeat(MAX_OOC_LENGTH) });
    expect(inserts).toHaveLength(1);
  });

  it('propagates insert errors', async () => {
    const { client } = fake([{ id: 'p1', user_id: 'u1' }], new Error('db'));
    await expect(postTeamChat(client, { campaignId: 'c1', userId: 'u1', content: 'hi' })).rejects.toThrow('db');
  });
});

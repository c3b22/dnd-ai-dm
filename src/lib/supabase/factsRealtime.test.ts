import { describe, it, expect, vi } from 'vitest';

vi.mock('./client', () => ({ supabaseBrowserClient: {} }));

import { fetchCampaignFacts, subscribeToFacts } from './factsRealtime';

const row = { id: 'f1', campaign_id: 'c1', kind: 'npc', key: 'เกรตา', value: 'เป็นมิตร', updated_at: '2026-10-06T00:00:00Z' };

function fakeFetchClient(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return { client: { from: vi.fn(() => query) } as any, query };
}

describe('fetchCampaignFacts', () => {
  it('reads campaign_facts for the campaign and maps rows', async () => {
    const { client, query } = fakeFetchClient({ data: [row], error: null });
    const facts = await fetchCampaignFacts('c1', client);
    expect(client.from).toHaveBeenCalledWith('campaign_facts');
    expect(query.eq).toHaveBeenCalledWith('campaign_id', 'c1');
    expect(facts).toEqual([{ id: 'f1', campaignId: 'c1', kind: 'npc', key: 'เกรตา', value: 'เป็นมิตร', updatedAt: '2026-10-06T00:00:00Z' }]);
  });

  it('returns an empty log when the table is missing', async () => {
    expect(await fetchCampaignFacts('c1', fakeFetchClient({ data: null, error: { message: 'relation does not exist' } }).client)).toEqual([]);
    const thrown: any = { from: () => { throw new Error('boom'); } };
    expect(await fetchCampaignFacts('c1', thrown)).toEqual([]);
  });
});

describe('subscribeToFacts', () => {
  function fakeRealtimeClient() {
    const handlers: { filter: any; cb: (p: any) => void }[] = [];
    const channel: any = {
      on: (_t: string, filter: unknown, cb: (p: any) => void) => {
        handlers.push({ filter, cb });
        return channel;
      },
      subscribe: vi.fn(() => channel),
    };
    const client: any = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    return { client, channel, handlers };
  }

  it('listens to every change of this campaign and calls onChange', () => {
    const { client, handlers } = fakeRealtimeClient();
    const onChange = vi.fn();
    subscribeToFacts('c1', onChange, client);
    expect(client.channel).toHaveBeenCalledWith('campaign_facts:c1');
    expect(handlers[0].filter).toMatchObject({ event: '*', table: 'campaign_facts', filter: 'campaign_id=eq.c1' });
    handlers[0].cb({});
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe that removes the channel', () => {
    const { client, channel } = fakeRealtimeClient();
    subscribeToFacts('c1', vi.fn(), client)();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});

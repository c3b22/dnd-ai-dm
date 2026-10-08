import { describe, it, expect, vi } from 'vitest';

vi.mock('./client', () => ({ supabaseBrowserClient: {} }));

import { fetchEncounter, subscribeToEncounter } from './encounter';

const valid = { enemies: [{ name: 'หมาป่า', tier: 'normal', pip: 4, maxPip: 4, fled: false }] };

function fakeFetchClient(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return { client: { from: vi.fn(() => query) } as any, query };
}

describe('fetchEncounter', () => {
  it('reads campaigns.current_encounter and normalizes it', async () => {
    const { client, query } = fakeFetchClient({ data: { current_encounter: valid }, error: null });
    expect(await fetchEncounter('c1', client)).toEqual(valid);
    expect(client.from).toHaveBeenCalledWith('campaigns');
    expect(query.select).toHaveBeenCalledWith('current_encounter');
    expect(query.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('returns null for a missing row, null column or invalid shape', async () => {
    expect(await fetchEncounter('c1', fakeFetchClient({ data: null, error: null }).client)).toBeNull();
    expect(await fetchEncounter('c1', fakeFetchClient({ data: { current_encounter: null }, error: null }).client)).toBeNull();
    expect(await fetchEncounter('c1', fakeFetchClient({ data: { current_encounter: { enemies: 'x' } }, error: null }).client)).toBeNull();
  });

  it('tolerates the column missing in production (error result or thrown)', async () => {
    const err = fakeFetchClient({ data: null, error: { message: 'column current_encounter does not exist' } });
    expect(await fetchEncounter('c1', err.client)).toBeNull();
    const thrown: any = { from: () => { throw new Error('boom'); } };
    expect(await fetchEncounter('c1', thrown)).toBeNull();
  });
});

describe('subscribeToEncounter', () => {
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

  it('listens to UPDATEs of this campaign and emits normalized encounters', () => {
    const { client, handlers } = fakeRealtimeClient();
    const onEncounter = vi.fn();
    subscribeToEncounter('c1', onEncounter, client);
    expect(handlers[0].filter).toMatchObject({ event: 'UPDATE', table: 'campaigns', filter: 'id=eq.c1' });
    handlers[0].cb({ new: { current_encounter: valid } });
    expect(onEncounter).toHaveBeenLastCalledWith(valid);
    handlers[0].cb({ new: { current_encounter: null } });
    expect(onEncounter).toHaveBeenLastCalledWith(null);
    handlers[0].cb({ new: {} });
    expect(onEncounter).toHaveBeenLastCalledWith(null);
  });

  it('unsubscribe removes the channel', () => {
    const { client, channel } = fakeRealtimeClient();
    const off = subscribeToEncounter('c1', vi.fn(), client);
    off();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});

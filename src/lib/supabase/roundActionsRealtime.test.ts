import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers: { filter: any; cb: () => void }[] = [];
const channel: any = {
  on: (_type: string, filter: unknown, cb: () => void) => {
    handlers.push({ filter, cb });
    return channel;
  },
  subscribe: () => channel,
};
const countResult = { count: 0 };
const query: any = {
  select: () => query,
  eq: () => query,
  then: (resolve: (v: unknown) => void) => resolve(countResult),
};
vi.mock('./client', () => ({
  supabaseBrowserClient: {
    channel: () => channel,
    removeChannel: () => {},
    from: () => query,
  },
}));

import { subscribeToRoundActionCount } from './roundActionsRealtime';

describe('subscribeToRoundActionCount', () => {
  beforeEach(() => {
    handlers.length = 0;
  });

  it('recounts when a player leaves, so a round no longer waits on someone who is gone', async () => {
    const onCount = vi.fn();
    subscribeToRoundActionCount('c1', 'r1', onCount);
    await Promise.resolve();
    await Promise.resolve();
    onCount.mockClear();

    const leave = handlers.find((h) => h.filter.table === 'players' && h.filter.event === 'DELETE');
    expect(leave).toBeDefined();
    leave!.cb();
    await new Promise((r) => setTimeout(r, 0));
    expect(onCount).toHaveBeenCalled();
  });
});

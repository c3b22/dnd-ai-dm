import { describe, it, expect, vi } from 'vitest';
import { setTurnOrder, sortByTurnOrder, TurnOrderError } from './turnOrder';

describe('sortByTurnOrder', () => {
  it('puts explicit turn order first and falls back to join time', () => {
    const sorted = sortByTurnOrder([
      { id: 'c', turnOrder: null, joinedAt: '2026-01-03' },
      { id: 'b', turnOrder: 2, joinedAt: '2026-01-01' },
      { id: 'a', turnOrder: 1, joinedAt: '2026-01-02' },
      { id: 'd', turnOrder: null, joinedAt: '2026-01-04' },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

function fakeSupabase(playerIds: string[]) {
  const updates: { id: string; turn_order: number }[] = [];
  const client: any = {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: playerIds.map((id) => ({ id })), error: null }) }),
      update: (values: { turn_order: number }) => ({
        eq: (_col: string, id: string) => ({
          eq: () => {
            updates.push({ id, turn_order: values.turn_order });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  };
  return { client, updates };
}

describe('setTurnOrder', () => {
  it('numbers players 1..n in the submitted order', async () => {
    const { client, updates } = fakeSupabase(['p1', 'p2', 'p3']);
    await setTurnOrder(client, { campaignId: 'c', playerId: 'p2', orderedPlayerIds: ['p3', 'p1', 'p2'] });
    expect(updates).toEqual([
      { id: 'p3', turn_order: 1 },
      { id: 'p1', turn_order: 2 },
      { id: 'p2', turn_order: 3 },
    ]);
  });

  it('rejects someone who is not in the campaign', async () => {
    const { client, updates } = fakeSupabase(['p1', 'p2']);
    await expect(
      setTurnOrder(client, { campaignId: 'c', playerId: 'stranger', orderedPlayerIds: ['p1', 'p2'] })
    ).rejects.toBeInstanceOf(TurnOrderError);
    expect(updates).toHaveLength(0);
  });

  it('rejects a list that misses, repeats or invents players', async () => {
    const { client, updates } = fakeSupabase(['p1', 'p2']);
    for (const ordered of [['p1'], ['p1', 'p1'], ['p1', 'p9']]) {
      await expect(
        setTurnOrder(client, { campaignId: 'c', playerId: 'p1', orderedPlayerIds: ordered })
      ).rejects.toBeInstanceOf(TurnOrderError);
    }
    expect(updates).toHaveLength(0);
    void vi;
  });
});

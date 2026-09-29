import { describe, it, expect } from 'vitest';
import {
  canReorder,
  findOwnerId,
  setTurnOrder,
  sortByTurnOrder,
  TurnOrderError,
} from './turnOrder';

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

describe('findOwnerId', () => {
  it('is the player who joined first', () => {
    expect(
      findOwnerId([
        { id: 'late', joinedAt: '2026-01-02' },
        { id: 'first', joinedAt: '2026-01-01' },
      ])
    ).toBe('first');
    expect(findOwnerId([])).toBeNull();
  });
});

describe('canReorder', () => {
  const currentIds = ['a', 'b', 'c'];

  it('lets the owner arrange everyone', () => {
    expect(canReorder({ currentIds, newIds: ['c', 'b', 'a'], requesterId: 'a', ownerId: 'a' })).toBe(true);
  });

  it('lets a player move only themselves', () => {
    expect(canReorder({ currentIds, newIds: ['b', 'c', 'a'], requesterId: 'a', ownerId: 'b' })).toBe(true);
    expect(canReorder({ currentIds, newIds: ['a', 'c', 'b'], requesterId: 'a', ownerId: 'b' })).toBe(false);
  });
});

const PLAYERS = [
  { id: 'p1', user_id: 'u1', turn_order: 1, created_at: '2026-01-01' },
  { id: 'p2', user_id: 'u2', turn_order: 2, created_at: '2026-01-02' },
  { id: 'p3', user_id: 'u3', turn_order: 3, created_at: '2026-01-03' },
];

function fakeSupabase() {
  const updates: { id: string; turn_order: number }[] = [];
  const client: any = {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: PLAYERS, error: null }) }),
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
  it('numbers players 1..n in the submitted order when the owner asks', async () => {
    const { client, updates } = fakeSupabase();
    await setTurnOrder(client, {
      campaignId: 'c',
      userId: 'u1',
      playerId: 'p1',
      orderedPlayerIds: ['p3', 'p1', 'p2'],
    });
    expect(updates).toEqual([
      { id: 'p3', turn_order: 1 },
      { id: 'p1', turn_order: 2 },
      { id: 'p2', turn_order: 3 },
    ]);
  });

  it('lets a non-owner move only their own place', async () => {
    const { client, updates } = fakeSupabase();
    await setTurnOrder(client, {
      campaignId: 'c',
      userId: 'u3',
      playerId: 'p3',
      orderedPlayerIds: ['p1', 'p3', 'p2'],
    });
    expect(updates.map((u) => u.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('refuses a non-owner who rearranges other players', async () => {
    const { client, updates } = fakeSupabase();
    await expect(
      setTurnOrder(client, { campaignId: 'c', userId: 'u2', playerId: 'p2', orderedPlayerIds: ['p1', 'p3', 'p2'] }),
    ).resolves.toBeUndefined(); // p2 moving to the end only changes p2's own place
    updates.length = 0;
    await expect(
      setTurnOrder(client, { campaignId: 'c', userId: 'u3', playerId: 'p3', orderedPlayerIds: ['p2', 'p1', 'p3'] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);
  });

  it('refuses a caller who is not the owner of the player they claim to be', async () => {
    const { client, updates } = fakeSupabase();
    await expect(
      setTurnOrder(client, { campaignId: 'c', userId: 'intruder', playerId: 'p1', orderedPlayerIds: ['p1', 'p2', 'p3'] }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setTurnOrder(client, { campaignId: 'c', userId: 'u1', playerId: 'stranger', orderedPlayerIds: ['p1', 'p2', 'p3'] }),
    ).rejects.toBeInstanceOf(TurnOrderError);
    expect(updates).toHaveLength(0);
  });

  it('rejects a list that misses, repeats or invents players', async () => {
    const { client, updates } = fakeSupabase();
    for (const ordered of [['p1', 'p2'], ['p1', 'p1', 'p2'], ['p1', 'p2', 'p9']]) {
      await expect(
        setTurnOrder(client, { campaignId: 'c', userId: 'u1', playerId: 'p1', orderedPlayerIds: ordered }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(updates).toHaveLength(0);
  });
});

describe('setTurnOrder with an owner-only table', () => {
  it('lets only the owner reorder, even for their own place', async () => {
    const { client, updates } = fakeSupabase();

    await expect(
      setTurnOrder(client, {
        campaignId: 'c',
        userId: 'u3',
        playerId: 'p3',
        orderedPlayerIds: ['p1', 'p3', 'p2'],
        policy: 'owner',
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);

    await setTurnOrder(client, {
      campaignId: 'c',
      userId: 'u1',
      playerId: 'p1',
      orderedPlayerIds: ['p3', 'p2', 'p1'],
      policy: 'owner',
    });
    expect(updates).toHaveLength(3);
  });
});

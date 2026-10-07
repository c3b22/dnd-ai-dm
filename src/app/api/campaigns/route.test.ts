import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createCampaign } from '@/lib/campaign/createCampaign';

const { getAdventureById } = vi.hoisted(() => ({
  getAdventureById: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => {
  const createFakeSupabase = (responses: Record<string, any>) => {
    const from = (table: string) => {
      const builder: any = {
        insert: (payload: unknown) => {
          builder._lastPayload = payload;
          return builder;
        },
        update: () => {
          return builder;
        },
        eq: () => builder,
        select: () => builder,
        single: () => Promise.resolve({ data: responses[table], error: null }),
        maybeSingle: () => Promise.resolve({ data: responses[table] ?? null, error: null }),
      };
      return builder;
    };
    return { from };
  };
  return {
    createServiceRoleClient: () => createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    }),
  };
});

vi.mock('@/lib/adventures/adventures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/adventures')>()),
  getAdventureById,
}));

import { POST } from './route';

function createFakeSupabase(responses: Record<string, any>) {
  const calls: { table: string; action: string; payload?: unknown }[] = [];
  const from = (table: string) => {
    const builder: any = {
      insert: (payload: unknown) => {
        calls.push({ table, action: 'insert', payload });
        return builder;
      },
      update: () => {
        calls.push({ table, action: 'update' });
        return builder;
      },
      eq: () => Promise.resolve({ data: null, error: null }),
      select: () => builder,
      single: () => Promise.resolve({ data: responses[table], error: null }),
    };
    return builder;
  };
  return { client: { from } as any, calls };
}

describe('createCampaign', () => {
  it('creates a campaign, adds the creator as a player, and opens round 1', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    const result = await createCampaign(client, {
      name: 'Test',
      userId: 'user-1',
      displayName: 'Prem',
    });

    expect(result.campaign.id).toBe('camp-1');
    expect(result.player.id).toBe('player-1');
    expect(result.round.id).toBe('round-1');
    expect(calls.map((c) => `${c.action}:${c.table}`)).toEqual([
      'insert:campaigns',
      'insert:players',
      'insert:inventory_items',
      'insert:rounds',
      'update:campaigns',
    ]);
  });

  it('does not post an opening message yet — the campaign waits in the lobby until started', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    await createCampaign(client, {
      name: 'Test',
      userId: 'user-1',
      displayName: 'Prem',
      adventureId: 'sunken-bell-of-marrowmere',
    });

    expect(calls.map((c) => `${c.action}:${c.table}`)).not.toContain('insert:messages');
  });

  it('gives every new campaign a 6-character join code', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    await createCampaign(client, { name: 'Test', userId: 'user-1', displayName: 'Prem' });

    const campaignInsert = calls.find((c) => c.action === 'insert' && c.table === 'campaigns');
    expect((campaignInsert?.payload as { join_code: string }).join_code).toHaveLength(6);
  });

  it('stores the chosen starting weapon on the creator, defaulting to the shortsword', async () => {
    const responses = {
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    };
    const playerInsert = (calls: { table: string; action: string; payload?: unknown }[]) =>
      calls.find((c) => c.action === 'insert' && c.table === 'players')?.payload as { weapon_id: string; class_id: string };

    const chosen = createFakeSupabase(responses);
    await createCampaign(chosen.client, { name: 'Test', userId: 'user-1', displayName: 'Prem', weaponId: 'shortbow' });
    expect(playerInsert(chosen.calls).weapon_id).toBe('shortbow');
    expect(playerInsert(chosen.calls).class_id).toBe('archer');

    const byClass = createFakeSupabase(responses);
    await createCampaign(byClass.client, { name: 'Test', userId: 'user-1', displayName: 'Prem', classId: 'rogue' });
    expect(playerInsert(byClass.calls)).toMatchObject({ weapon_id: 'dagger', class_id: 'rogue' });

    const fallback = createFakeSupabase(responses);
    await createCampaign(fallback.client, { name: 'Test', userId: 'user-1', displayName: 'Prem' });
    expect(playerInsert(fallback.calls).weapon_id).toBe('shortsword');
  });

  it('throws when campaign update fails', async () => {
    const updateError = new Error('network error');
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'camp-1' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: updateError }),
        }),
      }),
    } as any;

    await expect(
      createCampaign(client, {
        name: 'Test',
        userId: 'user-1',
        displayName: 'Prem',
      })
    ).rejects.toThrow(updateError);
  });
});

describe('POST /api/campaigns', () => {
  beforeEach(() => {
    getAdventureById.mockReset();
  });

  it('rejects an adventureId that matches neither a built-in nor a custom row', async () => {
    getAdventureById.mockResolvedValue(null);
    const response = await POST(
      new NextRequest('http://localhost/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: 'T', userId: 'u1', displayName: 'Prem', adventureId: 'nope' }),
      })
    );
    expect(response.status).toBe(400);
  });

  it('accepts a real custom adventure id', async () => {
    getAdventureById.mockResolvedValue({ id: 'custom-1', title: 'Custom Adventure' });
    const response = await POST(
      new NextRequest('http://localhost/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: 'T', userId: 'u1', displayName: 'Prem', adventureId: 'custom-1' }),
      })
    );
    expect(response.status).toBe(201);
  });

  it('stores identity fields on the creator, trimmed and capped', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });
    await createCampaign(client, { name: 'T', userId: 'u1', displayName: 'Prem', backstory: ' อดีตทหาร ', goal: 'y'.repeat(900) });
    const row = calls.find((c) => c.action === 'insert' && c.table === 'players')?.payload as Record<string, unknown>;
    expect(row.backstory).toBe('อดีตทหาร');
    expect(row.goal).toBe('y'.repeat(500));
    expect(row).not.toHaveProperty('personality');
  });
});

import { describe, it, expect } from 'vitest';
import { createSupabaseRoundRepository } from './roundRepository';

interface FakeRoundRow {
  campaign_id?: string;
  opened_at?: string;
}

function createFakeSupabase(options: {
  roundsById: Record<string, FakeRoundRow>;
  campaignSummary: { summary: string; covers_up_to_round: string | null } | null;
  players?: unknown[];
  pendingWipe?: boolean;
  inventoryRows?: unknown[];
  inventoryError?: Error;
  actionRows?: unknown[];
}) {
  const messagesCalls: { method: string; args: unknown[] }[] = [];

  const client: any = {
    from(table: string) {
      if (table === 'rounds') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: () =>
                Promise.resolve({ data: options.roundsById[id] ?? null, error: null }),
              maybeSingle: () =>
                Promise.resolve({ data: options.roundsById[id] ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { adventure_id: 'test-adventure', pending_wipe: options.pendingWipe ?? false },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'round_actions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: options.actionRows ?? [], error: null }),
          }),
        };
      }
      if (table === 'inventory_items') {
        return {
          select: () => ({ eq: () => Promise.resolve(options.inventoryError ? { data: null, error: options.inventoryError } : { data: options.inventoryRows ?? [], error: null }) }),
        };
      }
      if (table === 'campaign_summary') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: options.campaignSummary, error: null }),
            }),
          }),
        };
      }
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: options.players ?? [], error: null }),
          }),
        };
      }
      if (table === 'messages') {
        const builder: any = {
          select: (...args: unknown[]) => {
            messagesCalls.push({ method: 'select', args });
            return builder;
          },
          eq: (...args: unknown[]) => {
            messagesCalls.push({ method: 'eq', args });
            return builder;
          },
          gt: (...args: unknown[]) => {
            messagesCalls.push({ method: 'gt', args });
            return builder;
          },
          order: (...args: unknown[]) => {
            messagesCalls.push({ method: 'order', args });
            return builder;
          },
          limit: (...args: unknown[]) => {
            messagesCalls.push({ method: 'limit', args });
            return Promise.resolve({ data: [], error: null });
          },
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, messagesCalls };
}

describe('createSupabaseRoundRepository.getRoundContext', () => {
  it('bounds the messages query to only history after the last summarized round', async () => {
    const { client, messagesCalls } = createFakeSupabase({
      roundsById: {
        'round-2': { campaign_id: 'camp-1' },
        'round-1': { opened_at: '2026-01-01T00:00:00.000Z' },
      },
      campaignSummary: { summary: 'Old summary.', covers_up_to_round: 'round-1' },
    });

    const repository = createSupabaseRoundRepository(client);
    await repository.getRoundContext('round-2');

    const gtCall = messagesCalls.find((c) => c.method === 'gt');
    expect(gtCall).toBeDefined();
    expect(gtCall!.args).toEqual(['created_at', '2026-01-01T00:00:00.000Z']);
  });

  it('does not bound the messages query when no summary has been recorded yet', async () => {
    const { client, messagesCalls } = createFakeSupabase({
      roundsById: {
        'round-1': { campaign_id: 'camp-1' },
      },
      campaignSummary: null,
    });

    const repository = createSupabaseRoundRepository(client);
    await repository.getRoundContext('round-1');

    const gtCall = messagesCalls.find((c) => c.method === 'gt');
    expect(gtCall).toBeUndefined();
  });
});

describe('createSupabaseRoundRepository.insertRollSummary', () => {
  it('stores the rolls as structured data the UI can render per-roll', async () => {
    const inserted: unknown[] = [];
    const client: any = {
      from: (table: string) => {
        if (table !== 'messages') throw new Error(`Unexpected table: ${table}`);
        return {
          insert: (payload: unknown) => {
            inserted.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const repository = createSupabaseRoundRepository(client);
    await repository.insertRollSummary('camp-1', 'round-1', [
      { playerDisplayName: 'Prem', roll: 20 },
      { playerDisplayName: 'Nueng', roll: 8 },
    ]);

    expect(inserted).toEqual([
      {
        campaign_id: 'camp-1',
        round_id: 'round-1',
        role: 'system',
        content: JSON.stringify({
          type: 'rolls',
          rolls: [
            { playerDisplayName: 'Prem', roll: 20 },
            { playerDisplayName: 'Nueng', roll: 8 },
          ],
        }),
      },
    ]);
  });

  it('does not touch the database when there are no rolls', async () => {
    let called = false;
    const client: any = {
      from: () => ({
        insert: () => {
          called = true;
          return Promise.resolve({ error: null });
        },
      }),
    };

    const repository = createSupabaseRoundRepository(client);
    await repository.insertRollSummary('camp-1', 'round-1', []);

    expect(called).toBe(false);
  });
});

describe('createSupabaseRoundRepository character state', () => {
  it('reads the characters and the pending wipe flag into the round context', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      pendingWipe: true,
      players: [
        { id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 12, max_hp: 18, status: 'downed', revives_since_sanctuary: 1 },
      ],
    });

    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');

    expect(context.pendingWipe).toBe(true);
    expect(context.characters).toEqual([
      { id: 'p1', displayName: 'Prem', weaponId: null, armorReduction: 0, hp: 12, maxHp: 18, status: 'downed', revivesSinceSanctuary: 1 },
    ]);
  });

  it('saves every character row and the wipe flag', async () => {
    const updates: { table: string; payload: unknown; id: string }[] = [];
    const client: any = {
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ table, payload, id });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    await createSupabaseRoundRepository(client).saveCharacterState(
      'camp-1',
      [{ id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 }],
      true
    );

    expect(updates).toEqual([
      { table: 'players', payload: { hp: 5, max_hp: 18, status: 'active', revives_since_sanctuary: 1 }, id: 'p1' },
      { table: 'campaigns', payload: { pending_wipe: true }, id: 'camp-1' },
    ]);
  });

  it('posts the changes as a stats system message, and nothing when there are none', async () => {
    const inserted: unknown[] = [];
    const client: any = {
      from: () => ({
        insert: (payload: unknown) => {
          inserted.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    };
    const repository = createSupabaseRoundRepository(client);

    await repository.insertStatsSummary('camp-1', 'round-1', []);
    expect(inserted).toEqual([]);

    await repository.insertStatsSummary('camp-1', 'round-1', ['Prem −5 HP']);
    expect(inserted).toEqual([
      {
        campaign_id: 'camp-1',
        round_id: 'round-1',
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes: ['Prem −5 HP'] }),
      },
    ]);
  });
});

describe('createSupabaseRoundRepository inventory', () => {
  const premRow = { id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0 };

  it('derives weapon and armor from the equipped inventory and returns the inventories', async () => {
    const { client } = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      players: [premRow],
      inventoryRows: [
        { player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
        { player_id: 'p1', item_id: 'armor_medium', custom_name: '', quantity: 1, slot: 'armor', equipped: true },
      ],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('r1');
    expect(context.characters[0]).toMatchObject({ weaponId: 'shortbow', armorReduction: 2 });
    expect(context.inventories.p1).toHaveLength(2);
  });

  it('treats a player with nothing equipped as bare-handed (the old weapon_id column is ignored)', async () => {
    const { client } = createFakeSupabase({ roundsById: { r1: { campaign_id: 'c1' } }, campaignSummary: null, players: [premRow] });
    const context = await createSupabaseRoundRepository(client).getRoundContext('r1');
    expect(context.characters[0]).toMatchObject({ weaponId: null, armorReduction: 0 });
  });

  it('carries player id and the potion being drunk on each action', async () => {
    const { client } = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      actionRows: [{ action_text: 'ดื่มยา', use_item_id: 'potion_minor', player_id: 'p1', players: { display_name: 'Prem', turn_order: 1, created_at: '2026-01-01' } }],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('r1');
    expect(context.actions).toEqual([{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', useItemId: 'potion_minor' }]);
  });
});

describe('createSupabaseRoundRepository inventory read failure', () => {
  it('fails the round load instead of treating an unreadable inventory as empty (which a later save would then wipe)', async () => {
    const { client } = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      inventoryError: new Error('read failed'),
    });
    await expect(createSupabaseRoundRepository(client).getRoundContext('r1')).rejects.toThrow('read failed');
  });
});

describe('createSupabaseRoundRepository.saveInventories', () => {
  it('deletes rows no longer present, then upserts the rest keyed by player, item and title', async () => {
    const calls: string[] = [];
    const client: any = {
      from: (table: string) => {
        expect(table).toBe('inventory_items');
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [
            { id: 'a', item_id: 'potion_minor', custom_name: '', slot: null, equipped: false },
            { id: 'b', item_id: 'story', custom_name: 'Rusty Key', slot: null, equipped: false },
          ], error: null }) }),
          delete: () => ({ in: (col: string, ids: string[]) => { calls.push(`delete ${col} ${ids.join(',')}`); return Promise.resolve({ error: null }); } }),
          upsert: (rows: unknown[], opts: unknown) => { calls.push(`upsert ${JSON.stringify(rows)} ${JSON.stringify(opts)}`); return Promise.resolve({ error: null }); },
        };
      },
    };
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [{ itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false }] },
    ]);
    expect(calls[0]).toBe('delete id b');
    expect(calls[1]).toContain('"item_id":"potion_minor"');
    expect(calls[1]).toContain('"quantity":2');
    expect(calls[1]).toContain('"onConflict":"player_id,item_id,custom_name"');
  });

  it('skips the upsert for a player left with nothing and surfaces a write error', async () => {
    const client: any = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'a', item_id: 'potion_minor', custom_name: '' }], error: null }) }),
        delete: () => ({ in: () => Promise.resolve({ error: new Error('nope') }) }),
        upsert: () => { throw new Error('should not upsert an empty pack'); },
      }),
    };
    await expect(createSupabaseRoundRepository(client).saveInventories('c1', [{ playerId: 'p1', items: [] }])).rejects.toThrow('nope');
  });
});

describe('createSupabaseRoundRepository.saveInventories equip races', () => {
  function recordingClient(existing: unknown[]) {
    const upserts: any[][] = [];
    const client: any = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: existing, error: null }) }),
        delete: () => ({ in: () => Promise.resolve({ error: null }) }),
        upsert: (rows: any[]) => { upserts.push(rows); return Promise.resolve({ error: null }); },
      }),
    };
    return { client, upserts };
  }
  const item = (itemId: string, equipped: boolean, slot: 'weapon' | 'armor' | null = 'weapon') => ({ itemId, customName: '', quantity: 1, slot, equipped });

  it('keeps the equipped flags the database has now, not the ones from the start of the round', async () => {
    // The player swapped sword -> staff while the DM was writing; the round only changed the potion.
    const { client, upserts } = recordingClient([
      { id: '1', item_id: 'shortsword', custom_name: '', slot: 'weapon', equipped: false },
      { id: '2', item_id: 'staff', custom_name: '', slot: 'weapon', equipped: true },
    ]);
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [item('shortsword', true), item('staff', false)] },
    ]);
    const byId = Object.fromEntries(upserts[0].map((r) => [r.item_id, r.equipped]));
    expect(byId).toEqual({ shortsword: false, staff: true });
  });

  it('does not equip a newly given item into a slot the player filled meanwhile', async () => {
    const { client, upserts } = recordingClient([
      { id: '2', item_id: 'staff', custom_name: '', slot: 'weapon', equipped: true },
    ]);
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [item('staff', false), item('shortbow', true)] },
    ]);
    const byId = Object.fromEntries(upserts[0].map((r) => [r.item_id, r.equipped]));
    expect(byId).toEqual({ staff: true, shortbow: false });
  });
});

import { describe, it, expect } from 'vitest';
import { createSupabaseRoundRepository } from './roundRepository';

interface FakeRoundRow {
  campaign_id?: string;
  opened_at?: string;
  tags_applied_at?: string;
}

function createFakeSupabase(options: {
  roundsById: Record<string, FakeRoundRow>;
  campaignSummary: { summary: string; covers_up_to_round: string | null } | null;
  players?: unknown[];
  pendingWipe?: boolean;
  inventoryRows?: unknown[];
  inventoryError?: Error;
  actionRows?: unknown[];
  currentShop?: unknown;
  currentEncounter?: unknown;
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
                  data: {
                    adventure_id: 'test-adventure',
                    pending_wipe: options.pendingWipe ?? false,
                    current_shop: options.currentShop ?? null,
                    current_encounter: options.currentEncounter ?? null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'custom_adventures') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
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

describe('createSupabaseRoundRepository classes', () => {
  it('loads class and ability cooldown, defaulting to classless and 0 for old rows', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      players: [
        { id: 'p1', display_name: 'Prem', weapon_id: null, hp: 12, max_hp: 20, status: 'active', revives_since_sanctuary: 0, class_id: 'cleric', ability_cooldown: 2 },
        { id: 'p2', display_name: 'Nok', weapon_id: null, hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0 },
      ],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');
    expect(context.characters.map((c) => [c.classId, c.abilityCooldown])).toEqual([['cleric', 2], [null, 0]]);
  });

  it('loads the ability flag and target of an action', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      actionRows: [{ action_text: 'ใช้ยืนบัง', use_item_id: null, use_ability: true, ability_target_id: 'p2', player_id: 'p1', players: { display_name: 'Prem', turn_order: 1, created_at: '2026-01-01' } }],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');
    expect(context.actions[0]).toMatchObject({ playerId: 'p1', useAbility: true, abilityTargetId: 'p2' });
  });

  it('saves the ability cooldown with each character', async () => {
    const rpcCalls: any[] = [];
    const client: any = {
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        return Promise.resolve({ error: null });
      },
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    };
    await createSupabaseRoundRepository(client).saveCharacterState(
      'camp-1',
      [
        { id: 'p1', displayName: 'Prem', weaponId: null, hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, abilityCooldown: 2 },
        { id: 'p2', displayName: 'Nok', weaponId: null, hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0 },
      ],
      false
    );
    expect(rpcCalls[0][1].changes.map((c: any) => c.abilityCooldown)).toEqual([2, 0]);
  });
});

describe('createSupabaseRoundRepository levels', () => {
  it('loads effective max HP (base plus level bonus) and xp', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      players: [
        { id: 'p1', display_name: 'Prem', weapon_id: null, hp: 12, max_hp: 20, status: 'active', revives_since_sanctuary: 0, xp: 150 },
        { id: 'p2', display_name: 'Nok', weapon_id: null, hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0, xp: null },
      ],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');
    expect(context.characters.map((c) => [c.maxHp, c.xp])).toEqual([[30, 150], [20, 0]]);
  });

  it('saves the base max HP (level bonus removed) and the xp', async () => {
    const rpcCalls: any[] = [];
    const client: any = {
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        return Promise.resolve({ error: null });
      },
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    };
    // Level 2 (xp 149) with effective max 25: base is still 20, so a level-up never drifts the column.
    await createSupabaseRoundRepository(client).saveCharacterState(
      'camp-1',
      [{ id: 'p1', displayName: 'Prem', weaponId: null, hp: 20, maxHp: 25, status: 'active', revivesSinceSanctuary: 0, xp: 149 }],
      false
    );
    expect(rpcCalls[0][1].changes[0]).toMatchObject({ maxHp: 20, xp: 149 });
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
    expect(context.tagsApplied).toBe(false);
    expect(context.characters).toEqual([
      { id: 'p1', displayName: 'Prem', weaponId: null, armorReduction: 0, hp: 12, maxHp: 18, status: 'downed', revivesSinceSanctuary: 1, gold: 0, xp: 0, classId: null, abilityCooldown: 0 },
    ]);
  });

  it('reports tagsApplied once an earlier attempt has claimed this round', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1', tags_applied_at: '2026-01-01T00:00:00Z' } },
      campaignSummary: null,
    });

    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');

    expect(context.tagsApplied).toBe(true);
  });

  it('claimRoundTags wins the claim exactly once for a round', async () => {
    let claimed = false;
    const client: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              select: () => {
                if (claimed) return Promise.resolve({ data: [], error: null });
                claimed = true;
                return Promise.resolve({ data: [{ id: 'round-1' }], error: null });
              },
            }),
          }),
        }),
      }),
    };
    const repository = createSupabaseRoundRepository(client);

    await expect(repository.claimRoundTags('round-1')).resolves.toBe(true);
    await expect(repository.claimRoundTags('round-1')).resolves.toBe(false);
  });

  it('claimRoundTags throws on a genuine database error', async () => {
    const client: any = {
      from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: null, error: new Error('nope') }) }) }) }) }),
    };
    await expect(createSupabaseRoundRepository(client).claimRoundTags('round-1')).rejects.toThrow('nope');
  });

  it('saves every character through the one atomic apply_changes call, then the wipe flag', async () => {
    const rpcCalls: unknown[] = [];
    const updates: { table: string; payload: unknown; id: string }[] = [];
    const client: any = {
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        return Promise.resolve({ error: null });
      },
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
      [
        { id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1, xp: 0, abilityCooldown: 0 },
        { id: 'p2', displayName: 'Nok', weaponId: null, hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0 },
      ],
      true
    );

    expect(rpcCalls).toEqual([['apply_changes', { changes: [
      { playerId: 'p1', goldDelta: 0, items: null, hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1, xp: 0, abilityCooldown: 0 },
      { playerId: 'p2', goldDelta: 0, items: null, hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, xp: 0, abilityCooldown: 0 },
    ] }]]);
    expect(updates).toEqual([{ table: 'campaigns', payload: { pending_wipe: true }, id: 'camp-1' }]);
  });

  it('skips the apply_changes call (but still saves the wipe flag) when there are no characters', async () => {
    const rpcCalls: unknown[] = [];
    const updates: unknown[] = [];
    const client: any = {
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        return Promise.resolve({ error: null });
      },
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ table, payload, id });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    await createSupabaseRoundRepository(client).saveCharacterState('camp-1', [], false);

    expect(rpcCalls).toEqual([]);
    expect(updates).toEqual([{ table: 'campaigns', payload: { pending_wipe: false }, id: 'camp-1' }]);
  });

  it('throws when the atomic save fails, leaving the wipe flag untouched', async () => {
    const updates: unknown[] = [];
    const client: any = {
      rpc: () => Promise.resolve({ error: new Error('nope') }),
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ table, payload, id });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    await expect(
      createSupabaseRoundRepository(client).saveCharacterState(
        'camp-1',
        [{ id: 'p1', displayName: 'Prem', weaponId: null, hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 }],
        true
      )
    ).rejects.toThrow('nope');
    expect(updates).toEqual([]);
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
    expect(context.actions).toEqual([{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', useItemId: 'potion_minor', useAbility: false, abilityTargetId: null }]);
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
  const item = (itemId: string, over: Partial<{ customName: string; quantity: number; slot: 'weapon' | 'armor' | null; equipped: boolean }> = {}) => ({
    itemId, customName: '', quantity: 1, slot: null, equipped: false, ...over,
  });

  it('writes each player through apply_changes with no gold change and the pre-round state as the concurrency base', async () => {
    const calls: unknown[] = [];
    const client: any = { rpc: (name: string, args: unknown) => { calls.push([name, args]); return Promise.resolve({ error: null }); } };
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [item('potion_minor', { quantity: 2 })], baseItems: [item('potion_minor')] },
    ]);
    expect(calls).toEqual([['apply_changes', { changes: [{
      playerId: 'p1', goldDelta: 0,
      items: [item('potion_minor', { quantity: 2 })],
      baseItems: [item('potion_minor')],
    }] }]]);
  });

  it("skips a player whose pack changed concurrently (apply_changes' own conflict error) instead of throwing, and still saves the rest", async () => {
    const seen: string[] = [];
    const client: any = {
      rpc: (_name: string, args: { changes: { playerId: string }[] }) => {
        const playerId = args.changes[0].playerId;
        seen.push(playerId);
        return Promise.resolve({ error: playerId === 'p1' ? { code: 'EC001', message: 'inventory changed concurrently for player p1' } : null });
      },
    };
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [item('potion_minor')], baseItems: [] },
      { playerId: 'p2', items: [item('staff')], baseItems: [] },
    ]);
    expect(seen).toEqual(['p1', 'p2']);
  });

  it('still throws on a genuine database error', async () => {
    const client: any = { rpc: () => Promise.resolve({ error: new Error('nope') }) };
    await expect(
      createSupabaseRoundRepository(client).saveInventories('c1', [{ playerId: 'p1', items: [], baseItems: [] }])
    ).rejects.toThrow('nope');
  });
});

describe('createSupabaseRoundRepository economy', () => {
  it('reads gold on each character and the open shop into the round context', async () => {
    const { client } = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      currentShop: { name: 'Old Mara', itemIds: ['staff', 'story'] },
      players: [{ id: 'p1', display_name: 'Prem', weapon_id: null, hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0, gold: 14 }],
    });
    const context = await createSupabaseRoundRepository(client).getRoundContext('r1');
    expect(context.characters[0].gold).toBe(14);
    expect(context.currentShop).toEqual({ name: 'Old Mara', itemIds: ['staff'] });
  });

  it('has no shop when none is stored', async () => {
    const { client } = createFakeSupabase({ roundsById: { r1: { campaign_id: 'c1' } }, campaignSummary: null });
    expect((await createSupabaseRoundRepository(client).getRoundContext('r1')).currentShop).toBeNull();
  });

  it('applies gold through the atomic apply_changes function, clamped at 0 so one overspent pay cannot roll back everyone else\'s gold', async () => {
    const calls: unknown[] = [];
    const client: any = { rpc: (name: string, args: unknown) => { calls.push([name, args]); return Promise.resolve({ error: null }); } };
    await createSupabaseRoundRepository(client).applyGold([{ playerId: 'p1', delta: 8 }, { playerId: 'p2', delta: -3 }]);
    expect(calls).toEqual([['apply_changes', { changes: [
      { playerId: 'p1', goldDelta: 8, items: null, clamp: true },
      { playerId: 'p2', goldDelta: -3, items: null, clamp: true },
    ] }]]);
  });

  it('throws when the gold call fails, and does nothing for an empty list', async () => {
    const failing: any = { rpc: () => Promise.resolve({ error: new Error('nope') }) };
    await expect(createSupabaseRoundRepository(failing).applyGold([{ playerId: 'p1', delta: 1 }])).rejects.toThrow('nope');
    const never: any = { rpc: () => { throw new Error('should not call'); } };
    await createSupabaseRoundRepository(never).applyGold([]);
  });

  it('sets and clears the shop on the campaign', async () => {
    const updates: unknown[] = [];
    const client: any = { from: (table: string) => ({ update: (payload: unknown) => ({ eq: (_c: string, id: string) => { updates.push({ table, payload, id }); return Promise.resolve({ error: null }); } }) }) };
    const repository = createSupabaseRoundRepository(client);
    await repository.setShop('c1', { name: 'Mara', itemIds: ['staff'] });
    await repository.setShop('c1', null);
    expect(updates).toEqual([
      { table: 'campaigns', payload: { current_shop: { name: 'Mara', itemIds: ['staff'] } }, id: 'c1' },
      { table: 'campaigns', payload: { current_shop: null }, id: 'c1' },
    ]);
  });
});

describe('createSupabaseRoundRepository encounter', () => {
  const wolf = { name: 'หมาป่า', tier: 'normal', pip: 1, maxPip: 2, fled: false };

  it('reads a valid stored encounter into the round context', async () => {
    const { client } = createFakeSupabase({ roundsById: { r1: { campaign_id: 'c1' } }, campaignSummary: null, currentEncounter: { enemies: [wolf] } });
    expect((await createSupabaseRoundRepository(client).getRoundContext('r1')).currentEncounter).toEqual({ enemies: [wolf] });
  });

  it('has no encounter when none is stored or the value is invalid', async () => {
    const { client } = createFakeSupabase({ roundsById: { r1: { campaign_id: 'c1' } }, campaignSummary: null });
    expect((await createSupabaseRoundRepository(client).getRoundContext('r1')).currentEncounter).toBeNull();
    const bad = createFakeSupabase({ roundsById: { r1: { campaign_id: 'c1' } }, campaignSummary: null, currentEncounter: { enemies: 'x' } });
    expect((await createSupabaseRoundRepository(bad.client).getRoundContext('r1')).currentEncounter).toBeNull();
  });

  it('sets and clears the encounter on the campaign', async () => {
    const updates: unknown[] = [];
    const client: any = { from: (table: string) => ({ update: (payload: unknown) => ({ eq: (_c: string, id: string) => { updates.push({ table, payload, id }); return Promise.resolve({ error: null }); } }) }) };
    const repository = createSupabaseRoundRepository(client);
    await repository.setEncounter('c1', { enemies: [wolf] } as any);
    await repository.setEncounter('c1', null);
    expect(updates).toEqual([
      { table: 'campaigns', payload: { current_encounter: { enemies: [wolf] } }, id: 'c1' },
      { table: 'campaigns', payload: { current_encounter: null }, id: 'c1' },
    ]);
  });
});
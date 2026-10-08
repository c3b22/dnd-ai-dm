import { describe, it, expect } from 'vitest';
import { respawnPlayer, respawnLevel, RespawnError } from './respawn';
import { CLASSES } from '@/lib/character/classes';
import { LEVEL_XP_THRESHOLDS } from '@/lib/character/constants';

interface Row { id: string; user_id: string; status: string; xp: number }

function fakeSupabase(rows: Row[], options: { updateRows?: unknown[]; rejectColumn?: string } = {}) {
  const updates: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  const kitInserts: unknown[] = [];
  const client: any = {
    from: (table: string) => {
      if (table === 'inventory_items') {
        return {
          delete: () => ({ eq: (_c: string, v: string) => { deletes.push(v); return Promise.resolve({ error: null }); } }),
          insert: (payload: unknown) => { kitInserts.push(payload); return Promise.resolve({ error: null }); },
        };
      }
      return {
        select: () => ({
          eq: (_c: string, campaignId: string) => {
            const inCampaign = rows.filter(() => campaignId === 'camp-1');
            return Object.assign(Promise.resolve({ data: inCampaign, error: null }), {
              eq: (_c2: string, userId: string) => ({
                maybeSingle: () => Promise.resolve({ data: inCampaign.find((r) => r.user_id === userId) ?? null, error: null }),
              }),
            });
          },
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => {
                if (options.rejectColumn && options.rejectColumn in payload) {
                  return Promise.resolve({ data: null, error: { message: `Could not find the '${options.rejectColumn}' column of 'players'` } });
                }
                updates.push(payload);
                return Promise.resolve({ data: options.updateRows ?? [{ id: 'me' }], error: null });
              },
            }),
          }),
        }),
      };
    },
  };
  return { client, updates, deletes, kitInserts };
}

const me: Row = { id: 'me', user_id: 'u1', status: 'dead', xp: 999 };
const base = { campaignId: 'camp-1', userId: 'u1', displayName: 'Newbie', classId: 'cleric', backstory: 'ลูกศิษย์วัด' };

describe('respawnLevel', () => {
  it('averages living friends levels rounded down, min 1', () => {
    expect(respawnLevel([{ xp: 270 }, { xp: 420 }])).toBe(4); // levels 4 and 5 -> 4.5 -> 4
    expect(respawnLevel([{ xp: 60 }, { xp: 0 }, { xp: 0 }])).toBe(1);
    expect(respawnLevel([])).toBe(1);
  });
});

describe('respawnPlayer', () => {
  it('overwrites the dead row at the average level of living friends', async () => {
    const { client, updates, deletes, kitInserts } = fakeSupabase([
      me,
      { id: 'a', user_id: 'u2', status: 'active', xp: 270 }, // level 4
      { id: 'b', user_id: 'u3', status: 'downed', xp: 420 }, // level 5
      { id: 'c', user_id: 'u4', status: 'dead', xp: 1620 }, // ignored
    ]);
    await respawnPlayer(client, base);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      display_name: 'Newbie',
      class_id: 'cleric',
      weapon_id: 'staff',
      status: 'active',
      xp: LEVEL_XP_THRESHOLDS[3],
      gold: 0,
      hp: 35,
      max_hp: 20,
      abilities: CLASSES.cleric.abilities,
      ability_choices_used: 0,
      death_saves: null,
      revives_since_sanctuary: 0,
      ability_cooldown: 0,
      backstory: 'ลูกศิษย์วัด',
      personality: null,
      goal: null,
    });
    // the identity of the row (created_at = room ownership, turn_order, user_id) is never touched
    expect(updates[0]).not.toHaveProperty('created_at');
    expect(updates[0]).not.toHaveProperty('turn_order');
    expect(updates[0]).not.toHaveProperty('user_id');
    expect(deletes).toEqual(['me']);
    expect(kitInserts).toEqual([
      [
        { campaign_id: 'camp-1', player_id: 'me', item_id: 'staff', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
        { campaign_id: 'camp-1', player_id: 'me', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false },
      ],
    ]);
  });

  it('starts at level 1 when nobody else survives', async () => {
    const { client, updates } = fakeSupabase([me, { id: 'c', user_id: 'u4', status: 'dead', xp: 1620 }]);
    await respawnPlayer(client, base);
    expect(updates[0]).toMatchObject({ xp: 0, hp: 20, max_hp: 20 });
  });

  it('starts with a fresh improvement count at a high level', async () => {
    const { client, updates } = fakeSupabase([me, { id: 'a', user_id: 'u2', status: 'active', xp: 1050 }]); // level 8
    await respawnPlayer(client, base);
    expect(updates[0]).toMatchObject({ xp: LEVEL_XP_THRESHOLDS[7], ability_choices_used: 0 });
  });

  it('keeps going when optional columns are missing in production', async () => {
    const { client, updates } = fakeSupabase([me], { rejectColumn: 'death_saves' });
    await respawnPlayer(client, base);
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty('death_saves');
  });

  it('404 when the caller is not in the campaign', async () => {
    const { client, updates } = fakeSupabase([me]);
    await expect(respawnPlayer(client, { ...base, userId: 'stranger' })).rejects.toMatchObject({ status: 404 });
    expect(updates).toHaveLength(0);
  });

  it.each(['active', 'downed'])('403 when the player is %s, not dead', async (status) => {
    const { client, updates, deletes } = fakeSupabase([{ ...me, status }]);
    const error = await respawnPlayer(client, base).catch((e) => e);
    expect(error).toBeInstanceOf(RespawnError);
    expect(error.status).toBe(403);
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('409 when someone else already respawned this row', async () => {
    const { client, deletes } = fakeSupabase([me], { updateRows: [] });
    await expect(respawnPlayer(client, base)).rejects.toMatchObject({ status: 409 });
    expect(deletes).toHaveLength(0);
  });
});

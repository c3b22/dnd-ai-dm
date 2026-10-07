import { describe, it, expect } from 'vitest';
import { EquipError, equipForUser } from './equipItem';

const sword = { player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true };
const bow = { player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: false };

function fakeSupabase(options: { player: { id: string } | null; rows: unknown[] }) {
  const updates: { patch: unknown; filters: Record<string, string> }[] = [];
  const client: any = {
    from(table: string) {
      if (table === 'players') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: options.player, error: null }) }) }) }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: options.rows, error: null }) }),
        update: (patch: unknown) => {
          const filters: Record<string, string> = {};
          const builder: any = {
            eq: (column: string, value: string) => { filters[column] = value; return builder; },
            then: (resolve: (v: unknown) => unknown) => { updates.push({ patch, filters }); return Promise.resolve({ error: null }).then(resolve); },
          };
          return builder;
        },
      };
    },
  };
  return { client, updates };
}

const params = { campaignId: 'c1', userId: 'u1' };

describe('equipForUser', () => {
  it('swaps the equipped weapon, unequipping the old one before equipping the new one', async () => {
    const { client, updates } = fakeSupabase({ player: { id: 'p1' }, rows: [sword, bow] });
    const items = await equipForUser(client, { ...params, itemId: 'shortbow', action: 'equip' });
    expect(updates.map((u) => [u.filters.item_id, (u.patch as any).equipped])).toEqual([['shortsword', false], ['shortbow', true]]);
    expect(items.find((i) => i.itemId === 'shortbow')!.equipped).toBe(true);
  });

  it('unequips an equipped item', async () => {
    const { client, updates } = fakeSupabase({ player: { id: 'p1' }, rows: [sword] });
    await equipForUser(client, { ...params, itemId: 'shortsword', action: 'unequip' });
    expect(updates).toHaveLength(1);
    expect((updates[0].patch as any).equipped).toBe(false);
  });

  it('rejects a caller who is not a player in this campaign', async () => {
    const { client } = fakeSupabase({ player: null, rows: [] });
    await expect(equipForUser(client, { ...params, itemId: 'shortsword', action: 'equip' })).rejects.toMatchObject({ status: 403 });
  });

  it('rejects equipping something not owned or without a slot, and unequipping something not worn', async () => {
    const { client } = fakeSupabase({ player: { id: 'p1' }, rows: [sword, { ...bow, item_id: 'potion_minor', slot: null }] });
    await expect(equipForUser(client, { ...params, itemId: 'staff', action: 'equip' })).rejects.toBeInstanceOf(EquipError);
    await expect(equipForUser(client, { ...params, itemId: 'potion_minor', action: 'equip' })).rejects.toBeInstanceOf(EquipError);
    await expect(equipForUser(client, { ...params, itemId: 'potion_minor', action: 'unequip' })).rejects.toBeInstanceOf(EquipError);
  });
});

describe('equipForUser accessories (F5d)', () => {
  const ring = { player_id: 'p1', item_id: 'acc_acrobat', custom_name: '', quantity: 1, slot: 'accessory', equipped: true };
  const shawl = { ...ring, item_id: 'acc_silentshawl', equipped: false };

  it('swaps the worn accessory, unequipping first, and leaves the weapon alone', async () => {
    const { client, updates } = fakeSupabase({ player: { id: 'p1' }, rows: [sword, ring, shawl] });
    const items = await equipForUser(client, { ...params, itemId: 'acc_silentshawl', action: 'equip' });
    expect(updates.map((u) => [u.filters.item_id, (u.patch as any).equipped])).toEqual([['acc_acrobat', false], ['acc_silentshawl', true]]);
    expect(items.find((i) => i.itemId === 'shortsword')!.equipped).toBe(true);
  });

  it('equips into an empty accessory slot and unequips it', async () => {
    const a = fakeSupabase({ player: { id: 'p1' }, rows: [{ ...ring, equipped: false }] });
    await equipForUser(a.client, { ...params, itemId: 'acc_acrobat', action: 'equip' });
    expect(a.updates.map((u) => (u.patch as any).equipped)).toEqual([true]);
    const b = fakeSupabase({ player: { id: 'p1' }, rows: [ring] });
    await equipForUser(b.client, { ...params, itemId: 'acc_acrobat', action: 'unequip' });
    expect(b.updates.map((u) => (u.patch as any).equipped)).toEqual([false]);
  });
});

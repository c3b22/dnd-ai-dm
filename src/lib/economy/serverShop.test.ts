import { describe, it, expect, vi } from 'vitest';
import { shopForUser } from './serverShop';
import { EconomyError } from './errors';

const potionRow = { player_id: 'p1', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false };

function fakeSupabase(options: { player: object | null; shop: unknown; rows: unknown[] }) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const messages: unknown[] = [];
  const client: any = {
    rpc,
    from(table: string) {
      if (table === 'players') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: options.player, error: null }) }) }) }) };
      }
      if (table === 'campaigns') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { current_shop: options.shop }, error: null }) }) }) };
      }
      if (table === 'inventory_items') {
        return { select: () => ({ eq: () => Promise.resolve({ data: options.rows, error: null }) }) };
      }
      return { insert: (payload: unknown) => { messages.push(payload); return Promise.resolve({ error: null }); } };
    },
  };
  return { client, rpc, messages };
}
const shop = { name: 'Old Mara', itemIds: ['potion_minor', 'shortsword'] };
const player = { id: 'p1', display_name: 'Prem', gold: 50 };
const params = { campaignId: 'c1', userId: 'u1' };

describe('shopForUser', () => {
  it('buys: one atomic call with the new pack and negative gold delta, then a log line', async () => {
    const { client, rpc, messages } = fakeSupabase({ player, shop, rows: [] });
    const result = await shopForUser(client, { ...params, action: 'buy', itemId: 'shortsword' });
    expect(rpc).toHaveBeenCalledWith('apply_changes', { changes: [{
      playerId: 'p1', goldDelta: -30,
      items: [{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }],
      baseItems: [],
    }] });
    expect(result.line).toBe('Prem ซื้อ ดาบสั้น (−30 ทอง)');
    expect(messages).toEqual([{ campaign_id: 'c1', round_id: null, role: 'system', content: JSON.stringify({ type: 'stats', changes: ['Prem ซื้อ ดาบสั้น (−30 ทอง)'] }) }]);
  });

  it('sells at half price', async () => {
    const { client, rpc } = fakeSupabase({ player, shop, rows: [potionRow] });
    const result = await shopForUser(client, { ...params, action: 'sell', itemId: 'potion_minor' });
    expect(rpc).toHaveBeenCalledWith('apply_changes', { changes: [{
      playerId: 'p1', goldDelta: 5, items: [],
      baseItems: [{ itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false }],
    }] });
    expect(result.line).toBe('Prem ขาย ยาฟื้นฟูเล็ก (+5 ทอง)');
  });

  it('maps each refusal to a 409 and writes nothing', async () => {
    const { client, rpc, messages } = fakeSupabase({ player: { ...player, gold: 1 }, shop, rows: [] });
    await expect(shopForUser(client, { ...params, action: 'buy', itemId: 'shortsword' })).rejects.toMatchObject({ code: 'no_gold', status: 409 });
    const closed = fakeSupabase({ player, shop: null, rows: [] });
    await expect(shopForUser(closed.client, { ...params, action: 'buy', itemId: 'shortsword' })).rejects.toMatchObject({ code: 'closed', status: 409 });
    expect(rpc).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it('rejects a caller who is not a player in this campaign with 403', async () => {
    const { client } = fakeSupabase({ player: null, shop, rows: [] });
    await expect(shopForUser(client, { ...params, action: 'buy', itemId: 'shortsword' })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('turns an overspend caught by the database (gold check) into no_gold', async () => {
    const { client, rpc } = fakeSupabase({ player, shop, rows: [] });
    rpc.mockResolvedValue({ error: { code: '23514', message: 'players_gold_check' } });
    await expect(shopForUser(client, { ...params, action: 'buy', itemId: 'shortsword' })).rejects.toMatchObject({ code: 'no_gold', status: 409 });
  });

  it('turns a concurrent inventory change caught by the database into a conflict', async () => {
    const { client, rpc } = fakeSupabase({ player, shop, rows: [] });
    rpc.mockResolvedValue({ error: { code: 'EC001', message: 'inventory changed concurrently for player p1' } });
    await expect(shopForUser(client, { ...params, action: 'buy', itemId: 'shortsword' })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});

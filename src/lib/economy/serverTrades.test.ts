import { describe, it, expect, vi } from 'vitest';
import { tradeForUser } from './serverTrades';

interface State {
  players: Record<string, { id: string; campaign_id: string; user_id: string; display_name: string; gold: number }>;
  rows: Record<string, unknown[]>;
  trades: any[];
}

function fakeSupabase(state: State) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const messages: any[] = [];
  const inserted: any[] = [];
  const updates: { patch: any; filters: Record<string, string> }[] = [];
  const client: any = {
    rpc,
    from(table: string) {
      if (table === 'players') {
        const filters: Record<string, string> = {};
        const b: any = {
          select: () => b,
          eq: (c: string, v: string) => { filters[c] = v; return b; },
          maybeSingle: () => Promise.resolve({
            data: Object.values(state.players).find((p) => Object.entries(filters).every(([c, v]) => (p as any)[c] === v)) ?? null,
            error: null,
          }),
        };
        return b;
      }
      if (table === 'inventory_items') {
        return { select: () => ({ eq: (_c: string, id: string) => Promise.resolve({ data: state.rows[id] ?? [], error: null }) }) };
      }
      if (table === 'trades') {
        const filters: Record<string, string> = {};
        let mode: 'select' | 'count' | 'update' = 'select';
        let patch: any;
        const matching = () => state.trades.filter((t) => Object.entries(filters).every(([c, v]) => t[c] === v));
        const b: any = {
          select: (_cols?: string, opts?: { head?: boolean }) => { if (opts?.head) mode = 'count'; return b; },
          eq: (c: string, v: string) => { filters[c] = v; return b; },
          maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
          update: (p: any) => { mode = 'update'; patch = p; return b; },
          insert: (p: any) => { inserted.push(p); return { select: () => ({ single: () => Promise.resolve({ data: { id: 't-new' }, error: null }) }) }; },
          then: (resolve: any) => {
            if (mode === 'count') return Promise.resolve({ count: matching().length, error: null }).then(resolve);
            if (mode === 'update') { updates.push({ patch, filters: { ...filters } }); return Promise.resolve({ error: null }).then(resolve); }
            return Promise.resolve({ data: matching(), error: null }).then(resolve);
          },
        };
        return b;
      }
      return { insert: (p: unknown) => { messages.push(p); return Promise.resolve({ error: null }); } };
    },
  };
  return { client, rpc, messages, inserted, updates };
}

const t = (itemId: string, quantity = 1, customName = '') => ({ itemId, customName, quantity });
const sword = { player_id: 'pA', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true };
const potion = { player_id: 'pB', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false };
const baseState = (over: Partial<State> = {}): State => ({
  players: {
    pA: { id: 'pA', campaign_id: 'c1', user_id: 'u1', display_name: 'Prem', gold: 20 },
    pB: { id: 'pB', campaign_id: 'c1', user_id: 'u2', display_name: 'Suki', gold: 10 },
  },
  rows: { pA: [sword], pB: [potion] },
  trades: [],
  ...over,
});
const pending = (over: object = {}) => ({
  id: 't1', campaign_id: 'c1', from_player_id: 'pA', to_player_id: 'pB',
  give_items: [t('shortsword')], give_gold: 5, want_items: [t('potion_minor')], want_gold: 0,
  status: 'pending', created_at: new Date().toISOString(), ...over,
});
const terms = (over: object = {}) => ({ giveItems: [], giveGold: 0, wantItems: [], wantGold: 0, ...over });
const propose = (client: any, toPlayerId: string, over: object = {}, userId = 'u1') =>
  tradeForUser(client, { campaignId: 'c1', userId, action: 'propose', toPlayerId, terms: terms(over) });
const respond = (client: any, action: 'accept' | 'decline' | 'cancel', userId: string) =>
  tradeForUser(client, { campaignId: 'c1', userId, action, tradeId: 't1' });

describe('tradeForUser propose', () => {
  it('stores a pending proposal from the caller to another player in the campaign', async () => {
    const { client, inserted } = fakeSupabase(baseState());
    const result = await propose(client, 'pB', { giveItems: [t('shortsword')], giveGold: 5, wantItems: [t('potion_minor')] });
    expect(result).toEqual({ tradeId: 't-new' });
    expect(inserted[0]).toMatchObject({ campaign_id: 'c1', from_player_id: 'pA', to_player_id: 'pB', give_gold: 5, want_gold: 0 });
  });

  it('accepts a request that gives nothing (asking for something is fine)', async () => {
    const { client } = fakeSupabase(baseState());
    await expect(propose(client, 'pB', { wantItems: [t('potion_minor')] })).resolves.toEqual({ tradeId: 't-new' });
  });

  it('rejects yourself, a stranger, and a trade with nothing on either side', async () => {
    const { client } = fakeSupabase(baseState());
    await expect(propose(client, 'pA')).rejects.toMatchObject({ code: 'self', status: 400 });
    await expect(propose(client, 'pZ', { giveGold: 1 })).rejects.toMatchObject({ code: 'not_found', status: 400 });
    await expect(propose(client, 'pB')).rejects.toMatchObject({ code: 'empty', status: 400 });
  });

  it('rejects offering what you do not have, and malformed terms', async () => {
    const { client } = fakeSupabase(baseState());
    await expect(propose(client, 'pB', { giveItems: [t('staff')] })).rejects.toMatchObject({ code: 'missing_items' });
    await expect(propose(client, 'pB', { giveGold: 99 })).rejects.toMatchObject({ code: 'no_gold' });
    await expect(propose(client, 'pB', { giveGold: -1 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(propose(client, 'pB', { giveItems: [t('shortsword', 0)] })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects a fourth pending proposal from the same player', async () => {
    const mine = [0, 1, 2].map((i) => pending({ id: `x${i}` }));
    const { client } = fakeSupabase(baseState({ trades: mine }));
    await expect(propose(client, 'pB', { giveGold: 1 })).rejects.toMatchObject({ code: 'too_many', status: 409 });
  });

  it('rejects a caller who is not a player in this campaign', async () => {
    const { client } = fakeSupabase(baseState());
    await expect(propose(client, 'pB', { giveGold: 1 }, 'stranger')).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });
});

describe('tradeForUser accept', () => {
  it('moves items and gold for both players in one apply_changes call with the trade id, then posts a log line', async () => {
    const { client, rpc, messages } = fakeSupabase(baseState({ trades: [pending()] }));
    const result = await respond(client, 'accept', 'u2');
    expect(rpc).toHaveBeenCalledWith('apply_changes', {
      changes: [
        {
          playerId: 'pA', goldDelta: -5,
          items: [{ itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false }],
          baseItems: [{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }],
        },
        {
          playerId: 'pB', goldDelta: 5,
          items: [{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }],
          baseItems: [{ itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false }],
        },
      ],
      trade_id: 't1',
    });
    expect(result.line).toBe('Prem แลกกับ Suki: ให้ ดาบสั้น, 5 ทอง ได้ ยาฟื้นฟูเล็ก');
    expect(JSON.parse(messages[0].content)).toEqual({ type: 'stats', changes: [result.line] });
  });

  it('refuses anyone but the recipient, and a trade that is no longer pending', async () => {
    const { client } = fakeSupabase(baseState({ trades: [pending()] }));
    await expect(respond(client, 'accept', 'u1')).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    const done = fakeSupabase(baseState({ trades: [pending({ status: 'accepted' })] }));
    await expect(respond(done.client, 'accept', 'u2')).rejects.toMatchObject({ code: 'not_pending', status: 409 });
  });

  it('refuses a proposal older than 30 minutes', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const { client, rpc } = fakeSupabase(baseState({ trades: [pending({ created_at: old })] }));
    await expect(respond(client, 'accept', 'u2')).rejects.toMatchObject({ code: 'expired', status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('re-validates against the current packs and gold, and does not call the database when it fails', async () => {
    const gone = fakeSupabase(baseState({ trades: [pending()], rows: { pA: [sword], pB: [] } }));
    await expect(respond(gone.client, 'accept', 'u2')).rejects.toMatchObject({ code: 'missing_items' });
    const broke = fakeSupabase(baseState({ trades: [pending({ want_gold: 50 })] }));
    await expect(respond(broke.client, 'accept', 'u2')).rejects.toMatchObject({ code: 'no_gold' });
    expect(gone.rpc).not.toHaveBeenCalled();
    expect(broke.rpc).not.toHaveBeenCalled();
  });

  it('refuses when the receiving pack would overflow', async () => {
    const gift = pending({ give_items: [t('shortsword')], want_items: [], give_gold: 0 });
    const { client, rpc } = fakeSupabase(baseState({ trades: [gift], rows: { pA: [sword], pB: [{ ...potion, quantity: 10 }] } }));
    await expect(respond(client, 'accept', 'u2')).rejects.toMatchObject({ code: 'full', status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps a gold check violation or a not-pending error from the database', async () => {
    const a = fakeSupabase(baseState({ trades: [pending()] }));
    a.rpc.mockResolvedValue({ error: { code: '23514', message: 'players_gold_check' } });
    await expect(respond(a.client, 'accept', 'u2')).rejects.toMatchObject({ code: 'no_gold' });
    const b = fakeSupabase(baseState({ trades: [pending()] }));
    b.rpc.mockResolvedValue({ error: { message: 'trade is not pending' } });
    await expect(respond(b.client, 'accept', 'u2')).rejects.toMatchObject({ code: 'not_pending' });
  });

  it('maps a concurrent inventory change from the database to a conflict', async () => {
    const { client, rpc } = fakeSupabase(baseState({ trades: [pending()] }));
    rpc.mockResolvedValue({ error: { code: 'EC001', message: 'inventory changed concurrently for player pA' } });
    await expect(respond(client, 'accept', 'u2')).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});

describe('tradeForUser decline and cancel', () => {
  it('lets only the recipient decline and only the proposer cancel', async () => {
    const d = fakeSupabase(baseState({ trades: [pending()] }));
    await expect(respond(d.client, 'decline', 'u1')).rejects.toMatchObject({ code: 'forbidden' });
    await respond(d.client, 'decline', 'u2');
    expect(d.updates[0].patch).toMatchObject({ status: 'declined' });

    const c = fakeSupabase(baseState({ trades: [pending()] }));
    await expect(respond(c.client, 'cancel', 'u2')).rejects.toMatchObject({ code: 'forbidden' });
    await respond(c.client, 'cancel', 'u1');
    expect(c.updates[0].patch).toMatchObject({ status: 'cancelled' });
  });

  it('refuses to change a trade that is no longer pending', async () => {
    const { client } = fakeSupabase(baseState({ trades: [pending({ status: 'declined' })] }));
    await expect(respond(client, 'cancel', 'u1')).rejects.toMatchObject({ code: 'not_pending' });
  });
});

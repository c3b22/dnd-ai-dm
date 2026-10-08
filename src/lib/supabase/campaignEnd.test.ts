import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('./client', () => ({ supabaseBrowserClient: {} }));
import { fetchCampaignEnd, fetchEpilogue } from './campaignEnd';

type Result = { data: unknown; error: unknown };

function client(handlers: { campaigns: (col: string) => Result; messages?: () => Result }) {
  return {
    from: () => {
      let col = '';
      const q: any = {
        select: (c: string) => {
          col = c;
          return q;
        },
        eq: () => q,
        like: () => q,
        order: () => q,
        limit: () => Promise.resolve(handlers.messages!()),
        maybeSingle: () => Promise.resolve(handlers.campaigns(col)),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe('fetchCampaignEnd', () => {
  it('reports ended with normalized stats', async () => {
    const c = client({
      campaigns: (col) =>
        col === 'status' ? { data: { status: 'ended' }, error: null } : { data: { stats: { rounds: 20, gold: 5 } }, error: null },
    });
    const r = await fetchCampaignEnd('c1', c);
    expect(r.ended).toBe(true);
    expect(r.stats?.rounds).toBe(20);
    expect(r.stats?.gold).toBe(5);
  });

  it('treats an active campaign as not ended', async () => {
    const c = client({ campaigns: () => ({ data: { status: 'active' }, error: null }) });
    expect(await fetchCampaignEnd('c1', c)).toEqual({ ended: false, stats: null });
  });

  it('treats a missing status column as not ended', async () => {
    const c = client({ campaigns: () => ({ data: null, error: { message: 'column does not exist' } }) });
    expect(await fetchCampaignEnd('c1', c)).toEqual({ ended: false, stats: null });
  });

  it('is ended with null stats when the stats column is unreadable', async () => {
    const c = client({
      campaigns: (col) =>
        col === 'status' ? { data: { status: 'ended' }, error: null } : { data: null, error: { message: 'no column' } },
    });
    expect(await fetchCampaignEnd('c1', c)).toEqual({ ended: true, stats: null });
  });
});

describe('fetchEpilogue', () => {
  it('returns the newest epilogue message content', async () => {
    const c = client({
      campaigns: () => ({ data: null, error: null }),
      messages: () => ({ data: [{ content: '— บทส่งท้าย —\nA' }], error: null }),
    });
    expect(await fetchEpilogue('c1', c)).toBe('— บทส่งท้าย —\nA');
  });

  it('returns null when there is none or on error', async () => {
    const none = client({ campaigns: () => ({ data: null, error: null }), messages: () => ({ data: [], error: null }) });
    const bad = client({ campaigns: () => ({ data: null, error: null }), messages: () => ({ data: null, error: { message: 'x' } }) });
    expect(await fetchEpilogue('c1', none)).toBeNull();
    expect(await fetchEpilogue('c1', bad)).toBeNull();
  });
});

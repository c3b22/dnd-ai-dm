import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, run } = vi.hoisted(() => ({ getUser: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/ai/geminiClient', () => ({ generateNarration: vi.fn() }));
vi.mock('@/lib/ai/vercelAiSdkAdapter', () => ({ realGeminiDeps: {} }));
vi.mock('@/lib/campaign/recap', async (orig) => ({
  ...(await orig<typeof import('@/lib/campaign/recap')>()),
  getRecap: run,
  supabaseRecapStore: () => ({}),
}));

import { RecapError } from '@/lib/campaign/recap';
import { GET } from './route';

const call = (token?: string, query = '') =>
  GET(
    new NextRequest(`http://localhost/api/campaigns/c1/recap${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('GET campaign recap', () => {
  beforeEach(() => {
    getUser.mockReset();
    run.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('passes force=1 through and returns the result', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue({ needed: true, text: 'x', cached: false, fromRoundId: 'a', toRoundId: 'b' });
    const res = await call('t', '?force=1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needed: true, text: 'x', cached: false, fromRoundId: 'a', toRoundId: 'b' });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', force: true });
  });

  it('defaults to auto mode', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue({ needed: false });
    const res = await call('t');
    expect(await res.json()).toEqual({ needed: false });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', force: false });
  });

  it.each([403, 503] as const)('maps RecapError %s to its status', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new RecapError('nope', status));
    expect((await call('t')).status).toBe(status);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, tradeForUser } = vi.hoisted(() => ({ getUser: vi.fn(), tradeForUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/economy/serverTrades', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/economy/serverTrades')>()),
  tradeForUser,
}));

import { POST } from './route';
import { EconomyError } from '@/lib/economy/errors';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/trades', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST trades', () => {
  beforeEach(() => {
    getUser.mockReset();
    tradeForUser.mockReset();
  });

  it('rejects an unknown action with 400', async () => {
    expect((await call({ action: 'nope' }, 't')).status).toBe(400);
  });

  it('rejects propose without toPlayerId or terms', async () => {
    expect((await call({ action: 'propose', terms: {} }, 't')).status).toBe(400);
    expect((await call({ action: 'propose', toPlayerId: 'p2' }, 't')).status).toBe(400);
  });

  it('rejects accept/decline/cancel without a tradeId', async () => {
    expect((await call({ action: 'accept' }, 't')).status).toBe(400);
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ action: 'accept', tradeId: 't1' })).status).toBe(401);
  });

  it('passes accept through and returns the result', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    tradeForUser.mockResolvedValue({ tradeId: 't1', line: 'ok' });
    const response = await call({ action: 'accept', tradeId: 't1' }, 't');
    expect(tradeForUser).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', action: 'accept', tradeId: 't1' });
    expect(await response.json()).toEqual({ tradeId: 't1', line: 'ok' });
  });

  it('passes propose through with toPlayerId and terms', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    tradeForUser.mockResolvedValue({ tradeId: 't-new' });
    const terms = { giveItems: [], giveGold: 0, wantItems: [], wantGold: 5 };
    await call({ action: 'propose', toPlayerId: 'p2', terms }, 't');
    expect(tradeForUser).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', action: 'propose', toPlayerId: 'p2', terms });
  });

  it('maps an EconomyError to its status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    tradeForUser.mockRejectedValue(new EconomyError('expired', 409));
    const response = await call({ action: 'accept', tradeId: 't1' }, 't');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'expired' });
  });
});

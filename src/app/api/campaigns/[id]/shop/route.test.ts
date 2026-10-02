import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, shopForUser } = vi.hoisted(() => ({ getUser: vi.fn(), shopForUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/economy/serverShop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/economy/serverShop')>()),
  shopForUser,
}));

import { POST } from './route';
import { EconomyError } from '@/lib/economy/errors';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/shop', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST shop', () => {
  beforeEach(() => {
    getUser.mockReset();
    shopForUser.mockReset();
  });

  it('rejects a bad body with 400', async () => {
    expect((await call({ action: 'buy' }, 't')).status).toBe(400);
    expect((await call({ itemId: 'staff', action: 'trade' }, 't')).status).toBe(400);
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ itemId: 'staff', action: 'buy' })).status).toBe(401);
  });

  it('buys for the authenticated user and returns the line', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    shopForUser.mockResolvedValue({ line: 'Prem ซื้อ ไม้เท้า (−20 ทอง)' });
    const response = await call({ itemId: 'staff', action: 'buy' }, 't');
    expect(shopForUser).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', action: 'buy', itemId: 'staff', customName: undefined });
    expect(await response.json()).toEqual({ line: 'Prem ซื้อ ไม้เท้า (−20 ทอง)' });
  });

  it('maps an EconomyError to its status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    shopForUser.mockRejectedValue(new EconomyError('no_gold', 409));
    const response = await call({ itemId: 'staff', action: 'buy' }, 't');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'no_gold' });
  });
});

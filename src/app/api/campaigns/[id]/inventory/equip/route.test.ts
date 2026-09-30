import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, equipForUser } = vi.hoisted(() => ({ getUser: vi.fn(), equipForUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/inventory/equipItem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/inventory/equipItem')>()),
  equipForUser,
}));

import { POST } from './route';
import { EquipError } from '@/lib/inventory/equipItem';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/inventory/equip', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST equip', () => {
  beforeEach(() => {
    getUser.mockReset();
    equipForUser.mockReset();
  });

  it('rejects a bad body with 400', async () => {
    expect((await call({ action: 'equip' }, 't')).status).toBe(400);
    expect((await call({ itemId: 'shortbow', action: 'wear' }, 't')).status).toBe(400);
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ itemId: 'shortbow', action: 'equip' })).status).toBe(401);
  });

  it('equips for the authenticated user and returns the items', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    equipForUser.mockResolvedValue([{ itemId: 'shortbow' }]);
    const response = await call({ itemId: 'shortbow', action: 'equip' }, 't');
    expect(equipForUser).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', itemId: 'shortbow', action: 'equip' });
    expect(await response.json()).toEqual({ items: [{ itemId: 'shortbow' }] });
  });

  it('maps an EquipError to its status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    equipForUser.mockRejectedValue(new EquipError('nope', 403));
    expect((await call({ itemId: 'shortbow', action: 'equip' }, 't')).status).toBe(403);
  });
});

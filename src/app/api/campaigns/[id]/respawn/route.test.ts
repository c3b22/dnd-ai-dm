import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, respawn } = vi.hoisted(() => ({ getUser: vi.fn(), respawn: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/campaign/respawn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/respawn')>()),
  respawnPlayer: respawn,
}));

import { POST } from './route';
import { RespawnError } from '@/lib/campaign/respawn';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/respawn', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST respawn', () => {
  beforeEach(() => {
    getUser.mockReset();
    respawn.mockReset();
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ displayName: 'x' })).status).toBe(401);
    expect(respawn).not.toHaveBeenCalled();
  });

  it('400 without a name or with a bad body', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await call({}, 't')).status).toBe(400);
    expect((await call('nope', 't')).status).toBe(400);
  });

  it('201 respawns the authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    respawn.mockResolvedValue({ playerId: 'p1', level: 3 });
    const response = await call({ displayName: ' Newbie ', classId: 'rogue', backstory: ' เด็กกำพร้า ' }, 't');
    expect(response.status).toBe(201);
    expect(respawn).toHaveBeenCalledWith(expect.anything(), {
      campaignId: 'c1',
      userId: 'u1',
      displayName: 'Newbie',
      classId: 'rogue',
      weaponId: undefined,
      backstory: 'เด็กกำพร้า',
    });
    expect(await response.json()).toEqual({ playerId: 'p1', level: 3 });
  });

  it.each([
    [404, 'not_found'],
    [403, 'not_dead'],
    [409, 'conflict'],
  ] as const)('maps RespawnError %i', async (status, code) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    respawn.mockRejectedValue(new RespawnError(code, status));
    const response = await call({ displayName: 'x' }, 't');
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(code);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, enableSharing, disableSharing } = vi.hoisted(() => ({
  getUser: vi.fn(),
  enableSharing: vi.fn(),
  disableSharing: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/customAdventures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/customAdventures')>()),
  enableSharing,
  disableSharing,
}));

import { POST, DELETE } from './route';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';

const call = (fn: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, method: string, token?: string, id = 'a1') =>
  fn(
    new NextRequest(`http://localhost/api/adventures/${id}/share`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  getUser.mockReset();
  enableSharing.mockReset();
  disableSharing.mockReset();
});

describe('POST /api/adventures/[id]/share', () => {
  it('requires sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call(POST, 'POST')).status).toBe(401);
    expect(enableSharing).not.toHaveBeenCalled();
  });

  it('returns the share code', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    enableSharing.mockResolvedValue('ABCD1234');
    const response = await call(POST, 'POST', 't');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shareCode: 'ABCD1234' });
    expect(enableSharing).toHaveBeenCalledWith(expect.anything(), 'a1', 'u1');
  });

  it.each([403, 404] as const)('maps CustomAdventureError %i', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    enableSharing.mockRejectedValue(new CustomAdventureError('nope', status));
    expect((await call(POST, 'POST', 't')).status).toBe(status);
  });
});

describe('DELETE /api/adventures/[id]/share', () => {
  it('requires sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call(DELETE, 'DELETE')).status).toBe(401);
  });

  it('returns shareCode null', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    disableSharing.mockResolvedValue(undefined);
    const response = await call(DELETE, 'DELETE', 't');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shareCode: null });
    expect(disableSharing).toHaveBeenCalledWith(expect.anything(), 'a1', 'u1');
  });

  it('maps CustomAdventureError 403', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    disableSharing.mockRejectedValue(new CustomAdventureError('not the owner', 403));
    expect((await call(DELETE, 'DELETE', 't')).status).toBe(403);
  });
});

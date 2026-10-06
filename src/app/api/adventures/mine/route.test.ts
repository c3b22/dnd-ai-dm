import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, listMyCustomAdventures } = vi.hoisted(() => ({
  getUser: vi.fn(),
  listMyCustomAdventures: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/customAdventures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/customAdventures')>()),
  listMyCustomAdventures,
}));

import { GET } from './route';

const call = (token?: string) =>
  GET(
    new NextRequest('http://localhost/api/adventures/mine', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  );

describe('GET /api/adventures/mine', () => {
  beforeEach(() => {
    getUser.mockReset();
    listMyCustomAdventures.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
  });

  it('returns the list for the authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    listMyCustomAdventures.mockResolvedValue([{ id: 'a1', titleTh: 't', taglineTh: 'tag', thumbnailUrl: null }]);

    const response = await call('t');

    expect(listMyCustomAdventures).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ adventures: [{ id: 'a1', titleTh: 't', taglineTh: 'tag', thumbnailUrl: null }] });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, importSharedAdventure } = vi.hoisted(() => ({
  getUser: vi.fn(),
  importSharedAdventure: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/sharedAdventures', () => ({ importSharedAdventure }));

import { POST } from './route';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';

const call = (token?: string, code = 'ABCD1234') =>
  POST(
    new NextRequest(`http://localhost/api/adventures/shared/${code}/import`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ code }) }
  );

describe('POST /api/adventures/shared/[code]/import', () => {
  beforeEach(() => {
    getUser.mockReset();
    importSharedAdventure.mockReset();
  });

  it('requires sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(importSharedAdventure).not.toHaveBeenCalled();
  });

  it('returns the copy with 201', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    importSharedAdventure.mockResolvedValue({ id: 'new1' });
    const response = await call('t');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'new1' });
    expect(importSharedAdventure).toHaveBeenCalledWith(expect.anything(), 'ABCD1234', 'u2');
  });

  it.each([400, 404] as const)('maps CustomAdventureError %i', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    importSharedAdventure.mockRejectedValue(new CustomAdventureError('x', status));
    expect((await call('t')).status).toBe(status);
  });
});

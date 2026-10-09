import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, run } = vi.hoisted(() => ({ getUser: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/campaign/seen', () => ({ recordSeen: run }));

import { POST } from './route';

const call = (token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/seen', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST campaign seen', () => {
  beforeEach(() => {
    getUser.mockReset();
    run.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('records the visit for the signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue({ recorded: true });
    const res = await call('t');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1' });
  });

  it.each(['throttled', 'unsupported'] as const)('answers ok without recording when %s', async (reason) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue({ recorded: false, reason });
    const res = await call('t');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
  });

  it('answers 403 for a non-member', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue({ recorded: false, reason: 'not-a-member' });
    expect((await call('t')).status).toBe(403);
  });
});

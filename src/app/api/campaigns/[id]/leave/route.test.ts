import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, run } = vi.hoisted(() => ({ getUser: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/campaign/removeCampaign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/removeCampaign')>()),
  leaveCampaign: run,
}));

import { POST } from './route';
import { RemoveCampaignError } from '@/lib/campaign/removeCampaign';

const call = (token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/leave', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST campaign leaveCampaign', () => {
  beforeEach(() => {
    getUser.mockReset();
    run.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect((await call('bad')).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('succeeds with ok for the signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue(undefined);
    const res = await call('t');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1' });
  });

  it.each([403, 404, 409] as const)('maps RemoveCampaignError %i to its status', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new RemoveCampaignError('nope', status));
    const res = await call('t');
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'nope' });
  });
});

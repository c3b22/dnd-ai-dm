import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, handle } = vi.hoisted(() => ({ getUser: vi.fn(), handle: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/campaign/restVoteService', () => ({ handleRestAction: handle }));

import { POST } from './route';
import { RestVoteError } from '@/lib/campaign/restVote';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/rest', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST rest', () => {
  beforeEach(() => {
    getUser.mockReset();
    handle.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ action: 'agree' })).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it('400 on bad body, unknown action, or propose without a valid kind', async () => {
    expect((await call('nope', 't')).status).toBe(400);
    expect((await call({ action: 'dance' }, 't')).status).toBe(400);
    expect((await call({ action: 'propose' }, 't')).status).toBe(400);
    expect((await call({ action: 'propose', kind: 'nap' }, 't')).status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it('passes the action through and returns the vote', async () => {
    const vote = { kind: 'short', proposerId: 'p1', agree: ['p1'], roundId: 'r1', status: 'open' };
    handle.mockResolvedValue(vote);
    const response = await call({ action: 'propose', kind: 'short' }, 't');
    expect(response.status).toBe(200);
    expect(handle).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', action: 'propose', kind: 'short' });
    expect(await response.json()).toEqual({ vote });
  });

  it('cancel returns a null vote', async () => {
    handle.mockResolvedValue(null);
    expect(await (await call({ action: 'cancel' }, 't')).json()).toEqual({ vote: null });
  });

  it.each([
    [409, 'in_encounter'],
    [403, 'not_active'],
    [404, 'not_member'],
    [503, 'unavailable'],
  ] as const)('maps RestVoteError %i', async (status, code) => {
    handle.mockRejectedValue(new RestVoteError(code, status));
    const response = await call({ action: 'agree' }, 't');
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(code);
  });
});

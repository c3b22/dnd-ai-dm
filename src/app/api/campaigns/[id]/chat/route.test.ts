import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, run } = vi.hoisted(() => ({ getUser: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/campaign/teamChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/teamChat')>()),
  postTeamChat: run,
}));

import { POST } from './route';
import { TeamChatError } from '@/lib/campaign/teamChat';

const call = (token?: string, body: unknown = { content: 'hi' }) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/chat', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST campaign chat', () => {
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

  it('posts the message for the signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockResolvedValue(undefined);
    const res = await call('t', { content: 'hello' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', content: 'hello' });
  });

  it('treats a malformed body as empty content', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new TeamChatError('message is empty', 400));
    const res = await call('t', 'not json');
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', content: undefined });
    expect(res.status).toBe(400);
  });

  it.each([400, 403] as const)('maps TeamChatError %i to its status', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new TeamChatError('nope', status));
    const res = await call('t');
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'nope' });
  });
});

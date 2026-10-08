import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, start } = vi.hoisted(() => ({ getUser: vi.fn(), start: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/ai/geminiClient', () => ({ generateNarration: vi.fn() }));
vi.mock('@/lib/ai/vercelAiSdkAdapter', () => ({ realGeminiDeps: {} }));
vi.mock('@/lib/campaign/sequel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/sequel')>()),
  startSequel: start,
  supabaseSequelStore: () => ({}),
}));

import { POST } from './route';
import { SequelError } from '@/lib/campaign/sequel';

const call = (token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/sequel', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST sequel', () => {
  beforeEach(() => {
    getUser.mockReset();
    start.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it('starts the sequel for the caller', async () => {
    start.mockResolvedValue({ chapter: 2, adventureId: 'a2' });
    const response = await call('t');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chapter: 2, adventureId: 'a2' });
    expect(start.mock.calls[0][1]).toEqual({ campaignId: 'c1', userId: 'u1' });
  });

  it('passes through the flow error status', async () => {
    start.mockRejectedValue(new SequelError('not owner', 403));
    const response = await call('t');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not owner' });
  });
});

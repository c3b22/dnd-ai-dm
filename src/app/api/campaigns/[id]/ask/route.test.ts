import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, run, gen } = vi.hoisted(() => ({ getUser: vi.fn(), run: vi.fn(), gen: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/ai/geminiClient', () => ({ generateNarration: gen }));
vi.mock('@/lib/ai/vercelAiSdkAdapter', () => ({ realGeminiDeps: {} }));
vi.mock('@/lib/campaign/askDm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/askDm')>()),
  askDm: run,
}));

import { POST } from './route';
import { AskDmError } from '@/lib/campaign/askDm';

const call = (token?: string, body: unknown = { question: 'hi?' }) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/ask', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST campaign ask', () => {
  beforeEach(() => {
    getUser.mockReset();
    run.mockReset();
    gen.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect((await call('bad')).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns the answer for the signed-in user and feeds the mocked AI stream', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    gen.mockResolvedValue((async function* () { yield 'ตอบ'; yield 'แล้ว'; })());
    run.mockImplementation(async (_s, _p, deps) => ({ answer: await deps.answer('PROMPT') }));
    const res = await call('t', { question: 'ถาม?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: 'ตอบแล้ว' });
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', question: 'ถาม?' }, expect.anything());
    expect(gen).toHaveBeenCalledWith('PROMPT', expect.anything(), { purpose: 'ask', quality: 'fast' });
  });

  it('treats a malformed body as an empty question', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new AskDmError('question is empty', 400));
    const res = await call('t', 'not json');
    expect(run).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', question: undefined }, expect.anything());
    expect(res.status).toBe(400);
  });

  it.each([400, 403, 429, 502] as const)('maps AskDmError %i to its status', async (status) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    run.mockRejectedValue(new AskDmError('nope', status));
    const res = await call('t');
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'nope' });
  });
});

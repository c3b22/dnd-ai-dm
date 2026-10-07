import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  supabaseBrowserClient: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
  },
}));

import { askDmForClient, sendTeamChat, ChatRequestError } from './chatClient';

describe('chatClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts with the Bearer token and returns the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ answer: 'ตอบ' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askDmForClient('c1', 'ถาม')).toBe('ตอบ');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/campaigns/c1/ask');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ question: 'ถาม' });
  });

  it('throws ChatRequestError carrying the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ error: 'quota' }) }));
    await expect(sendTeamChat('c1', 'hi')).rejects.toMatchObject({ status: 429 });
    await expect(sendTeamChat('c1', 'hi')).rejects.toBeInstanceOf(ChatRequestError);
  });
});

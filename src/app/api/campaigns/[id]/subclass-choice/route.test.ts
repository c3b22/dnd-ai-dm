import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, choose } = vi.hoisted(() => ({ getUser: vi.fn(), choose: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/character/chooseSubclass', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/character/chooseSubclass')>()),
  chooseSubclass: choose,
}));

import { POST } from './route';
import { SubclassChoiceError } from '@/lib/character/chooseSubclass';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/subclass-choice', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST subclass-choice', () => {
  beforeEach(() => {
    getUser.mockReset();
    choose.mockReset();
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ subclassId: 'warrior_guardian' })).status).toBe(401);
    expect(choose).not.toHaveBeenCalled();
  });

  it('400 on a missing or non-JSON body', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await call({}, 't')).status).toBe(400);
    expect((await call('not json', 't')).status).toBe(400);
  });

  it('200 chooses for the authenticated user only', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    choose.mockResolvedValue({ subclassId: 'warrior_guardian' });
    const response = await call({ subclassId: 'warrior_guardian', userId: 'someone-else' }, 't');
    expect(response.status).toBe(200);
    expect(choose).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', subclassId: 'warrior_guardian' });
    expect(await response.json()).toEqual({ subclassId: 'warrior_guardian' });
  });

  it.each([
    [403, 'forbidden'],
    [400, 'invalid_subclass'],
    [409, 'already_chosen'],
    [409, 'level_too_low'],
  ] as const)('maps SubclassChoiceError %i %s', async (status, code) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    choose.mockRejectedValue(new SubclassChoiceError(code, status));
    const response = await call({ subclassId: 'warrior_guardian' }, 't');
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(code);
  });
});

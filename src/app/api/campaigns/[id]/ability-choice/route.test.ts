import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, spend } = vi.hoisted(() => ({ getUser: vi.fn(), spend: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/character/spendAbilityChoice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/character/spendAbilityChoice')>()),
  spendAbilityChoice: spend,
}));

import { POST } from './route';
import { AbilityChoiceError } from '@/lib/character/spendAbilityChoice';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/ability-choice', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

const choice = { kind: 'double', ability: 'STR' };

describe('POST ability-choice', () => {
  beforeEach(() => {
    getUser.mockReset();
    spend.mockReset();
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ choice })).status).toBe(401);
    expect(spend).not.toHaveBeenCalled();
  });

  it('400 on a missing or non-JSON body', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await call({}, 't')).status).toBe(400);
    expect((await call('not json', 't')).status).toBe(400);
  });

  it('200 spends for the authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    spend.mockResolvedValue({ abilities: { STR: 12 }, remaining: 0 });
    const response = await call({ choice }, 't');
    expect(response.status).toBe(200);
    expect(spend).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', choice });
    expect(await response.json()).toEqual({ abilities: { STR: 12 }, remaining: 0 });
  });

  it.each([
    [403, 'forbidden'],
    [400, 'invalid_choice'],
    [409, 'no_choice_available'],
  ] as const)('maps AbilityChoiceError %i', async (status, code) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    spend.mockRejectedValue(new AbilityChoiceError(code, status));
    const response = await call({ choice }, 't');
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(code);
  });
});

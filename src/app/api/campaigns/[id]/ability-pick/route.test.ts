import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, choose } = vi.hoisted(() => ({ getUser: vi.fn(), choose: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/character/chooseAbilityPick', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/character/chooseAbilityPick')>()),
  chooseAbilityPick: choose,
}));

import { POST } from './route';
import { AbilityPickError } from '@/lib/character/chooseAbilityPick';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/ability-pick', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST ability-pick', () => {
  beforeEach(() => {
    getUser.mockReset();
    choose.mockReset();
  });

  it('401 without a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ abilityId: 'warrior_war_cry' })).status).toBe(401);
    expect(choose).not.toHaveBeenCalled();
  });

  it('400 on a missing or non-JSON body', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    expect((await call({}, 't')).status).toBe(400);
    expect((await call('not json', 't')).status).toBe(400);
  });

  it('200 picks for the authenticated user only', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const picked = { abilityId: 'warrior_war_cry', level: 6, abilityPicks: { '6': 'warrior_war_cry' } };
    choose.mockResolvedValue(picked);
    const response = await call({ abilityId: 'warrior_war_cry', userId: 'someone-else' }, 't');
    expect(response.status).toBe(200);
    expect(choose).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', abilityId: 'warrior_war_cry' });
    expect(await response.json()).toEqual(picked);
  });

  it.each([
    [403, 'forbidden'],
    [400, 'invalid_ability'],
    [409, 'already_chosen'],
    [409, 'level_too_low'],
  ] as const)('maps AbilityPickError %i %s', async (status, code) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    choose.mockRejectedValue(new AbilityPickError(code, status));
    const response = await call({ abilityId: 'warrior_war_cry' }, 't');
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(code);
  });
});

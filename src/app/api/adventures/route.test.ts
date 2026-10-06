import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, createCustomAdventure, validateCustomAdventureInput } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createCustomAdventure: vi.fn(),
  validateCustomAdventureInput: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/customAdventures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/customAdventures')>()),
  createCustomAdventure,
  validateCustomAdventureInput,
}));

import { POST } from './route';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/adventures', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })
  );

describe('POST /api/adventures', () => {
  beforeEach(() => {
    getUser.mockReset();
    createCustomAdventure.mockReset();
    validateCustomAdventureInput.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ title: 'x' })).status).toBe(401);
  });

  it('rejects with the validation message when invalid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue('title is required');
    const response = await call({}, 't');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'title is required' });
    expect(createCustomAdventure).not.toHaveBeenCalled();
  });

  it('creates the adventure for the authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue(null);
    const body = { title: 'My Adventure' };
    createCustomAdventure.mockResolvedValue({ id: 'a1', title: 'My Adventure' });

    const response = await call(body, 't');

    expect(createCustomAdventure).toHaveBeenCalledWith(expect.anything(), 'u1', body);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'a1', title: 'My Adventure' });
  });
});

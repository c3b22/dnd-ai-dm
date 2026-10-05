import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, updateCustomAdventure, deleteCustomAdventure, validateCustomAdventureInput } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateCustomAdventure: vi.fn(),
  deleteCustomAdventure: vi.fn(),
  validateCustomAdventureInput: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/customAdventures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/customAdventures')>()),
  updateCustomAdventure,
  deleteCustomAdventure,
  validateCustomAdventureInput,
}));

import { PATCH, DELETE } from './route';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';

const patchCall = (body: unknown, token?: string, id = 'a1') =>
  PATCH(
    new NextRequest(`http://localhost/api/adventures/${id}`, {
      method: 'PATCH',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

const deleteCall = (token?: string, id = 'a1') =>
  DELETE(
    new NextRequest(`http://localhost/api/adventures/${id}`, {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) }
  );

describe('PATCH /api/adventures/[id]', () => {
  beforeEach(() => {
    getUser.mockReset();
    updateCustomAdventure.mockReset();
    deleteCustomAdventure.mockReset();
    validateCustomAdventureInput.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await patchCall({ title: 'x' })).status).toBe(401);
  });

  it('rejects with the validation message when invalid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue('title is required');
    const response = await patchCall({}, 't');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'title is required' });
    expect(updateCustomAdventure).not.toHaveBeenCalled();
  });

  it('maps a 404 CustomAdventureError', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue(null);
    updateCustomAdventure.mockRejectedValue(new CustomAdventureError('adventure not found', 404));
    const response = await patchCall({ title: 'x' }, 't');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'adventure not found' });
  });

  it('maps a 403 CustomAdventureError', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue(null);
    updateCustomAdventure.mockRejectedValue(new CustomAdventureError('not the owner', 403));
    const response = await patchCall({ title: 'x' }, 't');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not the owner' });
  });

  it('updates and returns the adventure', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    validateCustomAdventureInput.mockReturnValue(null);
    const body = { title: 'Updated' };
    updateCustomAdventure.mockResolvedValue({ id: 'a1', title: 'Updated' });

    const response = await patchCall(body, 't', 'a1');

    expect(updateCustomAdventure).toHaveBeenCalledWith(expect.anything(), 'a1', 'u1', body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'a1', title: 'Updated' });
  });
});

describe('DELETE /api/adventures/[id]', () => {
  beforeEach(() => {
    getUser.mockReset();
    updateCustomAdventure.mockReset();
    deleteCustomAdventure.mockReset();
    validateCustomAdventureInput.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await deleteCall()).status).toBe(401);
  });

  it('maps a CustomAdventureError status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    deleteCustomAdventure.mockRejectedValue(new CustomAdventureError('not the owner', 403));
    const response = await deleteCall('t', 'a1');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not the owner' });
  });

  it('deletes and returns 204', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    deleteCustomAdventure.mockResolvedValue(undefined);

    const response = await deleteCall('t', 'a1');

    expect(deleteCustomAdventure).toHaveBeenCalledWith(expect.anything(), 'a1', 'u1');
    expect(response.status).toBe(204);
  });
});

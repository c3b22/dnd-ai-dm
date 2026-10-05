// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, uploadSceneImage } = vi.hoisted(() => ({
  getUser: vi.fn(),
  uploadSceneImage: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/adventures/sceneImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adventures/sceneImage')>()),
  uploadSceneImage,
}));

import { POST } from './route';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';

const call = (formData: FormData | undefined, token?: string, id = 'a1', key = 'opening') =>
  POST(
    new NextRequest(`http://localhost/api/adventures/${id}/scenes/${key}/image`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: formData,
    }),
    { params: Promise.resolve({ id, key }) }
  );

describe('POST /api/adventures/[id]/scenes/[key]/image', () => {
  beforeEach(() => {
    getUser.mockReset();
    uploadSceneImage.mockReset();
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const formData = new FormData();
    formData.set('file', new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
    expect((await call(formData)).status).toBe(401);
  });

  it('rejects when there is no file field', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const formData = new FormData();
    const response = await call(formData, 't');
    expect(response.status).toBe(400);
    expect(uploadSceneImage).not.toHaveBeenCalled();
  });

  it('maps a CustomAdventureError status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    uploadSceneImage.mockRejectedValue(new CustomAdventureError('adventure not found', 404));
    const formData = new FormData();
    formData.set('file', new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
    const response = await call(formData, 't');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'adventure not found' });
  });

  it('uploads the file and returns the imageUrl', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    uploadSceneImage.mockResolvedValue('https://example.com/image.jpg');
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.set('file', file);

    const response = await call(formData, 't', 'a1', 'opening');

    expect(uploadSceneImage).toHaveBeenCalledWith(expect.anything(), {
      adventureId: 'a1',
      key: 'opening',
      ownerId: 'u1',
      file: expect.objectContaining({ name: 'x.jpg', type: 'image/jpeg', size: file.size }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imageUrl: 'https://example.com/image.jpg' });
  });
});

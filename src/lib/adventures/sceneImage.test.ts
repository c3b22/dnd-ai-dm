import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { resizeSceneImage, uploadSceneImage } from './sceneImage';
import { CustomAdventureError } from './customAdventures';

async function pngBuffer(width = 2000, height = 1000) {
  return sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer();
}

describe('resizeSceneImage', () => {
  it('resizes to 1600px wide and re-encodes as jpeg', async () => {
    const out = await resizeSceneImage(await pngBuffer());
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.format).toBe('jpeg');
  });

  it('rejects data that is not a real image', async () => {
    await expect(resizeSceneImage(Buffer.from('not an image'))).rejects.toThrow();
  });
});

function fakeSupabase(row: Record<string, unknown> | null, rpcError: unknown = null) {
  const uploads: unknown[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });
  const update = vi.fn();
  const client: any = {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }), update }),
    storage: {
      from: () => ({
        upload: (path: string, body: unknown, opts: unknown) => { uploads.push({ path, opts }); return Promise.resolve({ error: null }); },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  };
  return { client, uploads, rpc, update };
}

function fakeFile(bytes: Uint8Array, type: string) {
  return { type, size: bytes.byteLength, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as File;
}

describe('uploadSceneImage', () => {
  it('rejects a non-image mime type', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: fakeFile(new Uint8Array([1]), 'text/plain') })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a file over 5MB', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const big = fakeFile(new Uint8Array(1), 'image/jpeg');
    (big as any).size = 6 * 1024 * 1024;
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: big })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-owner', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-2', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: fakeFile(new Uint8Array([1]), 'image/jpeg') })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an unknown scene key', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'act-9', ownerId: 'owner-1', file: pngFile })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('resizes, uploads with upsert, and returns a cache-busted public url', async () => {
    const { client, uploads } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    const url = await uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile });
    expect(url).toMatch(/^https:\/\/cdn\.test\/a1\/opening\.jpg\?v=\d+$/);
    expect(uploads[0]).toMatchObject({ path: 'a1/opening.jpg', opts: { contentType: 'image/jpeg', upsert: true } });
  });

  it('gives a replaced image a different url than the previous upload', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    try {
      const first = await uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile });
      const second = await uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile });
      expect(first).toBe('https://cdn.test/a1/opening.jpg?v=1000');
      expect(second).toBe('https://cdn.test/a1/opening.jpg?v=2000');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('records the image with the atomic scene-image rpc, not a whole-array update', async () => {
    const { client, rpc, update } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    const url = await uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('update_custom_adventure_scene_image', {
      p_adventure_id: 'a1',
      p_key: 'opening',
      p_image_path: url,
    });
    expect(rpc.mock.calls[0][1].p_image_path.startsWith('https://cdn.test/a1/opening.jpg?v=')).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws when the rpc write fails instead of returning the url', async () => {
    const dbError = { message: 'db down', code: '500' };
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] }, dbError);
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile })
    ).rejects.toBe(dbError);
  });

  it('maps an invalid image buffer to a 400, not a crash', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const badFile = { type: 'image/jpeg', size: 10, arrayBuffer: async () => new TextEncoder().encode('not an image').buffer } as unknown as File;
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: badFile })
    ).rejects.toMatchObject({ status: 400 });
  });
});

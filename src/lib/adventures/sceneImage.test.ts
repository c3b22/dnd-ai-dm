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

function fakeSupabase(row: Record<string, unknown> | null) {
  const uploads: unknown[] = [];
  const client: any = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    storage: {
      from: () => ({
        upload: (path: string, body: unknown, opts: unknown) => { uploads.push({ path, opts }); return Promise.resolve({ error: null }); },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  };
  return { client, uploads };
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

  it('resizes, uploads with upsert, and returns the public url', async () => {
    const { client, uploads } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const pngFile = { type: 'image/png', size: 100, arrayBuffer: async () => (await pngBuffer()).buffer } as unknown as File;
    const url = await uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: pngFile });
    expect(url).toBe('https://cdn.test/a1/opening.jpg');
    expect(uploads[0]).toMatchObject({ path: 'a1/opening.jpg', opts: { contentType: 'image/jpeg', upsert: true } });
  });

  it('maps an invalid image buffer to a 400, not a crash', async () => {
    const { client } = fakeSupabase({ owner_id: 'owner-1', scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] });
    const badFile = { type: 'image/jpeg', size: 10, arrayBuffer: async () => new TextEncoder().encode('not an image').buffer } as unknown as File;
    await expect(
      uploadSceneImage(client, { adventureId: 'a1', key: 'opening', ownerId: 'owner-1', file: badFile })
    ).rejects.toMatchObject({ status: 400 });
  });
});

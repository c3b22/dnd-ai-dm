import { describe, it, expect } from 'vitest';
import { getSharedAdventurePreview, importSharedAdventure } from './sharedAdventures';
import { CustomAdventureError } from './customAdventures';

const BASE = 'https://proj.supabase.co/storage/v1/object/public/adventure-scenes';

const sourceRow = {
  id: 'src-1', owner_id: 'owner-1', share_code: 'ABCD2345',
  title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH', tone: 'Tone', tone_th: 'ToneTH',
  setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH', secret: 'TOP SECRET',
  acts: ['a1', 'a2'], npcs: [{ name: 'N', role: 'R' }],
  scenes: [
    { key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: `${BASE}/src-1/opening.jpg?v=1` },
    { key: 'act-1', nameTh: 'ภาพองก์ที่ 1', imagePath: `${BASE}/src-1/act-1.jpg?v=2` },
    { key: 'act-2', nameTh: 'ภาพองก์ที่ 2', imagePath: null },
  ],
};

function fake(row: Record<string, unknown> | null, opts: { failCopyFor?: string } = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  const copies: [string, string][] = [];
  const client: any = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      insert: (payload: any) => {
        inserts.push(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: { ...payload, id: 'new-1' }, error: null }) }) };
      },
      update: (payload: any) => {
        updates.push(payload);
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { ...inserts[0], ...payload, id: 'new-1' }, error: null }),
            }),
          }),
        };
      },
    }),
    storage: {
      from: () => ({
        copy: (from: string, to: string) => {
          copies.push([from, to]);
          return Promise.resolve({ error: opts.failCopyFor === from ? new Error('nope') : null });
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}/${p}` } }),
      }),
    },
  };
  return { client, inserts, updates, copies };
}

describe('getSharedAdventurePreview', () => {
  it('returns safe fields only, never the secret', async () => {
    const { client } = fake(sourceRow);
    const p = await getSharedAdventurePreview(client, 'ABCD2345');
    expect(p).toEqual({
      title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH',
      setting: 'Setting', hook: 'Hook', openingTh: 'OpeningTH',
      actCount: 2, npcCount: 1, hasOpeningImage: true,
    });
    expect(JSON.stringify(p)).not.toContain('TOP SECRET');
    expect('secret' in p).toBe(false);
  });

  it('reports no opening image when imagePath is null', async () => {
    const row = { ...sourceRow, scenes: [{ key: 'opening', nameTh: 'x', imagePath: null }] };
    const p = await getSharedAdventurePreview(fake(row).client, 'ABCD2345');
    expect(p.hasOpeningImage).toBe(false);
  });

  it('throws 404 for an unknown code', async () => {
    await expect(getSharedAdventurePreview(fake(null).client, 'NOPE')).rejects.toMatchObject({ status: 404 });
  });
});

describe('importSharedAdventure', () => {
  it('copies all fields including secret to a new row owned by the importer, without share_code', async () => {
    const { client, inserts } = fake(sourceRow);
    await importSharedAdventure(client, 'ABCD2345', 'user-2');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      owner_id: 'user-2', title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH',
      tone: 'Tone', tone_th: 'ToneTH', setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH',
      secret: 'TOP SECRET', acts: ['a1', 'a2'], npcs: [{ name: 'N', role: 'R' }],
    });
    expect('share_code' in inserts[0]).toBe(false);
    expect(inserts[0].scenes.every((s: any) => s.imagePath === null)).toBe(true);
  });

  it('copies scene images to <newId>/<key>.jpg and rewrites imagePath', async () => {
    const { client, copies, updates } = fake(sourceRow);
    const result = await importSharedAdventure(client, 'ABCD2345', 'user-2');
    expect(copies).toEqual([
      ['src-1/opening.jpg', 'new-1/opening.jpg'],
      ['src-1/act-1.jpg', 'new-1/act-1.jpg'],
    ]);
    const scenes = updates[0].scenes;
    expect(scenes[0].imagePath).toMatch(new RegExp(`^${BASE}/new-1/opening\\.jpg\\?v=\\d+$`));
    expect(scenes[1].imagePath).toMatch(/new-1\/act-1\.jpg\?v=\d+$/);
    expect(scenes[2].imagePath).toBeNull();
    expect(result.id).toBe('new-1');
  });

  it('sets imagePath to null when a copy fails, but still succeeds', async () => {
    const { client, updates } = fake(sourceRow, { failCopyFor: 'src-1/act-1.jpg' });
    await importSharedAdventure(client, 'ABCD2345', 'user-2');
    expect(updates[0].scenes[0].imagePath).not.toBeNull();
    expect(updates[0].scenes[1].imagePath).toBeNull();
  });

  it('rejects the original owner with 400 and creates nothing', async () => {
    const { client, inserts } = fake(sourceRow);
    await expect(importSharedAdventure(client, 'ABCD2345', 'owner-1')).rejects.toMatchObject({ status: 400 });
    expect(inserts).toHaveLength(0);
  });

  it('throws CustomAdventureError 404 for an unknown code', async () => {
    const err = await importSharedAdventure(fake(null).client, 'NOPE', 'user-2').catch((e) => e);
    expect(err).toBeInstanceOf(CustomAdventureError);
    expect(err.status).toBe(404);
  });
});

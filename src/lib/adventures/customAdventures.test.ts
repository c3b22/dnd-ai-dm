import { describe, it, expect, vi } from 'vitest';
import {
  deriveScenes, validateCustomAdventureInput, CustomAdventureError,
  createCustomAdventure, updateCustomAdventure, deleteCustomAdventure, listMyCustomAdventures,
} from './customAdventures';

describe('deriveScenes', () => {
  it('builds opening + one scene per act with Thai labels', () => {
    expect(deriveScenes(['a1', 'a2'])).toEqual([
      { key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null },
      { key: 'act-1', nameTh: 'ภาพองก์ที่ 1', imagePath: null },
      { key: 'act-2', nameTh: 'ภาพองก์ที่ 2', imagePath: null },
    ]);
  });

  it('keeps imagePath for keys that still exist and drops removed ones', () => {
    const existing = [
      { key: 'opening', nameTh: 'x', imagePath: 'https://x/opening.jpg' },
      { key: 'act-1', nameTh: 'x', imagePath: 'https://x/act-1.jpg' },
      { key: 'act-2', nameTh: 'x', imagePath: 'https://x/act-2.jpg' },
    ];
    expect(deriveScenes(['a1'], existing)).toEqual([
      { key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: 'https://x/opening.jpg' },
      { key: 'act-1', nameTh: 'ภาพองก์ที่ 1', imagePath: 'https://x/act-1.jpg' },
    ]);
  });
});

const validInput = {
  title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH',
  setting: 'Setting', hook: 'Hook', openingTh: 'OpeningTH', secret: 'Secret',
  acts: ['Act 1'], npcs: [],
};

describe('validateCustomAdventureInput', () => {
  it('accepts a fully filled, minimal input', () => {
    expect(validateCustomAdventureInput(validInput)).toBeNull();
  });

  it('rejects a missing or blank required field', () => {
    expect(validateCustomAdventureInput({ ...validInput, title: '  ' })).not.toBeNull();
    expect(validateCustomAdventureInput({ ...validInput, hook: undefined as any })).not.toBeNull();
  });

  it('rejects an empty acts array or a whitespace-only act', () => {
    expect(validateCustomAdventureInput({ ...validInput, acts: [] })).not.toBeNull();
    expect(validateCustomAdventureInput({ ...validInput, acts: ['  '] })).not.toBeNull();
  });

  it('rejects an npc with only one of name/role filled', () => {
    expect(validateCustomAdventureInput({ ...validInput, npcs: [{ name: 'N', role: '' }] })).not.toBeNull();
  });

  it('accepts npcs being empty', () => {
    expect(validateCustomAdventureInput({ ...validInput, npcs: [] })).toBeNull();
  });
});

function fakeSupabase(row: Record<string, unknown> | null) {
  const updateCalls: unknown[] = [];
  const client: any = {
    from: () => ({
      insert: (payload: Record<string, unknown>) => ({ select: () => ({ single: () => Promise.resolve({ data: { ...payload, id: 'custom-1' }, error: null }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (payload: Record<string, unknown>) => { updateCalls.push(payload); return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...row, ...payload }, error: null }) }) }) }; },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }), remove: () => Promise.resolve({ error: null }) }) },
  };
  return { client, updateCalls };
}

describe('createCustomAdventure', () => {
  it('inserts with the derived scenes and the caller as owner', async () => {
    const { client } = fakeSupabase(null);
    const result = await createCustomAdventure(client, 'owner-1', validInput);
    expect(result.id).toBe('custom-1');
    expect(result.scenes).toEqual(deriveScenes(validInput.acts));
  });
});

describe('updateCustomAdventure', () => {
  it('throws 404 when the adventure does not exist', async () => {
    const { client } = fakeSupabase(null);
    await expect(updateCustomAdventure(client, 'custom-1', 'owner-1', validInput)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when the caller is not the owner', async () => {
    const { client } = fakeSupabase({ id: 'custom-1', owner_id: 'owner-2', scenes: [] });
    await expect(updateCustomAdventure(client, 'custom-1', 'owner-1', validInput)).rejects.toBeInstanceOf(CustomAdventureError);
  });
});

describe('deleteCustomAdventure', () => {
  it('throws 403 when the caller is not the owner', async () => {
    const { client } = fakeSupabase({ id: 'custom-1', owner_id: 'owner-2' });
    await expect(deleteCustomAdventure(client, 'custom-1', 'owner-1')).rejects.toMatchObject({ status: 403 });
  });

  it('removes every storage object under the adventure folder before deleting the row', async () => {
    const removeCalls: unknown[] = [];
    const deleteCalls: unknown[] = [];
    const client: any = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'custom-1', owner_id: 'owner-1' }, error: null }) }) }),
        delete: () => ({ eq: (...args: unknown[]) => { deleteCalls.push(args); return Promise.resolve({ error: null }); } }),
      }),
      storage: {
        from: () => ({
          list: () => Promise.resolve({ data: [{ name: 'opening.jpg' }, { name: 'act-1.jpg' }], error: null }),
          remove: (paths: string[]) => { removeCalls.push(paths); return Promise.resolve({ error: null }); },
        }),
      },
    };

    await deleteCustomAdventure(client, 'custom-1', 'owner-1');

    expect(removeCalls).toEqual([['custom-1/opening.jpg', 'custom-1/act-1.jpg']]);
    expect(deleteCalls).toHaveLength(1);
  });
});

describe('listMyCustomAdventures', () => {
  it('returns an empty list when the caller owns nothing', async () => {
    const client: any = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
    expect(await listMyCustomAdventures(client, 'owner-1')).toEqual([]);
  });
});

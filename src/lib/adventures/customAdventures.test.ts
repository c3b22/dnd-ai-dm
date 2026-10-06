import { describe, it, expect, vi } from 'vitest';
import {
  deriveScenes, validateCustomAdventureInput, CustomAdventureError,
  createCustomAdventure, updateCustomAdventure, deleteCustomAdventure, listMyCustomAdventures,
  enableSharing, disableSharing,
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

function sharingSupabase(row: Record<string, unknown> | null, updateResults: ({ code?: string } | null)[] = []) {
  const updates: Record<string, unknown>[] = [];
  let call = 0;
  const client: any = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        const failure = updateResults[call++] ?? null;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve(
                failure
                  ? { data: null, error: { code: failure.code } }
                  : { data: { share_code: payload.share_code }, error: null }
              ),
            }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }),
        };
      },
    }),
  };
  return { client, updates };
}

describe('enableSharing', () => {
  it('throws 404 when the adventure does not exist', async () => {
    const { client } = sharingSupabase(null);
    await expect(enableSharing(client, 'c1', 'owner-1')).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when the caller is not the owner', async () => {
    const { client, updates } = sharingSupabase({ owner_id: 'owner-2', share_code: null });
    await expect(enableSharing(client, 'c1', 'owner-1')).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);
  });

  it('returns the existing code without writing (idempotent)', async () => {
    const { client, updates } = sharingSupabase({ owner_id: 'owner-1', share_code: 'ABCD2345' });
    expect(await enableSharing(client, 'c1', 'owner-1')).toBe('ABCD2345');
    expect(updates).toHaveLength(0);
  });

  it('generates an 8-char unambiguous code when none exists', async () => {
    const { client, updates } = sharingSupabase({ owner_id: 'owner-1', share_code: null });
    const code = await enableSharing(client, 'c1', 'owner-1');
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(updates).toEqual([{ share_code: code }]);
  });

  it('retries with a new code when it collides with another adventure', async () => {
    const { client, updates } = sharingSupabase(
      { owner_id: 'owner-1', share_code: null },
      [{ code: '23505' }, { code: '23505' }]
    );
    const code = await enableSharing(client, 'c1', 'owner-1');
    expect(updates).toHaveLength(3);
    expect(updates[2]).toEqual({ share_code: code });
  });

  it('gives up with an error after repeated collisions', async () => {
    const collisions = Array.from({ length: 20 }, () => ({ code: '23505' }));
    const { client } = sharingSupabase({ owner_id: 'owner-1', share_code: null }, collisions);
    await expect(enableSharing(client, 'c1', 'owner-1')).rejects.toBeTruthy();
  });

  it('rethrows non-collision errors immediately', async () => {
    const { client, updates } = sharingSupabase({ owner_id: 'owner-1', share_code: null }, [{ code: '42703' }]);
    await expect(enableSharing(client, 'c1', 'owner-1')).rejects.toMatchObject({ code: '42703' });
    expect(updates).toHaveLength(1);
  });
});

describe('disableSharing', () => {
  it('throws 404/403 for missing or foreign adventures', async () => {
    await expect(disableSharing(sharingSupabase(null).client, 'c1', 'owner-1')).rejects.toMatchObject({ status: 404 });
    await expect(
      disableSharing(sharingSupabase({ owner_id: 'owner-2', share_code: 'X' }).client, 'c1', 'owner-1')
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sets share_code to null for the owner', async () => {
    const { client, updates } = sharingSupabase({ owner_id: 'owner-1', share_code: 'ABCD2345' });
    await disableSharing(client, 'c1', 'owner-1');
    expect(updates).toEqual([{ share_code: null }]);
  });
});

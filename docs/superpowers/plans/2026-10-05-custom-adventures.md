# Custom Adventures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player write their own adventure (same shape as the 9 built-in ones), attach an image to each scene, and pick it when starting a campaign exactly like a built-in one.

**Architecture:** A new `custom_adventures` table (one `jsonb` column each for acts/npcs/scenes) plus a public `adventure-scenes` Storage bucket hold user content. Every place that today does a synchronous, built-in-only lookup (`getAdventure`, `allowedScenes`, `sceneInstruction`, `openingSceneId`, `getScene`) gets an async sibling that checks the built-in array first (zero DB calls, byte-identical behavior) and only queries Supabase when the id isn't one of the 9 built-ins. `assemblePrompt` stops doing its own lookup and instead takes an already-resolved `Adventure | null` plus the scene-instruction string, so it stays a pure, synchronously-testable function regardless of where the adventure came from.

**Tech Stack:** Next.js App Router routes, Supabase (Postgres + Storage), `sharp` for image resizing, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-custom-adventures-design.md`

## Global Constraints

- Migration file: `supabase/migrations/0014_custom_adventures.sql` (0013 is taken by the leveling PR).
- Storage bucket name: `adventure-scenes`, public, objects at `<adventure_id>/<scene_key>.jpg`.
- Scene keys: `opening`, `act-1`, …, `act-N` — derived from `acts.length`, never user-chosen.
- A scene's public id (used everywhere a "scene id" flows — `current_scene_id`, the `[[scene: ID]]` tag, `SceneBanner`'s `sceneId` prop) is `${adventureId}-${key}` for custom adventures, globally unique because `adventureId` is a UUID. Built-in scene ids are unchanged.
- Upload limits: `image/*` mime only, 5 MB max, resized server-side to 1600px wide / JPEG quality 82 (same convention as `scripts/import-scene.mjs`).
- Every built-in-adventure code path must stay byte-identical and DB-call-free — this plan's async additions are new siblings, not rewrites, of the existing sync functions.
- Routes that mutate a user's own data are Bearer-authenticated via `supabase.auth.getUser(token)`, the same pattern as `src/app/api/campaigns/[id]/shop/route.ts`.

## Review Focus

- A non-owner (another player in the same campaign, or a stranger with the id) reading a custom adventure or its scenes must still succeed — only writes are owner-gated. (Task 2, Task 3)
- Uploading an image to a scene key that no longer exists (acts were edited down since creation) must be rejected with a clear error, not silently stored as an orphaned entry. (Task 4)
- A file with a spoofed `image/*` mime type that isn't actually a valid image must fail cleanly (400), not crash the route when `sharp` can't read it. (Task 5)
- Acts/NPCs/title fields that are empty or whitespace-only must be rejected by the server even if client-side validation is bypassed. (Task 3)
- Deleting a custom adventure that a campaign still references must not crash anything that later loads that campaign — `adventure: null` is already a handled case everywhere (prompt assembly, the campaign page, `startCampaign`). (Task 8, Task 9)

---

## Task 1: Migration — `custom_adventures` table and `adventure-scenes` bucket

**Files:**
- Create: `supabase/migrations/0014_custom_adventures.sql`

**Interfaces:**
- Produces: the `custom_adventures` table and `adventure-scenes` Storage bucket every later task reads/writes.

No automated test for this task — like the rest of `supabase/migrations/`, it's exercised indirectly by the lib tests in later tasks, which mock the Supabase client rather than hit a real database.

- [ ] **Step 1: Write the migration**

```sql
create table custom_adventures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  title_th text not null,
  tagline text not null,
  tagline_th text not null,
  tone text not null,
  tone_th text not null,
  setting text not null,
  hook text not null,
  opening_th text not null,
  secret text not null,
  acts jsonb not null,
  npcs jsonb not null default '[]',
  scenes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table custom_adventures enable row level security;

create policy "custom adventures are publicly readable"
  on custom_adventures for select
  using (true);

create policy "owners manage their own custom adventures"
  on custom_adventures for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('adventure-scenes', 'adventure-scenes', true)
on conflict (id) do nothing;

create policy "adventure scene images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'adventure-scenes');

create policy "owners manage their adventure scene images"
  on storage.objects for all
  using (
    bucket_id = 'adventure-scenes'
    and exists (
      select 1 from custom_adventures a
      where a.id::text = (storage.foldername(name))[1]
        and a.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'adventure-scenes'
    and exists (
      select 1 from custom_adventures a
      where a.id::text = (storage.foldername(name))[1]
        and a.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0014_custom_adventures.sql
git commit -m "feat(adventures): add custom_adventures table and adventure-scenes bucket"
```

---

## Task 2: `getAdventureById` — the built-in-first adventure lookup

**Files:**
- Modify: `src/lib/adventures/adventures.ts`
- Test: `src/lib/adventures/adventures.test.ts` (new file)

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js` (generic — works with both the service-role and browser clients); the existing `ADVENTURES`, `getAdventure` in the same file.
- Produces: `getAdventureById(supabase: SupabaseClient, id: string | null | undefined): Promise<Adventure | null>` and `mapCustomAdventureRow(row: Record<string, any>): Adventure`, both exported — later tasks (routes, `customAdventures.ts`) reuse `mapCustomAdventureRow` to shape API responses.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { getAdventureById } from './adventures';

function fakeSupabase(row: Record<string, unknown> | null) {
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  }));
  return { from } as any;
}

describe('getAdventureById', () => {
  it('returns a built-in adventure without touching the database', async () => {
    const supabase = fakeSupabase(null);
    const adventure = await getAdventureById(supabase, 'sunken-bell-of-marrowmere');
    expect(adventure?.title).toBe('The Sunken Bell of Marrowmere');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('maps a custom_adventures row into the Adventure shape', async () => {
    const supabase = fakeSupabase({
      id: 'custom-1', title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH',
      tone: 'Tone', tone_th: 'ToneTH', setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [{ name: 'N', role: 'R' }],
    });
    const adventure = await getAdventureById(supabase, 'custom-1');
    expect(adventure).toEqual({
      id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH',
      tone: 'Tone', toneTh: 'ToneTH', setting: 'Setting', hook: 'Hook', openingTh: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [{ name: 'N', role: 'R' }],
    });
  });

  it('returns null for an id that matches neither a built-in nor a row', async () => {
    const supabase = fakeSupabase(null);
    expect(await getAdventureById(supabase, 'nope')).toBeNull();
  });

  it('returns null for a null or undefined id', async () => {
    const supabase = fakeSupabase(null);
    expect(await getAdventureById(supabase, null)).toBeNull();
  });

  it('reads a custom row regardless of who is asking (no owner filter on reads)', async () => {
    const supabase = fakeSupabase({
      id: 'custom-1', title: 'T', title_th: 'TH', tagline: 'Tag', tagline_th: 'TagTH',
      tone: 'Tone', tone_th: 'ToneTH', setting: 'Setting', hook: 'Hook', opening_th: 'OpeningTH',
      secret: 'Secret', acts: ['Act 1'], npcs: [], owner_id: 'someone-else',
    });
    const adventure = await getAdventureById(supabase, 'custom-1');
    expect(adventure?.id).toBe('custom-1');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/lib/adventures/adventures.test.ts`
Expected: FAIL — `getAdventureById` is not exported.

- [ ] **Step 3: Implement in `src/lib/adventures/adventures.ts`**

Append below `getAdventure`:

```ts
export function mapCustomAdventureRow(row: any): Adventure {
  return {
    id: row.id,
    title: row.title,
    titleTh: row.title_th,
    tagline: row.tagline,
    taglineTh: row.tagline_th,
    tone: row.tone,
    toneTh: row.tone_th,
    setting: row.setting,
    hook: row.hook,
    openingTh: row.opening_th,
    secret: row.secret,
    acts: row.acts,
    npcs: row.npcs,
  };
}

export async function getAdventureById(
  supabase: SupabaseClient,
  id: string | null | undefined
): Promise<Adventure | null> {
  const builtin = getAdventure(id);
  if (builtin) return builtin;
  if (!id) return null;
  const { data } = await supabase.from('custom_adventures').select('*').eq('id', id).maybeSingle();
  return data ? mapCustomAdventureRow(data) : null;
}
```

Add `import type { SupabaseClient } from '@supabase/supabase-js';` at the top of the file.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/adventures/adventures.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/adventures/adventures.ts src/lib/adventures/adventures.test.ts
git commit -m "feat(adventures): add getAdventureById with a built-in-first fast path"
```

---

## Task 3: `customAdventures.ts` — validation and CRUD for the text fields

**Files:**
- Create: `src/lib/adventures/customAdventures.ts`
- Test: `src/lib/adventures/customAdventures.test.ts`

**Interfaces:**
- Consumes: `mapCustomAdventureRow` from Task 2.
- Produces (all exported from `src/lib/adventures/customAdventures.ts`):
  - `export class CustomAdventureError extends Error { constructor(message: string, readonly status: 400 | 403 | 404) }`
  - `export interface CustomScene { key: string; nameTh: string; imagePath: string | null }`
  - `export interface CustomAdventureInput { title: string; titleTh: string; tagline: string; taglineTh: string; tone: string; toneTh: string; setting: string; hook: string; openingTh: string; secret: string; acts: string[]; npcs: { name: string; role: string }[] }`
  - `export function deriveScenes(acts: string[], existing?: CustomScene[]): CustomScene[]`
  - `export function validateCustomAdventureInput(input: Partial<CustomAdventureInput>): string | null` — returns an error message, or `null` if valid.
  - `export async function createCustomAdventure(supabase, ownerId: string, input: CustomAdventureInput): Promise<Adventure & { scenes: CustomScene[] }>`
  - `export async function updateCustomAdventure(supabase, id: string, ownerId: string, input: CustomAdventureInput): Promise<Adventure & { scenes: CustomScene[] }>` — throws `CustomAdventureError` (404 not found, 403 not owner).
  - `export async function deleteCustomAdventure(supabase, id: string, ownerId: string): Promise<void>` — same error cases.
  - `export async function listMyCustomAdventures(supabase, ownerId: string): Promise<{ id: string; titleTh: string; taglineTh: string; thumbnailUrl: string | null }[]>`

Task 6's routes are this module's only other consumers.

- [ ] **Step 1: Write the failing tests**

```ts
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
      insert: (payload: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { ...payload, id: 'custom-1' }, error: null }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (payload: unknown) => { updateCalls.push(payload); return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...row, ...payload }, error: null }) }) }) }; },
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
});

describe('listMyCustomAdventures', () => {
  it('returns an empty list when the caller owns nothing', async () => {
    const client: any = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
    expect(await listMyCustomAdventures(client, 'owner-1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/lib/adventures/customAdventures.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement `src/lib/adventures/customAdventures.ts`**

`deriveScenes`:

```ts
export function deriveScenes(acts: string[], existing: CustomScene[] = []): CustomScene[] {
  const imageByKey = new Map(existing.map((s) => [s.key, s.imagePath]));
  const keys = ['opening', ...acts.map((_, i) => `act-${i + 1}`)];
  return keys.map((key, i) => ({
    key,
    nameTh: i === 0 ? 'ภาพเปิดเรื่อง' : `ภาพองก์ที่ ${i}`,
    imagePath: imageByKey.get(key) ?? null,
  }));
}
```

`validateCustomAdventureInput`: check each required string field is present and non-blank after `.trim()` (`title`, `titleTh`, `tagline`, `taglineTh`, `tone`, `toneTh`, `setting`, `hook`, `openingTh`, `secret`); `acts` must be an array with at least one non-blank entry; each `npcs` entry must have both `name` and `role` non-blank, or both blank (drop silently is a client concern — here, reject a half-filled row). Return a short message naming the problem field, or `null`.

`createCustomAdventure`: insert a row with the 10 scalar fields snake_cased, `acts: input.acts`, `npcs: input.npcs`, `scenes: deriveScenes(input.acts)`, `owner_id: ownerId`; `select().single()`; return `{ ...mapCustomAdventureRow(row), scenes: row.scenes }`.

`updateCustomAdventure`: `select('owner_id, scenes').eq('id', id).maybeSingle()` first — throw `CustomAdventureError('adventure not found', 404)` if no row, `CustomAdventureError('not the owner', 403)` if `row.owner_id !== ownerId`. Then `update({ ...scalars, acts, npcs, scenes: deriveScenes(input.acts, row.scenes) }).eq('id', id).select().single()`.

`deleteCustomAdventure`: same existence/ownership check, then list and remove every object under `adventure-scenes/<id>/` via `supabase.storage.from('adventure-scenes').list(id)` → `remove(entries.map(e => \`${id}/${e.name}\`))`, then `delete().eq('id', id)` on the row.

`listMyCustomAdventures`: `select('id, title_th, tagline_th, scenes').eq('owner_id', ownerId)`, map each row to `{ id, titleTh: row.title_th, taglineTh: row.tagline_th, thumbnailUrl: row.scenes?.[0]?.imagePath ?? null }`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/adventures/customAdventures.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/adventures/customAdventures.ts src/lib/adventures/customAdventures.test.ts
git commit -m "feat(adventures): validation and CRUD for custom adventures"
```

---

## Task 4: `sceneImage.ts` — resize and upload a scene image

**Files:**
- Create: `src/lib/adventures/sceneImage.ts`
- Test: `src/lib/adventures/sceneImage.test.ts`
- Modify: `package.json` (move `sharp` from ad-hoc script use to a real dependency)

**Interfaces:**
- Consumes: `CustomAdventureError` from Task 3.
- Produces: `export async function resizeSceneImage(buffer: Buffer): Promise<Buffer>`; `export async function uploadSceneImage(supabase, params: { adventureId: string; key: string; ownerId: string; file: File }): Promise<string>` (returns the public URL) — Task 6's upload route is the only consumer.

- [ ] **Step 1: Add `sharp` as a dependency**

```bash
npm install sharp
```

- [ ] **Step 2: Write the failing tests**

```ts
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
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run src/lib/adventures/sceneImage.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 4: Implement `src/lib/adventures/sceneImage.ts`**

```ts
import sharp from 'sharp';
import { CustomAdventureError } from './customAdventures';

export async function resizeSceneImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadSceneImage(
  supabase: any,
  params: { adventureId: string; key: string; ownerId: string; file: File }
): Promise<string> {
  const { adventureId, key, ownerId, file } = params;
  if (!file.type.startsWith('image/')) throw new CustomAdventureError('file must be an image', 400);
  if (file.size > MAX_BYTES) throw new CustomAdventureError('file is too large (max 5MB)', 400);

  const { data: row } = await supabase.from('custom_adventures').select('owner_id, scenes').eq('id', adventureId).maybeSingle();
  if (!row) throw new CustomAdventureError('adventure not found', 404);
  if (row.owner_id !== ownerId) throw new CustomAdventureError('not the owner', 403);
  const scenes = row.scenes as { key: string; nameTh: string; imagePath: string | null }[];
  if (!scenes.some((s) => s.key === key)) throw new CustomAdventureError('unknown scene key', 400);

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let resized: Buffer;
  try {
    resized = await resizeSceneImage(inputBuffer);
  } catch {
    throw new CustomAdventureError('invalid image data', 400);
  }

  const path = `${adventureId}/${key}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('adventure-scenes')
    .upload(path, resized, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from('adventure-scenes').getPublicUrl(path);
  const newScenes = scenes.map((s) => (s.key === key ? { ...s, imagePath: publicUrl } : s));
  await supabase.from('custom_adventures').update({ scenes: newScenes }).eq('id', adventureId);

  return publicUrl;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/lib/adventures/sceneImage.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/adventures/sceneImage.ts src/lib/adventures/sceneImage.test.ts
git commit -m "feat(adventures): resize and upload scene images"
```

---

## Task 5: Async scene lookups for custom adventures

**Files:**
- Modify: `src/lib/scenes/scenes.ts`
- Test: `src/lib/scenes/scenes.test.ts`

**Interfaces:**
- Consumes: `getAdventure` (existing, same file's import of `@/lib/adventures/adventures` — add it), `allowedScenes`/`sceneInstruction`/`openingSceneId`/`getScene`/`SCENES` (existing, unchanged, same file).
- Produces: `export function customSceneId(adventureId: string, key: string): string`; `export async function allowedSceneIdsAsync(supabase, adventureId: string | null | undefined): Promise<string[]>`; `export async function sceneInstructionAsync(supabase, adventureId: string | null | undefined, currentSceneId?: string | null): Promise<string>`; `export async function openingSceneIdAsync(supabase, adventureId: string | null | undefined): Promise<string | null>`; `export async function getSceneAsync(supabase, adventureId: string | null | undefined, sceneId: string | null | undefined): Promise<(Scene & { imageUrl: string | null }) | undefined>`. Tasks 7 and 11 are the consumers.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/scenes/scenes.test.ts
import {
  allowedSceneIdsAsync, sceneInstructionAsync, openingSceneIdAsync, getSceneAsync, customSceneId,
} from './scenes';

function fakeSupabase(scenes: { key: string; nameTh: string; imagePath: string | null }[] | null) {
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: scenes ? { scenes } : null, error: null }) }) }) }));
  return { from } as any;
}

describe('async scene lookups: built-in fast path', () => {
  it('match the sync functions exactly and never touch the database', async () => {
    const supabase = fakeSupabase(null);
    expect(await allowedSceneIdsAsync(supabase, 'sunken-bell-of-marrowmere')).toEqual(
      allowedScenes('sunken-bell-of-marrowmere').map((s) => s.id)
    );
    expect(await sceneInstructionAsync(supabase, 'sunken-bell-of-marrowmere', 'bell-village')).toBe(
      sceneInstruction('sunken-bell-of-marrowmere', 'bell-village')
    );
    expect(await openingSceneIdAsync(supabase, 'sunken-bell-of-marrowmere')).toBe(openingSceneId('sunken-bell-of-marrowmere'));
    expect(await getSceneAsync(supabase, 'sunken-bell-of-marrowmere', 'bell-village')).toEqual({ ...getScene('bell-village'), imageUrl: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('async scene lookups: custom adventure', () => {
  const scenes = [
    { key: 'opening', nameTh: 'เปิดเรื่อง', imagePath: 'https://cdn/a1/opening.jpg' },
    { key: 'act-1', nameTh: 'องก์ 1', imagePath: null },
  ];

  it('builds globally-unique composite ids and resolves image urls', async () => {
    const supabase = fakeSupabase(scenes);
    expect(customSceneId('a1', 'opening')).toBe('a1-opening');
    const ids = await allowedSceneIdsAsync(supabase, 'a1');
    expect(ids).toContain('a1-opening');
    expect(ids).toContain('a1-act-1');
    expect(ids).toEqual(expect.arrayContaining(allowedScenes(null).map((s) => s.id))); // generics too
  });

  it('opening scene id is the first scene', async () => {
    expect(await openingSceneIdAsync(fakeSupabase(scenes), 'a1')).toBe('a1-opening');
  });

  it('resolves one scene with its image url', async () => {
    const scene = await getSceneAsync(fakeSupabase(scenes), 'a1', 'a1-opening');
    expect(scene).toEqual({ id: 'a1-opening', scope: 'a1', nameTh: 'เปิดเรื่อง', imageUrl: 'https://cdn/a1/opening.jpg' });
  });

  it('scene instruction mentions the current place and the adventure\'s own scenes first', async () => {
    const text = await sceneInstructionAsync(fakeSupabase(scenes), 'a1', 'a1-opening');
    expect(text).toContain('currently at a1-opening');
    expect(text.indexOf('a1-act-1')).toBeLessThan(text.indexOf('tavern-interior'));
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/lib/scenes/scenes.test.ts`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement in `src/lib/scenes/scenes.ts`**

Add `import { getAdventure } from '@/lib/adventures/adventures';` and `import type { SupabaseClient } from '@supabase/supabase-js';` at the top.

```ts
export function customSceneId(adventureId: string, key: string): string {
  return `${adventureId}-${key}`;
}

async function getCustomScenes(
  supabase: SupabaseClient,
  adventureId: string
): Promise<(Scene & { imageUrl: string | null })[]> {
  const { data } = await supabase.from('custom_adventures').select('scenes').eq('id', adventureId).maybeSingle();
  const scenes = (data?.scenes ?? []) as { key: string; nameTh: string; imagePath: string | null }[];
  return scenes.map((s) => ({ id: customSceneId(adventureId, s.key), scope: adventureId, nameTh: s.nameTh, imageUrl: s.imagePath }));
}

export async function allowedSceneIdsAsync(supabase: SupabaseClient, adventureId: string | null | undefined): Promise<string[]> {
  if (!adventureId || getAdventure(adventureId)) return allowedScenes(adventureId).map((s) => s.id);
  const own = await getCustomScenes(supabase, adventureId);
  const generic = SCENES.filter((s) => s.scope === 'generic').map((s) => s.id);
  return [...own.map((s) => s.id), ...generic];
}

export async function sceneInstructionAsync(
  supabase: SupabaseClient,
  adventureId: string | null | undefined,
  currentSceneId?: string | null
): Promise<string> {
  if (!adventureId || getAdventure(adventureId)) return sceneInstruction(adventureId, currentSceneId);
  const own = await getCustomScenes(supabase, adventureId);
  const generic = SCENES.filter((s) => s.scope === 'generic');
  const format = (list: { id: string; nameTh: string }[]) => list.map((s) => `${s.id} (${s.nameTh})`).join(', ');
  const current = own.find((s) => s.id === currentSceneId) ?? generic.find((s) => s.id === currentSceneId);
  return [
    'After your narration, add one final line containing only [[scene: ID]] to say where the party is now.',
    current ? `The party is currently at ${current.id} (${current.nameTh}); repeat that ID unless the story has clearly moved them somewhere else.` : '',
    `Prefer this adventure's own places: ${format(own)}.`,
    `Otherwise use a general place: ${format(generic)}.`,
  ].filter(Boolean).join(' ');
}

export async function openingSceneIdAsync(supabase: SupabaseClient, adventureId: string | null | undefined): Promise<string | null> {
  if (!adventureId) return null;
  if (getAdventure(adventureId)) return openingSceneId(adventureId);
  const own = await getCustomScenes(supabase, adventureId);
  return own[0]?.id ?? null;
}

export async function getSceneAsync(
  supabase: SupabaseClient,
  adventureId: string | null | undefined,
  sceneId: string | null | undefined
): Promise<(Scene & { imageUrl: string | null }) | undefined> {
  if (!sceneId) return undefined;
  if (!adventureId || getAdventure(adventureId)) {
    const s = getScene(sceneId);
    return s ? { ...s, imageUrl: null } : undefined;
  }
  const own = await getCustomScenes(supabase, adventureId);
  return own.find((s) => s.id === sceneId);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/scenes/scenes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/scenes/scenes.ts src/lib/scenes/scenes.test.ts
git commit -m "feat(scenes): async scene lookups that fall back to custom adventures"
```

---

## Task 6: Routes — create, update, delete, list, and upload images

**Files:**
- Create: `src/app/api/adventures/route.ts` (+ `.test.ts`)
- Create: `src/app/api/adventures/mine/route.ts` (+ `.test.ts`)
- Create: `src/app/api/adventures/[id]/route.ts` (+ `.test.ts`)
- Create: `src/app/api/adventures/[id]/scenes/[key]/image/route.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `createServiceRoleClient` from `@/lib/supabase/server`; `CustomAdventureError`, `validateCustomAdventureInput`, `createCustomAdventure`, `updateCustomAdventure`, `deleteCustomAdventure`, `listMyCustomAdventures` from Task 3; `uploadSceneImage` from Task 4.
- Produces: the 5 HTTP endpoints the UI tasks (12, 13) call.

All four route files share one auth shape: read `Authorization: Bearer <token>`, call `supabase.auth.getUser(token)`, 401 if no user — copy this block verbatim from `src/app/api/campaigns/[id]/shop/route.ts:16-21`.

- [ ] **Step 1: Write the failing tests** (one file per route; pattern from `src/app/api/campaigns/[id]/inventory/equip/route.test.ts` — mock `createServiceRoleClient` to return `{ auth: { getUser } }` plus whichever lib function the route calls)

`src/app/api/adventures/route.test.ts`:
```ts
// mocks createCustomAdventure + validateCustomAdventureInput via vi.mock('@/lib/adventures/customAdventures', ...)
// - 401 with no/invalid bearer token
// - 400 when validateCustomAdventureInput returns a message
// - 201 with the created adventure when valid, createCustomAdventure called with (expect.anything(), userId, body)
```

`src/app/api/adventures/mine/route.test.ts`:
```ts
// - 401 with no bearer token
// - 200 with listMyCustomAdventures(expect.anything(), userId)'s result
```

`src/app/api/adventures/[id]/route.test.ts`:
```ts
// PATCH:
// - 401 with no bearer token
// - 400 when validateCustomAdventureInput returns a message
// - maps CustomAdventureError's status (404, 403) from updateCustomAdventure
// - 200 with the updated adventure
// DELETE:
// - 401 with no bearer token
// - maps CustomAdventureError's status from deleteCustomAdventure
// - 204 on success
```

`src/app/api/adventures/[id]/scenes/[key]/image/route.test.ts`:
```ts
// - 401 with no bearer token
// - 400 when the body has no 'file' field
// - maps CustomAdventureError's status from uploadSceneImage
// - 200 with { imageUrl } on success, uploadSceneImage called with (expect.anything(), { adventureId: id, key, ownerId: userId, file })
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/app/api/adventures`
Expected: FAIL — route files don't exist yet.

- [ ] **Step 3: Implement `src/app/api/adventures/route.ts`**

```ts
export async function POST(request: NextRequest) {
  // auth (see above) -> userId
  const body = await request.json();
  const validationError = validateCustomAdventureInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const supabase = createServiceRoleClient();
  const adventure = await createCustomAdventure(supabase, userId, body);
  return NextResponse.json(adventure, { status: 201 });
}
```

- [ ] **Step 4: Implement `src/app/api/adventures/mine/route.ts`**

```ts
export async function GET(request: NextRequest) {
  // auth -> userId
  const supabase = createServiceRoleClient();
  const adventures = await listMyCustomAdventures(supabase, userId);
  return NextResponse.json({ adventures });
}
```

- [ ] **Step 5: Implement `src/app/api/adventures/[id]/route.ts`**

`PATCH` validates the body the same way as `POST`, then calls `updateCustomAdventure(supabase, id, userId, body)`; `DELETE` calls `deleteCustomAdventure(supabase, id, userId)` and returns 204. Both catch `CustomAdventureError` and map `error.status`/`error.message` into the JSON error response, same pattern as `src/app/api/campaigns/[id]/shop/route.ts:32-37`.

- [ ] **Step 6: Implement `src/app/api/adventures/[id]/scenes/[key]/image/route.ts`**

```ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  // auth -> userId
  const { id, key } = await params;
  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  const supabase = createServiceRoleClient();
  try {
    const imageUrl = await uploadSceneImage(supabase, { adventureId: id, key, ownerId: userId, file });
    return NextResponse.json({ imageUrl });
  } catch (error) {
    if (error instanceof CustomAdventureError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npx vitest run src/app/api/adventures`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/api/adventures
git commit -m "feat(adventures): CRUD and image-upload routes for custom adventures"
```

---

## Task 7: Thread resolved adventure/scene data through round processing

**Files:**
- Modify: `src/lib/round/assemblePrompt.ts` (+ `src/lib/round/assemblePrompt.test.ts`)
- Modify: `src/lib/round/roundRepository.ts` (+ `src/lib/round/roundRepository.test.ts`)
- Modify: `src/lib/round/processRound.ts` (+ `src/lib/round/processRound.test.ts`)

**Interfaces:**
- Consumes: `Adventure` type and `getAdventureById` (Task 2); `allowedSceneIdsAsync`, `sceneInstructionAsync` (Task 5).
- Produces: `assemblePrompt`'s new signature `(campaignSummary, recentMessages, actions, adventure: Adventure | null, sceneInstructionText: string, settings?, characterState?)`; `RoundContext` gains `adventure: Adventure | null`, `allowedSceneIds: string[]`, `sceneInstructionText: string`.

This is a signature change to code three other tasks don't touch, but every existing caller must keep working: `startCampaign.ts` and `createCampaign.ts` (Tasks 8–9) don't call `assemblePrompt` at all, so they're unaffected.

- [ ] **Step 1: Update `assemblePrompt.test.ts`'s failing assertions first**

Replace every call passing an adventure id string (`'sunken-bell-of-marrowmere'`) as the 4th argument with the real `Adventure` object, and `currentSceneId` (5th arg) with a scene-instruction string. Import `getAdventure` from `@/lib/adventures/adventures` and `sceneInstruction` from `@/lib/scenes/scenes` at the top of the test file to build these inline. For example:

```ts
it('includes the chosen adventure outline as the story backbone', () => {
  const adventure = getAdventure('sunken-bell-of-marrowmere')!;
  const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], adventure, sceneInstruction(adventure.id, null));
  expect(prompt).toContain('The Sunken Bell of Marrowmere');
  expect(prompt).toContain('Hidden truth');
});

it('omits adventure text when none is set', () => {
  const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], null, '');
  expect(prompt).not.toContain('Adventure:');
});
```

Apply the same substitution (4th arg → `Adventure | null`, 5th arg → `string`) to every other call site in the file that currently passes `'sunken-bell-of-marrowmere'`, `null`, or omits these args — omitted args become `null, ''`. Calls that only pass the first 3 args are unaffected (defaults still apply).

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/lib/round/assemblePrompt.test.ts`
Expected: FAIL — `assemblePrompt` still has the old signature.

- [ ] **Step 3: Implement the new `assemblePrompt` signature in `src/lib/round/assemblePrompt.ts`**

Change the signature to:

```ts
export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[],
  adventure: Adventure | null = null,
  sceneInstructionText = '',
  settings: CampaignSettings = DEFAULT_SETTINGS,
  characterState?: { characters: Character[]; pendingWipe: boolean; inventories?: Inventories; shop?: ShopState | null }
): string {
```

Remove the `getAdventure`/`sceneInstruction` imports and the `const adventure = getAdventure(adventureId);` line. Change line 70's `...(adventure ? [formatAdventureForPrompt(adventure), sceneInstruction(adventure.id, currentSceneId), ''] : [])` to `...(adventure ? [formatAdventureForPrompt(adventure), sceneInstructionText, ''] : [])`. Change line 82's `sanctuaryFor(adventureId)` to `sanctuaryFor(adventure?.id ?? null)`. Add `import type { Adventure } from '@/lib/adventures/adventures';`.

- [ ] **Step 4: Run assemblePrompt tests and verify they pass**

Run: `npx vitest run src/lib/round/assemblePrompt.test.ts`
Expected: PASS

- [ ] **Step 5: Update `RoundContext` and `getRoundContext` in `src/lib/round/roundRepository.ts`**

Add to the `RoundContext` interface: `adventure: Adventure | null; allowedSceneIds: string[]; sceneInstructionText: string;`. Import `Adventure`, `getAdventureById` from `@/lib/adventures/adventures` and `allowedSceneIdsAsync`, `sceneInstructionAsync` from `@/lib/scenes/scenes`. In `createSupabaseRoundRepository().getRoundContext`, after `adventureId`/`currentSceneId` are known (after the `campaignRow` query), resolve:

```ts
const adventure = await getAdventureById(supabase, campaignRow?.adventure_id as string | null);
const allowedSceneIds = await allowedSceneIdsAsync(supabase, campaignRow?.adventure_id as string | null);
const sceneInstructionText = await sceneInstructionAsync(supabase, campaignRow?.adventure_id as string | null, campaignRow?.current_scene_id as string | null);
```

and add `adventure, allowedSceneIds, sceneInstructionText,` to the returned object.

- [ ] **Step 6: Update `processRound.ts`'s call sites**

Remove `allowedScenes` from the `@/lib/scenes/scenes` import (keep `parseSceneTag`). Change the `assemblePrompt(...)` call's 4th/5th arguments from `context.adventureId, context.currentSceneId` to `context.adventure, context.sceneInstructionText`. Change line 113's condition from `allowedScenes(context.adventureId).some((s) => s.id === sceneId)` to `context.allowedSceneIds.includes(sceneId)`.

- [ ] **Step 7: Update `processRound.test.ts`'s default fixture**

In `createFakeRepository`'s `getRoundContext` mock, add fields so the three scene-tag tests keep passing unchanged:

```ts
import { allowedScenes } from '@/lib/scenes/scenes';
// ...
getRoundContext: vi.fn().mockResolvedValue({
  campaignId: 'camp-1',
  campaignSummary: '',
  recentMessages: [],
  actions: [{ playerDisplayName: 'Prem', actionText: 'Look around' }],
  characters: [],
  inventories: {},
  pendingWipe: false,
  currentShop: null,
  tagsApplied: false,
  adventure: null,
  allowedSceneIds: allowedScenes(undefined).map((s) => s.id),
  sceneInstructionText: '',
}),
```

- [ ] **Step 8: Run the round test suite and verify everything passes**

Run: `npx vitest run src/lib/round`
Expected: PASS — including the existing "ignores a scene id the DM invented" and "strips the scene tag" tests, unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/lib/round
git commit -m "feat(round): resolve adventure and scene data once per round, custom-adventure aware"
```

---

## Task 8: `startCampaign.ts` uses `getAdventureById`

**Files:**
- Modify: `src/lib/campaign/startCampaign.ts`

**Interfaces:**
- Consumes: `getAdventureById` from Task 2.

No new tests — `src/lib/campaign/startCampaign.test.ts`'s existing fake Supabase client throws on any table besides `players`/`campaigns`/`messages`, so this change is self-verifying: if `getAdventureById` ever queried `custom_adventures` for a built-in id, the existing tests would fail immediately.

- [ ] **Step 1: Change the import and call**

Replace `import { getAdventure } from '@/lib/adventures/adventures';` with `import { getAdventureById } from '@/lib/adventures/adventures';`, and `const adventure = getAdventure(campaign.adventure_id);` with `const adventure = await getAdventureById(supabase, campaign.adventure_id);`.

- [ ] **Step 2: Run the existing tests and verify they still pass**

Run: `npx vitest run src/lib/campaign/startCampaign.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaign/startCampaign.ts
git commit -m "feat(campaign): resolve custom adventures when posting the opening scene"
```

---

## Task 9: `createCampaign.ts` uses `openingSceneIdAsync`

**Files:**
- Modify: `src/lib/campaign/createCampaign.ts`

**Interfaces:**
- Consumes: `openingSceneIdAsync` from Task 5.

No new tests — same reasoning as Task 8; `src/app/api/campaigns/route.test.ts`'s `createCampaign` tests are self-verifying.

- [ ] **Step 1: Change the import and call**

Replace `import { openingSceneId } from '@/lib/scenes/scenes';` with `import { openingSceneIdAsync } from '@/lib/scenes/scenes';`, and `const sceneId = openingSceneId(params.adventureId);` with `const sceneId = await openingSceneIdAsync(supabase, params.adventureId);`.

- [ ] **Step 2: Run the existing tests and verify they still pass**

Run: `npx vitest run src/app/api/campaigns/route.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaign/createCampaign.ts
git commit -m "feat(campaign): show the opening scene for a custom adventure too"
```

---

## Task 10: Campaign-creation route validates custom adventure ids

**Files:**
- Modify: `src/app/api/campaigns/route.ts`
- Modify: `src/app/api/campaigns/route.test.ts`

**Interfaces:**
- Consumes: `getAdventureById` from Task 2.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/campaigns/route.test.ts` (this file currently only tests `createCampaign` directly — add a new `describe('POST /api/campaigns')` block that imports `POST` from `./route` and mocks `@/lib/supabase/server` + `@/lib/campaign/createCampaign`, following the pattern in `src/app/api/campaigns/[id]/inventory/equip/route.test.ts`):

```ts
describe('POST /api/campaigns', () => {
  it('rejects an adventureId that matches neither a built-in nor a custom row', async () => {
    // mock getAdventureById to resolve null for this id
    const response = await POST(new NextRequest('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name: 'T', userId: 'u1', displayName: 'Prem', adventureId: 'nope' }),
    }));
    expect(response.status).toBe(400);
  });

  it('accepts a real custom adventure id', async () => {
    // mock getAdventureById to resolve a fake Adventure for this id, createCampaign to resolve a result
    const response = await POST(new NextRequest('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name: 'T', userId: 'u1', displayName: 'Prem', adventureId: 'custom-1' }),
    }));
    expect(response.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/app/api/campaigns/route.test.ts`
Expected: FAIL — the route still calls the sync `getAdventure`, which returns `undefined` for `'custom-1'`.

- [ ] **Step 3: Implement**

In `src/app/api/campaigns/route.ts`, replace `import { getAdventure } from '@/lib/adventures/adventures';` with `import { getAdventureById } from '@/lib/adventures/adventures';`. Move `const supabase = createServiceRoleClient();` above the validation block, and change `if (body.adventureId && !getAdventure(body.adventureId))` to `if (body.adventureId && !(await getAdventureById(supabase, body.adventureId)))`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/app/api/campaigns/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/route.test.ts
git commit -m "feat(campaigns): accept a custom adventure id when creating a campaign"
```

---

## Task 11: `SceneBanner` resolves a custom adventure's scene image

**Files:**
- Modify: `src/components/SceneBanner.tsx`
- Modify: `src/components/SceneBanner.test.tsx`

**Interfaces:**
- Consumes: `getScene` (existing, unchanged), `getSceneAsync` (Task 5), `moodTint` (existing, unchanged) from `@/lib/scenes/scenes`; `getAdventure` from `@/lib/adventures/adventures`; `supabaseBrowserClient` from `@/lib/supabase/client`.

The 4 existing tests render synchronously and must keep passing unchanged: they all use a built-in `adventureId` or `null`, so the built-in sync path must resolve on the very first render with no async wait. Only a custom-adventure scene needs the async effect.

- [ ] **Step 1: Write the failing test for custom-adventure behavior**

Add to `SceneBanner.test.tsx`:

```ts
import { waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase/client', () => ({ supabaseBrowserClient: {} }));
vi.mock('@/lib/scenes/scenes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scenes/scenes')>()),
  getSceneAsync: vi.fn().mockResolvedValue({ id: 'custom-1-opening', scope: 'custom-1', nameTh: 'เปิดเรื่อง', imageUrl: 'https://cdn/custom-1/opening.jpg' }),
}));

describe('SceneBanner with a custom adventure', () => {
  it('resolves and shows the uploaded scene image', async () => {
    const { container } = render(<SceneBanner sceneId="custom-1-opening" adventureId="custom-1" />);
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/custom-1/opening.jpg'));
    expect(screen.getByText('เปิดเรื่อง')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests and verify the new one fails while the existing 4 still pass**

Run: `npx vitest run src/components/SceneBanner.test.tsx`
Expected: the 4 existing tests PASS; the new one FAILS (component doesn't resolve custom scenes yet).

- [ ] **Step 3: Implement in `src/components/SceneBanner.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getScene, getSceneAsync, moodTint, type Scene } from '@/lib/scenes/scenes';
import { getAdventure } from '@/lib/adventures/adventures';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export interface SceneBannerProps {
  sceneId: string | null;
  adventureId: string | null;
}

export function SceneBanner({ sceneId, adventureId }: SceneBannerProps) {
  const builtin = getScene(sceneId);
  const [customScene, setCustomScene] = useState<(Scene & { imageUrl: string | null }) | undefined>(undefined);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const previousScene = useRef<string | null>(null);

  useEffect(() => setFailedId(null), [sceneId]);

  useEffect(() => {
    if (previousScene.current && sceneId && previousScene.current !== sceneId) {
      setFlashKey((k) => k + 1);
    }
    if (sceneId) previousScene.current = sceneId;
  }, [sceneId]);

  // A custom adventure's own scene isn't in the static catalog; resolve it from Storage.
  // Built-ins and generics already resolved synchronously above via `builtin`.
  useEffect(() => {
    if (builtin || !sceneId || !adventureId || getAdventure(adventureId)) {
      setCustomScene(undefined);
      return;
    }
    let cancelled = false;
    getSceneAsync(supabaseBrowserClient, adventureId, sceneId).then((s) => {
      if (!cancelled) setCustomScene(s);
    });
    return () => {
      cancelled = true;
    };
  }, [builtin, sceneId, adventureId]);

  const scene = builtin ?? customScene;
  if (!scene) return null;
  const tint = moodTint(adventureId);
  const imageMissing = failedId === scene.id;
  const imgSrc = customScene?.imageUrl ?? `/scenes/${scene.id}.jpg`;

  return (
    <figure className="scene" aria-label={`ฉาก: ${scene.nameTh}`}>
      {!imageMissing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={scene.id} src={imgSrc} alt="" onError={() => setFailedId(scene.id)} />
      )}
      {tint && <div aria-hidden="true" className="tint" data-testid="scene-tint" style={{ background: tint }} />}
      <div aria-hidden="true" className="shade" />
      {flashKey > 0 && (
        <div key={flashKey} className="scene-title" aria-hidden="true" data-testid="scene-title">
          — {scene.nameTh} —
        </div>
      )}
      <figcaption>{scene.nameTh}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 4: Run the tests and verify they all pass**

Run: `npx vitest run src/components/SceneBanner.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/SceneBanner.tsx src/components/SceneBanner.test.tsx
git commit -m "feat(scenes): SceneBanner resolves a custom adventure's uploaded image"
```

---

## Task 12: `AdventureForm` — the two-step create/edit component

**Files:**
- Create: `src/components/AdventureForm.tsx`
- Create: `src/components/AdventureForm.test.tsx`

**Interfaces:**
- Consumes: `CustomAdventureInput`, `CustomScene` types (Task 3, re-exported or duplicated as a client-safe type — duplicate the two interfaces locally since `customAdventures.ts` imports server-only Supabase types alongside them; keep `AdventureForm.tsx` free of any `@/lib/adventures/customAdventures` import).
- Produces: `export interface AdventureFormProps { existing?: { id: string; titleTh: string; ... all CustomAdventureInput fields; scenes: CustomScene[] } }`; `export function AdventureForm(props: AdventureFormProps): JSX.Element`. Task 13's two page files are the only consumers.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdventureForm } from './AdventureForm';

const originalFetch = global.fetch;
beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { global.fetch = originalFetch; });

describe('AdventureForm — step 1, create', () => {
  it('starts with one empty act and lets you add another', () => {
    render(<AdventureForm />);
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(1);
    fireEvent.click(screen.getByText('+ เพิ่มองก์'));
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(2);
  });

  it('removes an act row', () => {
    render(<AdventureForm />);
    fireEvent.click(screen.getByText('+ เพิ่มองก์'));
    fireEvent.click(screen.getAllByText('ลบ')[0]);
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(1);
  });

  it('adds and removes an NPC row', () => {
    render(<AdventureForm />);
    expect(screen.queryAllByLabelText(/ชื่อ NPC/).length).toBe(0);
    fireEvent.click(screen.getByText('+ เพิ่ม NPC'));
    expect(screen.getAllByLabelText(/ชื่อ NPC/).length).toBe(1);
  });

  it('submits step 1 to POST /api/adventures and moves to step 2 on success', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'custom-1', scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null }] }),
    });
    render(<AdventureForm />);
    fireEvent.change(screen.getByLabelText('ชื่อเรื่อง (ไทย)'), { target: { value: 'ชื่อ' } });
    // ... fill every other required field similarly ...
    fireEvent.click(screen.getByText('สร้างเนื้อเรื่อง'));
    await waitFor(() => expect(screen.getByText('ภาพเปิดเรื่อง')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith('/api/adventures', expect.objectContaining({ method: 'POST' }));
  });
});

describe('AdventureForm — editing', () => {
  it('pre-fills values and shows step 2 immediately', () => {
    render(
      <AdventureForm
        existing={{
          id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH',
          setting: 'S', hook: 'H', openingTh: 'O', secret: 'Sec', acts: ['Act 1'], npcs: [],
          scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: 'https://cdn/custom-1/opening.jpg' }],
        }}
      />
    );
    expect((screen.getByLabelText('ชื่อเรื่อง (ไทย)') as HTMLInputElement).value).toBe('TH');
    expect(screen.getByText('ภาพเปิดเรื่อง')).toBeTruthy();
  });

  it('submits changes to PATCH /api/adventures/[id]', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'custom-1', scenes: [] }) });
    render(<AdventureForm existing={{ id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH', setting: 'S', hook: 'H', openingTh: 'O', secret: 'Sec', acts: ['Act 1'], npcs: [], scenes: [] }} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/adventures/custom-1', expect.objectContaining({ method: 'PATCH' })));
  });
});

describe('AdventureForm — step 2, image upload', () => {
  it('uploads a file for a scene slot', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'custom-1', scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageUrl: 'https://cdn/custom-1/opening.jpg' }) });
    render(<AdventureForm />);
    // ... fill and submit step 1 as above to reach step 2 ...
    const input = screen.getByLabelText('ภาพเปิดเรื่อง') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenLastCalledWith('/api/adventures/custom-1/scenes/opening/image', expect.objectContaining({ method: 'POST' }))
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/components/AdventureForm.test.tsx`
Expected: FAIL — component doesn't exist yet.

- [ ] **Step 3: Implement `src/components/AdventureForm.tsx`**

`'use client'` component with local state for every `CustomAdventureInput` field, an `acts: string[]` array (seeded with one empty string) with add/remove row buttons labeled "+ เพิ่มองก์" / "ลบ", and an `npcs: {name,role}[]` array (seeded empty) with "+ เพิ่ม NPC" / "ลบ". A `step` state (`'form' | 'images'`), starting at `'images'` when `props.existing` is given, else `'form'`. Step 1 submit handler `POST`s (or `PATCH`s when `props.existing`) to `/api/adventures`[`/${id}`] with a Bearer token from `supabaseBrowserClient.auth.getSession()` (same pattern as `saveCampaignSettings` in `src/lib/supabase/campaignSettings.ts:35-43`), stores the returned `{ id, scenes }`, and switches `step` to `'images'`. Step 2 renders one `<input type="file" accept="image/*">` per scene in local `scenes` state, each labeled with its `nameTh`, showing a `<img>` preview when `imagePath` is set; its `onChange` uploads via `POST /api/adventures/${id}/scenes/${key}/image` with a `FormData` body (`file` field) and the same Bearer token, updating that scene's `imagePath` in state from the response's `imageUrl` on success.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/components/AdventureForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AdventureForm.tsx src/components/AdventureForm.test.tsx
git commit -m "feat(adventures): two-step create/edit form for custom adventures"
```

---

## Task 13: `/adventures/new` and `/adventures/[id]/edit` pages

**Files:**
- Create: `src/app/adventures/new/page.tsx`
- Create: `src/app/adventures/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `AdventureForm` (Task 12); `getAdventureById` (Task 2) + `supabaseBrowserClient` for the edit page's data fetch.

- [ ] **Step 1: Implement `src/app/adventures/new/page.tsx`**

```tsx
'use client';
import { AdventureForm } from '@/components/AdventureForm';

export default function NewAdventurePage() {
  return (
    <main className="screen">
      <AdventureForm />
    </main>
  );
}
```

- [ ] **Step 2: Implement `src/app/adventures/[id]/edit/page.tsx`**

`'use client'` page that, on mount, fetches the custom adventure via `getAdventureById(supabaseBrowserClient, id)` plus its `scenes` (a direct `.from('custom_adventures').select('scenes').eq('id', id).maybeSingle()` call, since `getAdventureById` returns the `Adventure` shape without `scenes`), shows a loading state until both resolve, then renders `<AdventureForm existing={{ ...adventure, scenes }} />`. Mirrors the fetch-on-mount pattern already used in `src/app/campaign/[id]/page.tsx`.

- [ ] **Step 3: Manually verify both pages render**

Run: `npm run dev`, visit `/adventures/new`, fill the form, submit, confirm it reaches step 2; visit `/adventures/<created-id>/edit`, confirm the fields and any uploaded images are pre-filled.

- [ ] **Step 4: Commit**

```bash
git add src/app/adventures
git commit -m "feat(adventures): add the create and edit pages"
```

---

## Task 14: `MyAdventures` — the home page's custom-adventure library

**Files:**
- Create: `src/components/MyAdventures.tsx`
- Create: `src/components/MyAdventures.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React/Next — pure presentational component, data passed in as a prop.
- Produces: `export interface MyAdventureSummary { id: string; titleTh: string; taglineTh: string; thumbnailUrl: string | null }`; `export function MyAdventures({ adventures }: { adventures: MyAdventureSummary[] }): JSX.Element | null`. Task 15 is the consumer.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyAdventures } from './MyAdventures';

describe('MyAdventures', () => {
  it('renders nothing when there are no custom adventures', () => {
    const { container } = render(<MyAdventures adventures={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each adventure with an edit link', () => {
    render(<MyAdventures adventures={[{ id: 'c1', titleTh: 'เรื่องของฉัน', taglineTh: 'แท็กไลน์', thumbnailUrl: null }]} />);
    expect(screen.getByText('เรื่องของฉัน')).toBeTruthy();
    expect(screen.getByText('แก้ไข').closest('a')).toHaveAttribute('href', '/adventures/c1/edit');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/MyAdventures.test.tsx`
Expected: FAIL — component doesn't exist yet.

- [ ] **Step 3: Implement `src/components/MyAdventures.tsx`**

Mirror `src/components/MyCampaigns.tsx`'s structure exactly: return `null` when `adventures.length === 0` (matching the Step 1 test and `MyCampaigns`'s own behavior); otherwise a `<section className="panel my-adventures">`, `<h2 className="lede">` "คลังของฉัน", and a `<ul className="my-adventures-list">` of `<li>` rows, each a `<Link href={`/adventures/${a.id}/edit`} className="my-adventure-row">` containing the title (`a.titleTh`), tagline (`a.taglineTh`), and a "แก้ไข" label. This component only renders the caller's *existing* adventures — the "+ สร้างเนื้อเรื่องใหม่" entry point lives directly in `page.tsx` (Task 15), the same way `MyCampaigns` never renders the "create a campaign" form itself.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/components/MyAdventures.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/MyAdventures.tsx src/components/MyAdventures.test.tsx
git commit -m "feat(adventures): MyAdventures list for the home page"
```

---

## Task 15: Home page — merge custom adventures into the picker

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `MyAdventures`, `MyAdventureSummary` (Task 14).

- [ ] **Step 1: Add state and a fetch for the caller's custom adventures**

Alongside the existing `myCampaigns` state/effect (`src/app/page.tsx:29-57`), add `const [myAdventures, setMyAdventures] = useState<MyAdventureSummary[]>([]);` and, inside the same `useEffect` (after `fetchMyCampaigns` succeeds, same guarded session check), fetch `GET /api/adventures/mine` with the session's Bearer token and `setMyAdventures(body.adventures)` — wrapped in the same best-effort `try { } catch { /* convenience list */ }` the campaigns fetch already uses.

- [ ] **Step 2: Build one normalized picker list**

Before the `<fieldset className="adv-list">` block, compute:

```ts
const pickerItems = [
  ...ADVENTURES.map((a) => ({ id: a.id, titleTh: a.titleTh, taglineTh: a.taglineTh, toneTh: a.toneTh, thumbnailUrl: sceneUrl(a.id) })),
  ...myAdventures.map((a) => ({ id: a.id, titleTh: a.titleTh, taglineTh: a.taglineTh, toneTh: '', thumbnailUrl: a.thumbnailUrl })),
];
```

Replace the `{ADVENTURES.map((a) => (...))}` block's source with `pickerItems.map((a) => (...))`, and inside it replace `<img src={sceneUrl(a.id)} alt="" />` with `<img src={a.thumbnailUrl ?? ''} alt="" />` and drop the `.chips`/tone chip when `a.toneTh` is empty (custom adventures show no tone chip in the picker; the field still exists on the adventure itself for the AI prompt).

Replace `const adventure = ADVENTURES.find((a) => a.id === adventureId) ?? ADVENTURES[0];` with `const picked = pickerItems.find((a) => a.id === adventureId) ?? pickerItems[0];`, and update the `.preview-art` block to use `picked.thumbnailUrl` instead of `sceneUrl(adventure.id)`. Replace the `.preview-hook` block (`{adventure.openingTh.split('...')[0].slice(0, 150)}…`) with a conditional: built-in adventures (`ADVENTURES.some((a) => a.id === picked.id)`) keep showing that hook preview via the original `ADVENTURES.find`; a custom adventure (the `else` branch) shows `picked.taglineTh` instead, since `MyAdventureSummary` (Task 14) carries a tagline but not the full `openingTh` text — extending the `mine` list endpoint to also ship `openingTh` for a home-page preview is unnecessary: the tagline already tells the player what they're picking, and the real hook still reaches the AI prompt via `formatAdventureForPrompt` regardless of what the picker previews.

- [ ] **Step 3: Render `<MyAdventures>` and the "create new" entry point**

After `<MyCampaigns campaigns={myCampaigns} />`, add:

```tsx
<MyAdventures adventures={myAdventures} />
<Link href="/adventures/new" className="btn ghost">+ สร้างเนื้อเรื่องใหม่</Link>
```

Add `import Link from 'next/link';` and `import { MyAdventures, type MyAdventureSummary } from '@/components/MyAdventures';` at the top.

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, sign in (create a campaign to get an anonymous session), create a custom adventure via `/adventures/new`, return to `/`, confirm it appears in "คลังของฉัน" and in the main picker grid, and that selecting it and creating a campaign works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(adventures): show custom adventures in the home page picker"
```

---

## Task 16: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: every test passes, including every file this plan touched and every file it didn't (the built-in-fast-path guarantees from Tasks 2, 5, 7, 8, 9 mean nothing about the original 9 adventures should have changed).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit if either step required a fix**

```bash
git add -A
git commit -m "fix: resolve regressions found in the full test and type-check pass"
```

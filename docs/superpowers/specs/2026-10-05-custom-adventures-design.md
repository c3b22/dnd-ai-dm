# Custom adventures (user-created storylines + scene art) — design

Lets a player write their own adventure (same shape as the 9 built-in ones) and attach an illustration to each of its scenes, then pick it when starting a campaign exactly like a built-in one.

## Goal

Built-in adventures are static, build-time content in `src/lib/adventures/adventures.ts` and `src/lib/scenes/catalog.json`, with images shipped in `public/scenes/`. This adds a second, runtime source — adventures a player authors and stores in Supabase — without changing how the built-in ones work or slowing down the hot paths that read them (prompt assembly every round, campaign creation).

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Reusable or one-off? | Saved to the creator's own library, reusable across any number of campaigns. |
| How much detail does the form ask for? | Full parity with the built-in `Adventure` shape: title/titleTh, tagline/taglineTh, tone/toneTh, setting, hook, openingTh, secret, a list of acts, a list of NPCs. |
| Where do built-ins vs custom ones live? | Built-ins stay exactly as they are today (static array + JSON catalog). Custom ones live in a new Supabase table + Storage bucket; lookups check built-in first, then fall back to the table. |
| How many scene images? | One per scene key, where the scene keys are derived automatically from the acts: `opening`, `act-1`, …, `act-N`. No free-form scene list, no generic/shared scenes, no mood tint — those stay built-in-only conveniences. |
| Is an image required? | No. A scene with no uploaded image just doesn't render a banner for that scene (same as today when `SceneBanner` can't load an image). |
| Out of scope | Public sharing/discovery of other players' custom adventures, moderation/review, editing acts after images are attached and having scene keys stay in sync (adding/removing acts after creation regenerates the scene list and orphans any images for removed act keys — acceptable for v1), voice/multi-language beyond the existing Thai/English pair. |

## Data — migration `0014_custom_adventures.sql`

- `custom_adventures`: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `title text not null`, `title_th text not null`, `tagline text not null`, `tagline_th text not null`, `tone text not null`, `tone_th text not null`, `setting text not null`, `hook text not null`, `opening_th text not null`, `secret text not null`, `acts jsonb not null` (`string[]`, at least 1), `npcs jsonb not null default '[]'` (`{name, role}[]`), `scenes jsonb not null default '[]'` (`{key, nameTh, imagePath}[]`, `imagePath` null until uploaded), `created_at timestamptz not null default now()`.
- RLS: **select** open to everyone including `anon` (other players in a campaign must be able to load the adventure); **insert/update/delete** restricted to `auth.uid() = owner_id`.
- Storage bucket `adventure-scenes`, `public = true`. Objects live at `<adventure_id>/<scene_key>.jpg`. Storage policies: `select` open to all; `insert`/`update`/`delete` only when the first path segment's adventure row has `owner_id = auth.uid()`.
- No change to `campaigns.adventure_id` — a custom adventure's UUID is stored there exactly like a built-in slug is today.

## Lookup — `src/lib/adventures/adventures.ts` and `src/lib/scenes/scenes.ts`

- `getAdventureById(supabase, id): Promise<Adventure | null>` — tries the sync, in-memory `getAdventure(id)` first (the 9 built-ins: zero DB calls, unchanged behavior). Only when that misses does it query `custom_adventures` by id and map the row into the same `Adventure` shape (`acts`/`npcs` come straight off the jsonb columns). This is the function `assemblePrompt.ts`, `startCampaign.ts`, and the campaign-creation route call instead of today's sync `getAdventure`.
- A parallel `getAdventureScenes(supabase, adventureId)` does the same fallback for scenes: built-in ids read `catalog.json` as today; custom ids read the row's `scenes` jsonb, with each entry's `imagePath` already a full Storage URL (not a local path to join).
- Client-side, `campaign/[id]/page.tsx` stops calling `getAdventure` synchronously and instead fetches the adventure once on mount into state, the same pattern already used there for campaign settings/players/messages.
- `SceneBanner` gains a one-line change: build the `<img src>` from `scene.imageUrl` when the scene came from a custom adventure, falling back to today's `/scenes/<id>.jpg` for built-in ones.

## Routes (Bearer-authenticated, same pattern as `shop`/`inventory/equip`)

- `POST /api/adventures` `{ title, titleTh, tagline, taglineTh, tone, toneTh, setting, hook, openingTh, secret, acts, npcs }`: validates non-empty required fields and at least one act, derives `scenes` from `acts.length`, inserts with `owner_id` = the token's user id. Returns the created row.
- `PATCH /api/adventures/[id]` — same body shape, owner-only (403 otherwise). If `acts.length` changes, recomputes `scenes`, keeping `imagePath` for keys that still exist and dropping entries for removed act keys (their Storage objects are left orphaned and swept by a later cleanup — not needed for v1).
- `DELETE /api/adventures/[id]` — owner-only; deletes the row and the `adventure-scenes/<id>/` Storage folder.
- `GET /api/adventures/mine` — lists the caller's own custom adventures (id, title, titleTh, tagline, taglineTh, opening scene's imagePath for a thumbnail), for the home page's "คลังของฉัน" list.
- `POST /api/adventures/[id]/scenes/[key]/image` — multipart `FormData` with one `file`. Owner-only. Rejects non-`image/*` mime types and files over 5 MB. Resizes with `sharp` to 1600px wide / JPEG quality 82 (the same convention `scripts/import-scene.mjs` already uses for built-in scenes — `sharp` moves from ad-hoc script use to a real `package.json` dependency), uploads to `adventure-scenes/<id>/<key>.jpg` (overwriting any existing object for that key), and updates `scenes[key].imagePath`. Returns the new URL.

## UI

- `/adventures/new` (and `/adventures/[id]/edit`, same component): a two-step client page.
  - *Step 1 — the story form:* every metadata field above, plus add/remove-row controls for acts (one textarea each, minimum 1) and NPCs (name + role pair each, may be empty). Submits to `POST /api/adventures` or `PATCH` when editing.
  - *Step 2 — attach images:* shown once the adventure row exists. One upload slot per scene key (opening + each act) with a label (เช่น "ภาพเปิดเรื่อง", "ภาพองก์ที่ 1"), a preview of the current image if any, and an independent upload button per slot. Editing an existing adventure opens straight into this combined view with current values and images filled in.
- Home page (`src/app/page.tsx`): a "คลังของฉัน" section next to `MyCampaigns`, fetched from `GET /api/adventures/mine` only when a session exists (same guarded, best-effort pattern already used for `fetchMyCampaigns`). Each entry gets an "แก้ไข" link and is merged into the same adventure-picker grid used for the 9 built-in ones, so starting a campaign from a custom adventure is the same flow as today. A "+ สร้างเนื้อเรื่องใหม่" button links to `/adventures/new`.

## Testing

Test-first, matching existing conventions (Vitest + Testing Library, dependency-injected Supabase client):

- `getAdventureById` / `getAdventureScenes`: built-in id takes the zero-DB-call path; custom id maps a row correctly; unknown id returns null.
- Route tests for create/update/delete/list: auth required, ownership enforced on update/delete, validation (missing required field, empty acts array), `PATCH` recomputing `scenes` when act count changes.
- Image upload route: rejects non-image mime, rejects over the size cap, rejects a non-owner, resizes before storing (assert the `sharp` call), overwrites an existing scene's image.
- `SceneBanner`: renders the Storage URL when `scene.imageUrl` is set, falls back to the local path otherwise, still handles a missing/broken image the same as today.
- Scene-lookup functions against a custom adventure's `scenes` jsonb instead of `catalog.json`.
- Create/edit form component test: add/remove act and NPC rows, the two-step flow, pre-filled values when editing.

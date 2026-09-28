# AI DM Engine + Real-time Text Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working web app where a small group of friends plays a D&D campaign narrated live by an AI Dungeon Master, with everyone seeing the same narration and action log update in real time.

**Architecture:** A Next.js app on Vercel talks to Supabase (Postgres + Realtime + Auth) as the single source of truth. Players insert their per-round actions directly into Supabase; any connected client detects when a round is complete and calls a Next.js API route, which atomically claims the round, assembles a prompt from campaign history, streams a response from Gemini, and writes it back to Supabase — which every client is already subscribed to, so the narration appears live for everyone at once.

**Tech Stack:** Next.js (App Router, TypeScript), Supabase (Postgres, Realtime, Auth — Free tier), Google Gemini API via the Vercel AI SDK, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-28-ai-dm-engine-realtime-session-design.md](../specs/2026-09-28-ai-dm-engine-realtime-session-design.md)

## Global Constraints

- Scale target: 1 table of 4–6 players, 2–3 sessions/week — do not add multi-table or high-concurrency infrastructure.
- Tech stack is fixed: Next.js + Vercel (Hobby) + Supabase (Free tier) + Google Gemini API (Flash) via Vercel AI SDK, streaming, with Gemini Flash-Lite as the 429 fallback.
- Narrative-first rules: the AI adjudicates outcomes narratively. Dice/randomness is done in code where needed, not a full 5e rules engine — that is explicitly out of scope.
- Round model: every player acts simultaneously each round; the AI DM responds once per round, never once per player.
- Context must stay bounded: `campaign_summary` is regenerated on a rolling basis so prompts don't grow unbounded over a multi-week campaign.
- Campaigns must persist and be resumable across days/weeks — no in-memory-only state.

## Review Focus

- Two clients both notice a round is complete at the same instant — only one may call Gemini for that round; the other must no-op.
- A player who never submits an action for a round — the round must not deadlock forever waiting for them.
- Gemini's free tier returns a 429 mid-campaign — the round must still complete via the fallback model, not fail outright.
- Campaign history keeps growing over many sessions — the assembled prompt must not grow unbounded and blow past what the model can use well.
- The same DM message streams in over many chunks — every client must see it update in place, never duplicated or flickering.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working Next.js + TypeScript + Vitest project that every later task builds on. The `@/*` path alias resolves to `src/*`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dnd-ai-dm",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "ai": "^4.0.0",
    "@ai-sdk/google": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/user-event": "^14.5.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `.env.local.example`**

`next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
});
```

`vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 4: Write `src/app/layout.tsx` and `src/app/page.tsx`**

`src/app/layout.tsx`:

```tsx
export const metadata = { title: 'D&D AI DM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function Home() {
  return <main>D&amp;D AI Dungeon Master</main>;
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: installs without errors.

- [ ] **Step 6: Write the smoke test**

`src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

function add(a: number, b: number) {
  return a + b;
}

describe('smoke test', () => {
  it('confirms the test runner and TypeScript config work', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 7: Run the test suite**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 8: Verify the app builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json next.config.mjs vitest.config.ts vitest.setup.ts .env.local.example src
git commit -m "chore: scaffold Next.js + TypeScript + Vitest project"
```

---

## Task 2: Database Schema

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the `campaigns`, `players`, `rounds`, `round_actions`, `messages`, `game_state`, `campaign_summary` tables with Row Level Security, matching the spec's data model exactly. Every later task's Supabase queries assume these table and column names.

**Note:** this task cannot be verified by an automated test in this repo — it depends on a live Supabase project, which only the user can provision. Verification is manual.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init_schema.sql`:

```sql
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  current_round_id uuid
);

create table players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'closed')),
  opened_at timestamptz not null default now(),
  processing_started_at timestamptz
);

alter table campaigns
  add constraint campaigns_current_round_fk
  foreign key (current_round_id) references rounds(id);

create table round_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  action_text text not null,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  round_id uuid references rounds(id) on delete set null,
  role text not null check (role in ('dm', 'player', 'system')),
  content text not null default '',
  created_at timestamptz not null default now()
);

create table game_state (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table campaign_summary (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  summary text not null default '',
  covers_up_to_round uuid references rounds(id),
  updated_at timestamptz not null default now()
);

alter table campaigns enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table round_actions enable row level security;
alter table messages enable row level security;
alter table game_state enable row level security;
alter table campaign_summary enable row level security;

create policy "players can view their campaigns"
  on campaigns for select
  using (
    exists (
      select 1 from players
      where players.campaign_id = campaigns.id
      and players.user_id = auth.uid()
    )
  );

create policy "users can view players in their campaigns"
  on players for select
  using (
    exists (
      select 1 from players as me
      where me.campaign_id = players.campaign_id
      and me.user_id = auth.uid()
    )
  );

create policy "users can join a campaign as themselves"
  on players for insert
  with check (user_id = auth.uid());

create policy "players can view rounds in their campaigns"
  on rounds for select
  using (
    exists (
      select 1 from players
      where players.campaign_id = rounds.campaign_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can view round actions in their campaigns"
  on round_actions for select
  using (
    exists (
      select 1 from players
      join rounds on rounds.id = round_actions.round_id
      where players.campaign_id = rounds.campaign_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can submit only their own action"
  on round_actions for insert
  with check (
    exists (
      select 1 from players
      where players.id = round_actions.player_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can view messages in their campaigns"
  on messages for select
  using (
    exists (
      select 1 from players
      where players.campaign_id = messages.campaign_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can view game state in their campaigns"
  on game_state for select
  using (
    exists (
      select 1 from players
      where players.campaign_id = game_state.campaign_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can view campaign summary in their campaigns"
  on campaign_summary for select
  using (
    exists (
      select 1 from players
      where players.campaign_id = campaign_summary.campaign_id
      and players.user_id = auth.uid()
    )
  );
```

Only `select` and the player's own `round_actions`/`players` `insert` are granted to authenticated clients. Every other write (`messages`, `game_state`, `campaign_summary`, `rounds`) is done server-side with the Supabase service role key, which bypasses RLS — matching the spec's round-processing flow, where only the API route writes those tables.

- [ ] **Step 2: Apply the migration to a Supabase project (manual)**

Create a free Supabase project at supabase.com, then either:
- Paste the SQL above into the project's SQL Editor and run it, or
- `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`

Verify: the Table Editor shows all 7 tables, and each has "RLS enabled" shown next to it. Also enable **anonymous sign-ins** in Authentication → Providers (used by Task 3 onward).

Copy the project's URL, anon key, and service role key (Settings → API) into a local `.env.local` (copy from `.env.local.example`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init_schema.sql
git commit -m "feat: add Supabase schema for campaigns, rounds, and messages"
```

---

## Task 3: Campaign Creation & Join API Routes

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/app/api/campaigns/route.ts`
- Test: `src/app/api/campaigns/route.test.ts`
- Create: `src/app/api/campaigns/[id]/join/route.ts`
- Test: `src/app/api/campaigns/[id]/join/route.test.ts`

**Interfaces:**
- Consumes: the `campaigns`, `players`, `rounds` tables from Task 2.
- Produces: `createServiceRoleClient(): SupabaseClient` and `supabaseBrowserClient: SupabaseClient`, used by every later task that talks to Supabase. `createCampaign(supabase, { name, userId, displayName })` and `joinCampaign(supabase, { campaignId, userId, displayName })`, both exported from their route files for testing.

- [ ] **Step 1: Write the Supabase client helpers**

`src/lib/supabase/client.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowserClient = createClient(url, anonKey);
```

`src/lib/supabase/server.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment variables');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 2: Write the failing test for `createCampaign`**

`src/app/api/campaigns/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createCampaign } from './route';

function createFakeSupabase(responses: Record<string, any>) {
  const calls: { table: string; action: string }[] = [];
  const from = (table: string) => {
    const builder: any = {
      insert: () => {
        calls.push({ table, action: 'insert' });
        return builder;
      },
      update: () => {
        calls.push({ table, action: 'update' });
        return builder;
      },
      eq: () => Promise.resolve({ data: null, error: null }),
      select: () => builder,
      single: () => Promise.resolve({ data: responses[table], error: null }),
    };
    return builder;
  };
  return { client: { from } as any, calls };
}

describe('createCampaign', () => {
  it('creates a campaign, adds the creator as a player, and opens round 1', async () => {
    const { client, calls } = createFakeSupabase({
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    });

    const result = await createCampaign(client, {
      name: 'Test',
      userId: 'user-1',
      displayName: 'Prem',
    });

    expect(result.campaign.id).toBe('camp-1');
    expect(result.player.id).toBe('player-1');
    expect(result.round.id).toBe('round-1');
    expect(calls.map((c) => `${c.action}:${c.table}`)).toEqual([
      'insert:campaigns',
      'insert:players',
      'insert:rounds',
      'update:campaigns',
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/app/api/campaigns/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 4: Implement `createCampaign` and the route**

`src/app/api/campaigns/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function createCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { name: string; userId: string; displayName: string }
) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({ name: params.name })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaign.id,
      user_id: params.userId,
      display_name: params.displayName,
    })
    .select()
    .single();
  if (playerError) throw playerError;

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ campaign_id: campaign.id, status: 'pending' })
    .select()
    .single();
  if (roundError) throw roundError;

  await supabase
    .from('campaigns')
    .update({ current_round_id: round.id })
    .eq('id', campaign.id);

  return { campaign, player, round };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name || !body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'name, userId, and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  const result = await createCampaign(supabase, body);
  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/app/api/campaigns/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for `joinCampaign`**

`src/app/api/campaigns/[id]/join/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { joinCampaign } from './route';

function createFakeSupabase(playerResponse: any) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: playerResponse, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('joinCampaign', () => {
  it('adds a new player row to the campaign', async () => {
    const supabase = createFakeSupabase({ id: 'player-2', display_name: 'Alex' });
    const player = await joinCampaign(supabase, {
      campaignId: 'camp-1',
      userId: 'user-2',
      displayName: 'Alex',
    });
    expect(player).toEqual({ id: 'player-2', display_name: 'Alex' });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- src/app/api/campaigns/[id]/join/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 8: Implement `joinCampaign` and the route**

`src/app/api/campaigns/[id]/join/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function joinCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string; displayName: string }
) {
  const { data, error } = await supabase
    .from('players')
    .insert({
      campaign_id: params.campaignId,
      user_id: params.userId,
      display_name: params.displayName,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  if (!body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'userId and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  const player = await joinCampaign(supabase, {
    campaignId: params.id,
    userId: body.userId,
    displayName: body.displayName,
  });
  return NextResponse.json(player, { status: 201 });
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- src/app/api/campaigns/[id]/join/route.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/supabase src/app/api/campaigns
git commit -m "feat: add campaign creation and join API routes"
```

---

## Task 4: Round Claiming Logic

**Files:**
- Create: `src/lib/round/claimRound.ts`
- Test: `src/lib/round/claimRound.test.ts`

**Interfaces:**
- Consumes: the `rounds` table (Task 2).
- Produces: `claimRound(supabase: SupabaseClient, roundId: string, staleAfterMs?: number): Promise<boolean>` — resolves `true` only for the single caller that transitions a round to `processing`, either from `pending` or from a `processing` round whose `processing_started_at` is older than `staleAfterMs` (default 30000). Used by Task 7's orchestration.

- [ ] **Step 1: Write the failing tests**

`src/lib/round/claimRound.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { claimRound } from './claimRound';

function createFakeSupabase(matchingRows: any[] | null, error: Error | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: any = {
    update: (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return builder;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: 'or', args });
      return builder;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return Promise.resolve({ data: matchingRows, error });
    },
  };
  return { client: { from: () => builder } as any, calls };
}

describe('claimRound', () => {
  it('returns true when it is the only caller to claim a pending round', async () => {
    const { client } = createFakeSupabase([{ id: 'round-1' }]);
    await expect(claimRound(client, 'round-1')).resolves.toBe(true);
  });

  it('returns false when the round was already claimed by another caller', async () => {
    const { client } = createFakeSupabase([]);
    await expect(claimRound(client, 'round-1')).resolves.toBe(false);
  });

  it('throws if the update fails', async () => {
    const { client } = createFakeSupabase(null, new Error('boom'));
    await expect(claimRound(client, 'round-1')).rejects.toThrow('boom');
  });

  it('includes a staleness clause so a round stuck in processing can be re-claimed', async () => {
    const { client, calls } = createFakeSupabase([{ id: 'round-1' }]);
    await claimRound(client, 'round-1', 30_000);
    const orCall = calls.find((c) => c.method === 'or');
    expect(orCall).toBeDefined();
    expect(orCall!.args[0]).toContain('status.eq.pending');
    expect(orCall!.args[0]).toContain('status.eq.processing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/round/claimRound.test.ts`
Expected: FAIL — `claimRound.ts` doesn't exist yet.

- [ ] **Step 3: Implement `claimRound`**

`src/lib/round/claimRound.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_STALE_AFTER_MS = 30_000;

export async function claimRound(
  supabase: SupabaseClient,
  roundId: string,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    })
    .eq('id', roundId)
    .or(`status.eq.pending,and(status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .select('id');

  if (error) throw error;
  return (data?.length ?? 0) === 1;
}
```

This relies on Postgres executing the `UPDATE ... WHERE id = $1 AND (...)` atomically per row: if two requests race for a `pending` round, only the first to commit matches; by the time the second one's `UPDATE` runs, the row already reads `'processing'` with a fresh `processing_started_at`, so it matches neither branch of the `or` and `claimRound` returns `false`. If a previous attempt died mid-flight (network error, function timeout) without ever closing the round, `processing_started_at` stops advancing, and once it's older than `staleAfterMs` a later call is allowed to re-claim and retry — this is what backs the "Process round now" manual retry button in Task 10.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/round/claimRound.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/round/claimRound.ts src/lib/round/claimRound.test.ts
git commit -m "feat: add atomic round-claiming logic"
```

---

## Task 5: Prompt Assembly & Context Rotation Logic

**Files:**
- Create: `src/lib/round/assemblePrompt.ts`
- Test: `src/lib/round/assemblePrompt.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `StoredMessage` (`{ role: 'dm' | 'player' | 'system'; content: string }`), `RoundAction` (`{ playerDisplayName: string; actionText: string }`), `assemblePrompt(campaignSummary: string, recentMessages: StoredMessage[], actions: RoundAction[]): string`, and `shouldRotateSummary(recentMessages: StoredMessage[]): boolean`. Used by Task 7.

- [ ] **Step 1: Write the failing tests**

`src/lib/round/assemblePrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assemblePrompt, shouldRotateSummary, StoredMessage } from './assemblePrompt';

describe('assemblePrompt', () => {
  it('includes the campaign summary, recent messages, and this round actions', () => {
    const prompt = assemblePrompt(
      'The party entered the cave.',
      [{ role: 'dm', content: 'You see a torch flickering.' }],
      [{ playerDisplayName: 'Prem', actionText: 'I light the torch' }]
    );

    expect(prompt).toContain('The party entered the cave.');
    expect(prompt).toContain('You see a torch flickering.');
    expect(prompt).toContain('Prem: I light the torch');
  });

  it('labels an empty summary as a fresh campaign', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'Look around' },
    ]);
    expect(prompt).toContain('(campaign just started)');
  });
});

describe('shouldRotateSummary', () => {
  it('returns false when recent history is short', () => {
    const messages: StoredMessage[] = [{ role: 'dm', content: 'Short message.' }];
    expect(shouldRotateSummary(messages)).toBe(false);
  });

  it('returns true when recent history exceeds the rotation threshold', () => {
    const longMessage: StoredMessage = { role: 'dm', content: 'x'.repeat(9000) };
    expect(shouldRotateSummary([longMessage])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/round/assemblePrompt.test.ts`
Expected: FAIL — `assemblePrompt.ts` doesn't exist yet.

- [ ] **Step 3: Implement the module**

`src/lib/round/assemblePrompt.ts`:

```ts
export interface StoredMessage {
  role: 'dm' | 'player' | 'system';
  content: string;
}

export interface RoundAction {
  playerDisplayName: string;
  actionText: string;
}

export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[]
): string {
  const historyText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const actionsText = actions
    .map((a) => `${a.playerDisplayName}: ${a.actionText}`)
    .join('\n');

  return [
    'You are the Dungeon Master for an ongoing D&D campaign.',
    'Narrate what happens next based on the players actions below.',
    '',
    'Story so far:',
    campaignSummary || '(campaign just started)',
    '',
    'Recent narration and dialogue:',
    historyText || '(no recent messages)',
    '',
    "This round's player actions:",
    actionsText,
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/round/assemblePrompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/round/assemblePrompt.ts src/lib/round/assemblePrompt.test.ts
git commit -m "feat: add prompt assembly and context-rotation logic"
```

---

## Task 6: Gemini Client Wrapper with Rate-Limit Fallback

**Files:**
- Create: `src/lib/ai/geminiClient.ts`
- Test: `src/lib/ai/geminiClient.test.ts`
- Create: `src/lib/ai/vercelAiSdkAdapter.ts`

**Interfaces:**
- Consumes: nothing directly (the adapter wires the real `ai` / `@ai-sdk/google` packages, injected as `TextStreamer`).
- Produces: `isRateLimitError(error: unknown): boolean`, `GeminiClientDeps` (`{ streamText: TextStreamer; primaryModel: string; fallbackModel: string }`), `generateNarration(prompt: string, deps: GeminiClientDeps): Promise<AsyncIterable<string>>`, and `realGeminiDeps: GeminiClientDeps` (the real, non-mocked deps). Used by Task 7.

- [ ] **Step 1: Write the failing tests**

`src/lib/ai/geminiClient.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateNarration, isRateLimitError } from './geminiClient';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

describe('isRateLimitError', () => {
  it('recognizes a 429 status error', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it('does not flag other errors as rate limits', () => {
    expect(isRateLimitError({ status: 500 })).toBe(false);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});

describe('generateNarration', () => {
  it('returns the primary model stream on success', async () => {
    const streamText = vi.fn().mockResolvedValue({ textStream: fakeStream(['Hello']) });
    const stream = await generateNarration('a prompt', {
      streamText,
      primaryModel: 'primary',
      fallbackModel: 'fallback',
    });

    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual(['Hello']);
    expect(streamText).toHaveBeenCalledWith({ model: 'primary', prompt: 'a prompt' });
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('retries against the fallback model when the primary is rate limited', async () => {
    const streamText = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ textStream: fakeStream(['Fallback narration']) });

    const stream = await generateNarration('a prompt', {
      streamText,
      primaryModel: 'primary',
      fallbackModel: 'fallback',
    });

    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual(['Fallback narration']);
    expect(streamText).toHaveBeenNthCalledWith(1, { model: 'primary', prompt: 'a prompt' });
    expect(streamText).toHaveBeenNthCalledWith(2, { model: 'fallback', prompt: 'a prompt' });
  });

  it('propagates non-rate-limit errors without retrying', async () => {
    const streamText = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      generateNarration('a prompt', {
        streamText,
        primaryModel: 'primary',
        fallbackModel: 'fallback',
      })
    ).rejects.toThrow('network down');
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/ai/geminiClient.test.ts`
Expected: FAIL — `geminiClient.ts` doesn't exist yet.

- [ ] **Step 3: Implement `geminiClient.ts`**

`src/lib/ai/geminiClient.ts`:

```ts
export interface TextStreamer {
  (params: { model: string; prompt: string }): Promise<{
    textStream: AsyncIterable<string>;
  }>;
}

export interface GeminiClientDeps {
  streamText: TextStreamer;
  primaryModel: string;
  fallbackModel: string;
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
  return status === 429;
}

export async function generateNarration(
  prompt: string,
  deps: GeminiClientDeps
): Promise<AsyncIterable<string>> {
  try {
    const result = await deps.streamText({ model: deps.primaryModel, prompt });
    return result.textStream;
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    const fallbackResult = await deps.streamText({ model: deps.fallbackModel, prompt });
    return fallbackResult.textStream;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/ai/geminiClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the real adapter (no new test — thin glue over the `ai` SDK)**

`src/lib/ai/vercelAiSdkAdapter.ts`:

```ts
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GeminiClientDeps } from './geminiClient';

export const GEMINI_MODELS = {
  primary: 'gemini-2.0-flash',
  fallback: 'gemini-2.0-flash-lite',
};

export const realGeminiDeps: GeminiClientDeps = {
  primaryModel: GEMINI_MODELS.primary,
  fallbackModel: GEMINI_MODELS.fallback,
  streamText: async ({ model, prompt }) => {
    const result = await streamText({ model: google(model), prompt });
    return { textStream: result.textStream };
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai
git commit -m "feat: add Gemini client wrapper with 429 fallback"
```

---

## Task 7: Round Processing Orchestration

**Files:**
- Create: `src/lib/round/roundRepository.ts`
- Create: `src/lib/round/processRound.ts`
- Test: `src/lib/round/processRound.test.ts`
- Create: `src/app/api/round/process/route.ts`

**Interfaces:**
- Consumes: `claimRound` (Task 4), `assemblePrompt`/`shouldRotateSummary`/`StoredMessage`/`RoundAction` (Task 5), `generateNarration`/`realGeminiDeps` (Task 6), `createServiceRoleClient` (Task 3).
- Produces: `RoundRepository` interface and `createSupabaseRoundRepository(supabase)`, and `processRound(deps: ProcessRoundDeps, roundId: string): Promise<ProcessRoundResult>` where `ProcessRoundResult` is `{ processed: boolean; messageId?: string; nextRoundId?: string }`. The `POST /api/round/process` route (body: `{ roundId: string }`) is what Task 10's frontend calls.

- [ ] **Step 1: Write the repository interface and its Supabase implementation**

`src/lib/round/roundRepository.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredMessage, RoundAction } from './assemblePrompt';

export interface RoundContext {
  campaignId: string;
  campaignSummary: string;
  recentMessages: StoredMessage[];
  actions: RoundAction[];
}

export interface RoundRepository {
  getRoundContext(roundId: string): Promise<RoundContext>;
  insertDmMessagePlaceholder(campaignId: string, roundId: string): Promise<string>;
  appendToMessage(messageId: string, textChunk: string): Promise<void>;
  updateCampaignSummary(
    campaignId: string,
    summary: string,
    coversUpToRoundId: string
  ): Promise<void>;
  closeRoundAndOpenNext(campaignId: string, roundId: string): Promise<string>;
}

export function createSupabaseRoundRepository(supabase: SupabaseClient): RoundRepository {
  return {
    async getRoundContext(roundId) {
      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('campaign_id')
        .eq('id', roundId)
        .single();
      if (roundError) throw roundError;

      const campaignId = round.campaign_id as string;

      const { data: actionsRows, error: actionsError } = await supabase
        .from('round_actions')
        .select('action_text, players(display_name)')
        .eq('round_id', roundId);
      if (actionsError) throw actionsError;

      const { data: summaryRow } = await supabase
        .from('campaign_summary')
        .select('summary')
        .eq('campaign_id', campaignId)
        .maybeSingle();

      const { data: messageRows, error: messagesError } = await supabase
        .from('messages')
        .select('role, content')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (messagesError) throw messagesError;

      return {
        campaignId,
        campaignSummary: summaryRow?.summary ?? '',
        recentMessages: (messageRows ?? []).reverse() as StoredMessage[],
        actions: (actionsRows ?? []).map((row: any) => ({
          playerDisplayName: row.players?.display_name ?? 'Unknown',
          actionText: row.action_text,
        })),
      };
    },

    async insertDmMessagePlaceholder(campaignId, roundId) {
      const { data, error } = await supabase
        .from('messages')
        .insert({ campaign_id: campaignId, round_id: roundId, role: 'dm', content: '' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async appendToMessage(messageId, textChunk) {
      const { data, error } = await supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .single();
      if (error) throw error;
      const { error: updateError } = await supabase
        .from('messages')
        .update({ content: (data.content as string) + textChunk })
        .eq('id', messageId);
      if (updateError) throw updateError;
    },

    async updateCampaignSummary(campaignId, summary, coversUpToRoundId) {
      const { error } = await supabase.from('campaign_summary').upsert({
        campaign_id: campaignId,
        summary,
        covers_up_to_round: coversUpToRoundId,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },

    async closeRoundAndOpenNext(campaignId, roundId) {
      const { error: closeError } = await supabase
        .from('rounds')
        .update({ status: 'closed' })
        .eq('id', roundId);
      if (closeError) throw closeError;

      const { data: nextRound, error: nextRoundError } = await supabase
        .from('rounds')
        .insert({ campaign_id: campaignId, status: 'pending' })
        .select('id')
        .single();
      if (nextRoundError) throw nextRoundError;

      const { error: campaignError } = await supabase
        .from('campaigns')
        .update({ current_round_id: nextRound.id })
        .eq('id', campaignId);
      if (campaignError) throw campaignError;

      return nextRound.id as string;
    },
  };
}
```

- [ ] **Step 2: Write the failing tests for `processRound`**

`src/lib/round/processRound.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { processRound, ProcessRoundDeps } from './processRound';
import type { RoundRepository } from './roundRepository';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

function createFakeRepository(overrides: Partial<RoundRepository> = {}): RoundRepository {
  return {
    getRoundContext: vi.fn().mockResolvedValue({
      campaignId: 'camp-1',
      campaignSummary: '',
      recentMessages: [],
      actions: [{ playerDisplayName: 'Prem', actionText: 'Look around' }],
    }),
    insertDmMessagePlaceholder: vi.fn().mockResolvedValue('msg-1'),
    appendToMessage: vi.fn().mockResolvedValue(undefined),
    updateCampaignSummary: vi.fn().mockResolvedValue(undefined),
    closeRoundAndOpenNext: vi.fn().mockResolvedValue('round-2'),
    ...overrides,
  };
}

describe('processRound', () => {
  it('does nothing if the round was already claimed by another request', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(false),
      repository,
      generateNarration: vi.fn(),
    };

    const result = await processRound(deps, 'round-1');

    expect(result).toEqual({ processed: false });
    expect(repository.getRoundContext).not.toHaveBeenCalled();
    expect(deps.generateNarration).not.toHaveBeenCalled();
  });

  it('assembles the prompt, streams the narration into a message, and opens the next round', async () => {
    const repository = createFakeRepository();
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['You see ', 'a torch.']));
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration,
    };

    const result = await processRound(deps, 'round-1');

    expect(result).toEqual({ processed: true, messageId: 'msg-1', nextRoundId: 'round-2' });
    expect(repository.insertDmMessagePlaceholder).toHaveBeenCalledWith('camp-1', 'round-1');
    expect(repository.appendToMessage).toHaveBeenNthCalledWith(1, 'msg-1', 'You see ');
    expect(repository.appendToMessage).toHaveBeenNthCalledWith(2, 'msg-1', 'a torch.');
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalledWith('camp-1', 'round-1');
    expect(repository.updateCampaignSummary).not.toHaveBeenCalled();
  });

  it('rotates the campaign summary when recent history has grown past the threshold', async () => {
    const longMessage = { role: 'dm' as const, content: 'x'.repeat(9000) };
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: 'Old summary.',
        recentMessages: [longMessage],
        actions: [{ playerDisplayName: 'Prem', actionText: 'Continue' }],
      }),
    });
    const generateNarration = vi
      .fn()
      .mockResolvedValueOnce(fakeStream(['Narration.']))
      .mockResolvedValueOnce(fakeStream(['New summary.']));
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration,
    };

    await processRound(deps, 'round-1');

    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(repository.updateCampaignSummary).toHaveBeenCalledWith(
      'camp-1',
      'New summary.',
      'round-1'
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/lib/round/processRound.test.ts`
Expected: FAIL — `processRound.ts` doesn't exist yet.

- [ ] **Step 4: Implement `processRound`**

`src/lib/round/processRound.ts`:

```ts
import { assemblePrompt, shouldRotateSummary } from './assemblePrompt';
import type { RoundRepository } from './roundRepository';

export interface ProcessRoundDeps {
  claimRound: (roundId: string) => Promise<boolean>;
  repository: RoundRepository;
  generateNarration: (prompt: string) => Promise<AsyncIterable<string>>;
}

export interface ProcessRoundResult {
  processed: boolean;
  messageId?: string;
  nextRoundId?: string;
}

export async function processRound(
  deps: ProcessRoundDeps,
  roundId: string
): Promise<ProcessRoundResult> {
  const claimed = await deps.claimRound(roundId);
  if (!claimed) {
    return { processed: false };
  }

  const context = await deps.repository.getRoundContext(roundId);
  const prompt = assemblePrompt(context.campaignSummary, context.recentMessages, context.actions);

  const messageId = await deps.repository.insertDmMessagePlaceholder(context.campaignId, roundId);

  const stream = await deps.generateNarration(prompt);
  for await (const chunk of stream) {
    await deps.repository.appendToMessage(messageId, chunk);
  }

  if (shouldRotateSummary(context.recentMessages)) {
    const summaryPrompt = `Summarize the campaign so far in under 500 words:\n\n${prompt}`;
    const summaryStream = await deps.generateNarration(summaryPrompt);
    let summaryText = '';
    for await (const chunk of summaryStream) summaryText += chunk;
    await deps.repository.updateCampaignSummary(context.campaignId, summaryText, roundId);
  }

  const nextRoundId = await deps.repository.closeRoundAndOpenNext(context.campaignId, roundId);

  return { processed: true, messageId, nextRoundId };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/lib/round/processRound.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire the API route (no new test — thin glue over already-tested logic)**

`src/app/api/round/process/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { claimRound } from '@/lib/round/claimRound';
import { createSupabaseRoundRepository } from '@/lib/round/roundRepository';
import { processRound } from '@/lib/round/processRound';
import { generateNarration } from '@/lib/ai/geminiClient';
import { realGeminiDeps } from '@/lib/ai/vercelAiSdkAdapter';

export async function POST(request: NextRequest) {
  const { roundId } = await request.json();
  if (!roundId) {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const result = await processRound(
    {
      claimRound: (id) => claimRound(supabase, id),
      repository: createSupabaseRoundRepository(supabase),
      generateNarration: (prompt) => generateNarration(prompt, realGeminiDeps),
    },
    roundId
  );

  return NextResponse.json(result, { status: result.processed ? 200 : 409 });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/round/roundRepository.ts src/lib/round/processRound.ts src/lib/round/processRound.test.ts src/app/api/round
git commit -m "feat: add round-processing orchestration and API route"
```

---

## Task 8: Session View — Live Message List

**Files:**
- Create: `src/components/MessageList.tsx`
- Test: `src/components/MessageList.test.tsx`
- Create: `src/lib/supabase/messagesRealtime.ts`

**Interfaces:**
- Consumes: `supabaseBrowserClient` (Task 3).
- Produces: `Message` (`{ id: string; role: 'dm' | 'player' | 'system'; content: string }`), `<MessageList campaignId fetchInitialMessages subscribeToNewMessages />`, and the real `fetchInitialMessages`/`subscribeToNewMessages` adapters. Used by Task 10.

- [ ] **Step 1: Write the failing tests**

`src/components/MessageList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MessageList } from './MessageList';

describe('MessageList', () => {
  it('renders the initial messages and appends live updates from the subscription', async () => {
    const fetchInitialMessages = vi
      .fn()
      .mockResolvedValue([{ id: 'm1', role: 'dm', content: 'You stand at the cave entrance.' }]);

    let deliverMessage: (message: any) => void = () => {};
    const subscribeToNewMessages = vi.fn((_campaignId, onMessage) => {
      deliverMessage = onMessage;
      return () => {};
    });

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() =>
      expect(screen.getByText('You stand at the cave entrance.')).toBeInTheDocument()
    );

    deliverMessage({ id: 'm2', role: 'player', content: 'I light a torch.' });

    await waitFor(() => expect(screen.getByText('I light a torch.')).toBeInTheDocument());
  });

  it('updates a message in place instead of duplicating it when the same id streams again', async () => {
    const fetchInitialMessages = vi.fn().mockResolvedValue([]);
    let deliverMessage: (message: any) => void = () => {};
    const subscribeToNewMessages = vi.fn((_campaignId, onMessage) => {
      deliverMessage = onMessage;
      return () => {};
    });

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    deliverMessage({ id: 'm1', role: 'dm', content: 'You see' });
    await waitFor(() => expect(screen.getByText('You see')).toBeInTheDocument());

    deliverMessage({ id: 'm1', role: 'dm', content: 'You see a torch.' });
    await waitFor(() => expect(screen.getByText('You see a torch.')).toBeInTheDocument());
    expect(screen.queryByText('You see')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/MessageList.test.tsx`
Expected: FAIL — `MessageList.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `MessageList`**

`src/components/MessageList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export interface Message {
  id: string;
  role: 'dm' | 'player' | 'system';
  content: string;
}

export interface MessageListProps {
  campaignId: string;
  fetchInitialMessages: (campaignId: string) => Promise<Message[]>;
  subscribeToNewMessages: (
    campaignId: string,
    onMessage: (message: Message) => void
  ) => () => void;
}

export function MessageList({
  campaignId,
  fetchInitialMessages,
  subscribeToNewMessages,
}: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchInitialMessages(campaignId).then((initial) => {
      if (!cancelled) setMessages(initial);
    });

    const unsubscribe = subscribeToNewMessages(campaignId, (message) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === message.id);
        if (existingIndex === -1) return [...prev, message];
        const next = [...prev];
        next[existingIndex] = message;
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [campaignId, fetchInitialMessages, subscribeToNewMessages]);

  return (
    <ul aria-label="session log">
      {messages.map((message) => (
        <li key={message.id} data-role={message.role}>
          {message.content}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/MessageList.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the real Supabase adapter (no new test — thin glue)**

`src/lib/supabase/messagesRealtime.ts`:

```ts
import { supabaseBrowserClient } from './client';
import type { Message } from '@/components/MessageList';

export async function fetchInitialMessages(campaignId: string): Promise<Message[]> {
  const { data, error } = await supabaseBrowserClient
    .from('messages')
    .select('id, role, content')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data as Message[];
}

export function subscribeToNewMessages(
  campaignId: string,
  onMessage: (message: Message) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`messages:${campaignId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `campaign_id=eq.${campaignId}`,
      },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/MessageList.tsx src/components/MessageList.test.tsx src/lib/supabase/messagesRealtime.ts
git commit -m "feat: add live-updating session message list"
```

---

## Task 9: Action Input UI

**Files:**
- Create: `src/components/ActionInput.tsx`
- Test: `src/components/ActionInput.test.tsx`
- Create: `src/lib/supabase/submitAction.ts`

**Interfaces:**
- Consumes: `supabaseBrowserClient` (Task 3).
- Produces: `<ActionInput onSubmit={(actionText: string) => Promise<void>} />` and `submitAction(roundId, playerId, actionText): Promise<void>`. Used by Task 10.

- [ ] **Step 1: Write the failing tests**

`src/components/ActionInput.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionInput } from './ActionInput';

describe('ActionInput', () => {
  it('submits a quick action and then disables further input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Attack' }));

    expect(onSubmit).toHaveBeenCalledWith('Attack');
    await waitFor(() =>
      expect(screen.getByText(/waiting for the rest of the table/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('submits free text typed by the player', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('free text action'), 'I search the chest');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('I search the chest');
  });

  it('ignores a submit of empty free text', async () => {
    const onSubmit = vi.fn();
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/ActionInput.test.tsx`
Expected: FAIL — `ActionInput.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `ActionInput`**

`src/components/ActionInput.tsx`:

```tsx
'use client';

import { useState } from 'react';

const QUICK_ACTIONS = ['Attack', 'Move', 'Talk', 'Look around'];

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
}

export function ActionInput({ onSubmit }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(actionText: string) {
    if (!actionText.trim() || submitted) return;
    await onSubmit(actionText.trim());
    setSubmitted(true);
  }

  return (
    <div>
      <div role="group" aria-label="quick actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={submitted}
            onClick={() => handleSubmit(action)}
          >
            {action}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(freeText);
        }}
      >
        <input
          aria-label="free text action"
          value={freeText}
          disabled={submitted}
          onChange={(e) => setFreeText(e.target.value)}
        />
        <button type="submit" disabled={submitted}>
          Send
        </button>
      </form>
      {submitted && <p>Action submitted — waiting for the rest of the table.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/ActionInput.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the real Supabase adapter (no new test — thin glue)**

`src/lib/supabase/submitAction.ts`:

```ts
import { supabaseBrowserClient } from './client';

export async function submitAction(
  roundId: string,
  playerId: string,
  actionText: string
): Promise<void> {
  const { error } = await supabaseBrowserClient
    .from('round_actions')
    .insert({ round_id: roundId, player_id: playerId, action_text: actionText });
  if (error) throw error;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ActionInput.tsx src/components/ActionInput.test.tsx src/lib/supabase/submitAction.ts
git commit -m "feat: add quick-action and free-text action input"
```

---

## Task 10: Join Page & Campaign Session Page — End-to-End Wiring

**Files:**
- Create: `src/lib/supabase/roundActionsRealtime.ts`
- Create: `src/app/join/[campaignId]/page.tsx`
- Create: `src/app/campaign/[id]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3, 8, 9: `supabaseBrowserClient`, the join API route, `MessageList`, `fetchInitialMessages`/`subscribeToNewMessages`, `ActionInput`, `submitAction`.
- Produces: the two pages a player actually uses. No new automated tests — this task composes already-tested pieces plus Supabase glue; its deliverable is verified by the manual playtest below, matching the spec's testing approach.

- [ ] **Step 1: Write the round-action-count realtime helper**

`src/lib/supabase/roundActionsRealtime.ts`:

```ts
import { supabaseBrowserClient } from './client';

export function subscribeToRoundActionCount(
  roundId: string,
  onCountChange: (count: number) => void
): () => void {
  async function refreshCount() {
    const { count } = await supabaseBrowserClient
      .from('round_actions')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', roundId);
    onCountChange(count ?? 0);
  }

  const channel = supabaseBrowserClient
    .channel(`round_actions:${roundId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'round_actions',
        filter: `round_id=eq.${roundId}`,
      },
      refreshCount
    )
    .subscribe();

  refreshCount();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function getActivePlayerCount(campaignId: string): Promise<number> {
  const { count } = await supabaseBrowserClient
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  return count ?? 0;
}
```

- [ ] **Step 2: Write the join page**

`src/app/join/[campaignId]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export default function JoinPage({ params }: { params: { campaignId: string } }) {
  const [displayName, setDisplayName] = useState('');
  const router = useRouter();

  async function handleJoin() {
    const { data, error } = await supabaseBrowserClient.auth.signInAnonymously();
    if (error || !data.user) return;

    const response = await fetch(`/api/campaigns/${params.campaignId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.user.id, displayName }),
    });
    const player = await response.json();

    router.push(`/campaign/${params.campaignId}?playerId=${player.id}`);
  }

  return (
    <main>
      <input
        aria-label="display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button onClick={handleJoin}>Join campaign</button>
    </main>
  );
}
```

- [ ] **Step 3: Write the campaign session page**

`src/app/campaign/[id]/page.tsx`:

```tsx
'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { fetchInitialMessages, subscribeToNewMessages } from '@/lib/supabase/messagesRealtime';
import { submitAction } from '@/lib/supabase/submitAction';
import {
  subscribeToRoundActionCount,
  getActivePlayerCount,
} from '@/lib/supabase/roundActionsRealtime';
import { supabaseBrowserClient } from '@/lib/supabase/client';

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);

  const triggerProcessing = useCallback((currentRoundId: string) => {
    fetch('/api/round/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: currentRoundId }),
    });
  }, []);

  useEffect(() => {
    supabaseBrowserClient
      .from('campaigns')
      .select('current_round_id')
      .eq('id', campaignId)
      .single()
      .then(({ data }) => setRoundId(data?.current_round_id ?? null));
  }, [campaignId]);

  useEffect(() => {
    if (!roundId) return;
    let playerCount = 0;
    getActivePlayerCount(campaignId).then((count) => {
      playerCount = count;
    });
    const unsubscribe = subscribeToRoundActionCount(roundId, (actionCount) => {
      if (playerCount > 0 && actionCount >= playerCount) {
        triggerProcessing(roundId);
      }
    });
    return unsubscribe;
  }, [roundId, campaignId, triggerProcessing]);

  return (
    <main>
      <MessageList
        campaignId={campaignId}
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
      {roundId && (
        <ActionInput onSubmit={(actionText) => submitAction(roundId, playerId, actionText)} />
      )}
      {roundId && (
        <button onClick={() => triggerProcessing(roundId)}>
          Process round now (if someone is stuck)
        </button>
      )}
    </main>
  );
}

export default function CampaignPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CampaignPageContent campaignId={params.id} />
    </Suspense>
  );
}
```

**Known simplification:** the spec calls for a round timeout so the AI proceeds with partial actions if a player goes silent. This plan implements auto-triggering when everyone *has* acted, plus a manual "process anyway" button as the escape hatch for a stuck player, but not a real timer. Automatic timeout is listed as an open question in the spec — add it as a fast-follow after the playtest if it turns out to matter in practice.

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/roundActionsRealtime.ts src/app/join src/app/campaign
git commit -m "feat: wire join and campaign session pages end-to-end"
```

- [ ] **Step 6: Manual playtest**

This is the verification the spec calls for — it can't be automated:

1. Deploy to Vercel (or run `npm run dev` locally) with `.env.local` filled in from Task 2.
2. Call `POST /api/campaigns` with `{ "name": "Test Campaign", "userId": "<any-uuid>", "displayName": "GM" }` (or build a tiny form later) to create a campaign; note the returned `campaign.id`.
3. Open `/join/<campaign.id>` in one browser tab per player, each entering a different display name.
4. In each tab, submit an action for the open round (quick action or free text) and confirm every tab's session log updates with the same DM narration at the same time once the last player submits.
5. Deliberately trigger a Gemini 429 (e.g. by sending several rounds in quick succession) and confirm the round still completes via the fallback model instead of erroring out.
6. Play one full session (~2–3 hours) with the actual target group, per the spec's testing approach, and note whether Gemini Flash's Thai narration quality and the free-tier rate limit hold up at this scale — both flagged as unverified-until-tried in the shared research doc.

---

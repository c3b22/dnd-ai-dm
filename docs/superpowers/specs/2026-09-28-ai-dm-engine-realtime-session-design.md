# Sub-project 1: AI DM Engine + Real-time Text Session — Design

## Context

This is the first of three planned sub-projects for a D&D platform where an AI
acts as Dungeon Master for a small group of friends:

1. **AI DM Engine + Real-time Text Session** (this spec)
2. Map/Token Layer (later spec)
3. Sound/Visual Effects Layer (later spec)

Full background, market research, and cost analysis live in the project's
shared doc: https://claude.ai/artifact/3H1VP1nVft5P9rpQt7Uddt

## Goals

- One AI Dungeon Master narrates a campaign, plays NPCs, and adjudicates
  outcomes narrative-first (light-touch rules, not a full 5e rules engine).
- All players in a campaign see the narration and action log update live,
  at the same time, in a browser.
- Players submit actions via quick-action buttons (Attack, Move, Talk, ...)
  or free text for anything not covered by a button.
- All players act simultaneously each round; the AI DM responds once per
  round to everyone's combined actions (not once per player), to keep
  within the free-tier LLM rate limit.
- Campaigns persist and can be resumed across days/weeks.

## Non-goals (deferred to later sub-projects or out of scope for v1)

- Map rendering, token movement, fog of war (sub-project 2).
- Ambient sound, sound effects, voice narration (sub-project 3).
- Strict 5e rules enforcement (dice math is done in code for randomness,
  but the AI decides narrative outcomes, not a combat simulator).
- Turn-based initiative order (everyone acts within the same round instead).

## Scale target

Designed for **1 table of 4–6 players, 2–3 sessions/week**. All sizing,
free-tier assumptions, and cost estimates elsewhere in this doc are for that
scale, not for many concurrent tables.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (React) |
| Hosting | Vercel (Hobby tier) |
| Realtime + DB + Auth + Storage | Supabase (Free tier) |
| AI DM model | Google Gemini API (Flash), via Vercel AI SDK, streaming |
| Fallback model | Gemini Flash-Lite (on 429 rate-limit responses) |

The AI SDK abstraction means the model provider is swappable later (e.g. to
Claude) without rearchitecting the round-processing flow.

## Data model

| Table | Purpose |
| --- | --- |
| `campaigns` | One row per campaign: name, created_at, current round pointer |
| `players` | Player identity + which campaign(s) they belong to |
| `rounds` | One row per round: campaign_id, status (`pending` \| `processing` \| `closed`), opened_at, processing_started_at (set when claimed, used to allow re-claim after a stalled attempt) |
| `round_actions` | One row per player action submitted this round: round_id, player_id, action_text, submitted_at |
| `messages` | The narration log: round_id, role (`dm` \| `player` \| `system`), content, created_at — this is what renders as the shared session view |
| `game_state` | Free-form JSON snapshot the AI DM can update between rounds (party status, flags, location) — no map/token structure yet, that arrives in sub-project 2 |
| `campaign_summary` | Rolling text summary of the campaign so far, regenerated periodically to bound context size |

## Round processing flow

1. Each player submits their action for the open round by inserting a row
   into `round_actions` (via the Supabase client directly; Row Level
   Security restricts a player to inserting only their own row for a round
   they belong to).
2. Every connected client subscribes to `round_actions` and `messages` for
   the campaign via Supabase Realtime, so everyone sees who has acted.
3. When a client observes that the number of `round_actions` rows for the
   open round equals the number of active players (or a round timeout
   elapses), it calls `POST /api/round/process` with the round id. Any
   client may trigger this call — there is no single "host" client.
4. The API route attempts an atomic claim:
   `UPDATE rounds SET status = 'processing' WHERE id = $1 AND status = 'pending'`.
   Only the request that receives an affected-row count of 1 proceeds; all
   other concurrent callers no-op and return immediately. This is what
   prevents duplicate Gemini calls when multiple clients notice completion
   at the same time.
5. The winning request assembles the prompt: `campaign_summary` + the last
   N `messages` + this round's `round_actions`, calls Gemini via the Vercel
   AI SDK with streaming enabled.
6. Streamed tokens are appended to a new `messages` row (role `dm`) as they
   arrive; Supabase Realtime's row-level change stream pushes the growing
   text to every client, so the narration appears to "type out" live for
   everyone at once.
7. On completion, the API route sets `rounds.status = 'closed'`, opens the
   next round (`INSERT INTO rounds ... status = 'pending'`), and updates
   `game_state` if the AI's response included structured state changes.
8. Every ~10 rounds (or when the assembled prompt would exceed a size
   threshold), the API route makes one extra Gemini call to regenerate
   `campaign_summary` from the recent history, then the older `messages`
   rows are no longer included in future prompts (they stay in the DB for
   display/history, just not resent to the model).

## Error handling

| Case | Behavior |
| --- | --- |
| Gemini returns 429 (rate limited) | Retry once against Gemini Flash-Lite before surfacing an error to players |
| A player doesn't submit an action before the round timeout | Round is processed with whichever actions arrived; the DM narrates that player's character as idle/absent for that round |
| Two clients both claim the round at the same instant | The atomic `UPDATE ... WHERE status = 'pending'` guarantees only one succeeds; guaranteed by Postgres row-level locking, not application logic |
| Gemini call fails entirely (network, 5xx) | Round stays `processing`; a client retry button re-attempts the claim (now `status = 'processing'` won't match `WHERE status = 'pending'`, so add a `processing_started_at` timestamp and allow re-claim if it's older than e.g. 30s) |
| Streaming connection drops mid-response | Partial `messages` row remains with what was streamed so far; on reconnect the client just sees the row as currently written — no data loss beyond the cut-off text |

## Testing approach

- **Unit tests** on the round-claiming logic and prompt-assembly (context
  window construction, summary rotation) — this is the stateful logic most
  likely to have subtle bugs and least visible when testing by eye.
- **Manual playtest**: one full session (~2-3 hours) with the target group
  before building sub-project 2, specifically to validate Gemini Flash's
  Thai narration quality and whether the free-tier rate limit holds up at
  the target scale — both flagged as unverified-until-tried in the shared
  research doc.

## Open questions

- Exact round timeout duration (how long to wait for all players before
  processing with partial actions) — needs a number, propose 90 seconds as
  a starting point to tune after the playtest.
- Whether `game_state` needs any structure yet or can stay schemaless JSON
  until sub-project 2 defines what the map layer needs from it.

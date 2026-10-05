# Leveling (XP, levels, HP and damage growth) — design

## Goal

Let characters grow over a campaign so players feel progress, without breaking the existing rule that **the server owns every number**. The AI announces *that* the party earned progress via tags; the server decides how much XP that is, when a level is reached, and what a level gives.

This is sub-project 1 of 2. Sub-project 2 (classes and special abilities, built on top of levels) gets its own spec.

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Purpose | Both progression and differentiation; progression first, differentiation (classes) as a separate later spec |
| How to level | Mixed: tiered XP from small events plus a separate large `milestone` award |
| Campaign length | Not known; assume medium (~50–80 rounds), max level 10, a level roughly every 6–10 rounds. All numbers are constants, tunable in one place |
| What a level gives | +5 max HP and a weapon damage bonus |
| HP on level-up | Current HP rises by the same amount max HP rose (not a full heal) |
| XP recipients | The whole party at once; downed players get none |
| Storage | Store only `xp`; derive level every time |

## Out of scope

Classes, special abilities, ability scores, choices on level-up, per-player XP awards, level-up animation, enemy HP, XP from kills.

## Numbers (`src/lib/character/constants.ts`)

Max level **10**. Cumulative XP needed:

| Level | XP | max HP bonus | Damage bonus |
|---|---|---|---|
| 1 | 0 | +0 | +0 |
| 2 | 60 | +5 | +0 |
| 3 | 150 | +10 | +1 |
| 4 | 270 | +15 | +1 |
| 5 | 420 | +20 | +2 |
| 6 | 600 | +25 | +2 |
| 7 | 810 | +30 | +3 |
| 8 | 1050 | +35 | +3 |
| 9 | 1320 | +40 | +4 |
| 10 | 1620 | +45 | +4 |

XP per tag: `small` 10, `medium` 25, `large` 50, `milestone` 100. At an average of ~25 XP per round the party reaches level 5 around round 17 and level 10 around round 65.

The damage bonus is added to every weapon hit a player makes (server-side, where player damage is already rolled). It does not apply to healing.

## Data

Migration `0013_xp.sql`:

- `players`: `xp int not null default 0 check (xp >= 0)`.
- Existing players get `xp = 0` (level 1, no bonus). Their `max_hp` stays valid because it is already the base value.
- No RLS change: only the server writes `xp`, like `gold`. `players` is already in the Realtime publication, so level-ups reach every client live.

## Max HP model

The `players.max_hp` column now means **base max HP** (excludes level bonus): starts at 20, drops with revives and wipes, returns to `BASE_MAX_HP` at a sanctuary, never below `MIN_MAX_HP` (10). Revive, wipe and sanctuary rules are unchanged.

**Effective max HP = `max_hp` + `levelHpBonus(level)`**, computed in one place when a character is loaded (`roundRepository.ts` on the server, `players.ts` on the client, both via the same helper). Everything that already reads `maxHp` (prompt, healing, UI) sees the effective value.

On save, the level bonus is subtracted before writing `max_hp` back, so a revive penalty never eats the level bonus and the bonus is never double-counted.

`applyCharacterTags` works on the effective value, so its formulas change:

- sanctuary sets `maxHp = BASE_MAX_HP + levelHpBonus`;
- revive and wipe penalties may lower `maxHp` no further than `MIN_MAX_HP + levelHpBonus`.

## Tags (`src/lib/character/tags.ts`)

- `[[xp: small]]`, `[[xp: medium]]`, `[[xp: large]]` — 10 / 25 / 50 XP to every active player.
- `[[milestone]]` — 100 XP to every active player, for closing a major event.
- Malformed tags (e.g. `[[xp: huge]]`) are hidden from players and never applied, via the existing `LEFTOVER_TAG` handling.

## Round processing

Order within a round, after the existing hurt/heal/revive, inventory and economy steps:

1. Grant XP to every player who is `active` in the round's final state (a player revived this round counts).
2. A player who crosses a threshold gains **one** level; `hp` rises by the max-HP bonus gained.
3. Append lines to the game log (e.g. "ทุกคนได้ +25 XP", "<name> ขึ้นเลเวล 3 (max HP +5, ดาเมจ +1)").

Server limits:

- At most **one `xp` tag and one `milestone` tag count per round**; extras are dropped.
- **At most one level per player per round**: because level is derived from `xp`, a gain that would cross two thresholds is capped at one XP point below the threshold after next (XP beyond that cap is discarded). The player reaches the following level the next time they earn any XP.
- XP keeps accumulating at level 10 but has no further effect.
- Downed players receive no XP that round.

Retry safety: the existing `tagsApplied` guard (`processRound.ts`) already stops a stale retry from re-applying a round's tags, so XP is never added twice. `xp` is saved in the same atomic write as HP and status.

## AI prompt (`prompt.ts`)

- Describe the new tags and when to use them: award XP when the party overcomes an obstacle, solves a problem or genuinely advances the story, not every round; `milestone` only for a major event.
- Show each player's level in the Party status list so the narration can acknowledge growth.
- The AI is not given XP numbers or thresholds and must not state any.

## Code layout

- New `src/lib/character/leveling.ts`: pure functions `levelForXp`, `levelHpBonus`, `levelDamageBonus`, `xpToNextLevel`, `effectiveMaxHp`.
- Constants (XP table, tag values, max level, per-level bonuses) next to the HP constants in `constants.ts`.
- `Character` gains `xp` and `level`.
- `applyTags.ts`: handle the new tags and the base/bonus split above.

## UI

- [HpBar.tsx](../../../src/components/HpBar.tsx): a "Lv N" badge and a thin XP bar under the HP bar (current XP toward the next threshold; "MAX" at level 10).
- [PlayerOrder.tsx](../../../src/components/PlayerOrder.tsx): the level badge next to each name.
- Level-ups are announced through the game log only; no animation in this round of work.

## Testing

Unit tests next to each file, in the existing style:

- `leveling.test.ts`: XP boundaries, level cap, HP and damage bonus per level.
- `tags.test.ts`: valid and invalid new tags, per-round quota.
- `applyTags.test.ts`: XP only to active players; one level per round with surplus kept; `hp` rises by the bonus; **sanctuary, revive and wipe correct with a level bonus** (the main risk); retry does not add XP twice.
- `processRound.test.ts`, `roundRepository.test.ts`: `xp` saved atomically with HP; effective/base max HP round-trip.
- `HpBar.test.tsx`, `PlayerOrder.test.tsx`: level badge and XP bar.

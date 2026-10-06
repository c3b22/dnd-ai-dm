# Classes and active abilities — design

## Goal

Make each party member play a different role. A player picks one of four classes when creating a character; each class has one **active ability** the player triggers with a button. The server resolves every number; the AI only narrates the result.

This is sub-project 2 of 2, built on the leveling system (`docs/superpowers/specs/2026-10-05-leveling-design.md`, merged): levels 1–10 already exist and the ability scales with them.

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Kind of differentiation | Active abilities with a button (not passives only) |
| Number of classes | 4: warrior, archer, cleric, rogue |
| Abilities per class | 1, stronger from level 5 |
| Reuse limit | Cooldown counted in **eventful rounds**, so idling or spamming "wait" cannot refresh it |
| Using an ability | It is the player's one action for the round (like drinking a potion); no free text alongside |
| Class choice | At character creation, replacing the starting-weapon picker; the class sets the starting weapon |
| Existing players | Stay classless: no button, nothing else changes |

## Out of scope

Second ability per class, passives, changing class after creation, letting existing classless players pick a class, a fifth class, abilities that target enemies (enemies have no HP).

## Classes and abilities

All numbers live in constants under `src/lib/character/` (`classes.ts`, `abilities.ts`).

| Class (id) | Starting weapon | Ability | Levels 1–4 | Level 5+ | Target | Cooldown |
|---|---|---|---|---|---|---|
| นักรบ (`warrior`) | shortsword 1d8 | **ยืนบัง** | Damage from this round's `hurt` tags on the chosen ally is taken by the warrior instead, halved (rounded up) | one third (rounded up) | one ally (not self) | 3 |
| นักธนู (`archer`) | shortbow 1d6 | **ยิงแม่นยำ** | Weapon dice rolled twice and summed | three times | none | 3 |
| นักบวช (`cleric`) | staff 1d4 | **อวยพรรักษา** | Heal 1d6+1 (the existing `medium` tier) | 2d6 (`heavy`) | one ally or self, must be active | 3 |
| โจร (`rogue`) | dagger 1d4 (new weapon) | **ลอบโจมตี** | Weapon damage + 2d6 | + 3d6 | none | 4 |

Rules for every ability:

- Usable only if the player is `active`, has a class, and `ability_cooldown` is 0. It is the player's action for the round.
- Targets must belong to the same campaign and be `active`. Guard cannot target oneself, and an ally already guarded this round by another warrior cannot be guarded again (the second attempt fails and keeps its cooldown).
- The cleric's heal never revives a downed player: reviving still needs `[[revive]]` and its max-HP cost.
- Healing never exceeds max HP, and the cleric cannot target someone at full HP (the attempt fails and keeps its cooldown). The target list offers only hurt players.
- The ability does not depend on the equipped weapon, but archer and rogue use the dice of the weapon equipped at the time. The player's level damage bonus (leveling spec) is added once to the ability's damage like any weapon hit.
- Guard: the redirected damage is the existing `hurt` roll minus the **warrior's** armor, then halved/thirded (rounded up, at least 1). If the warrior is no longer active when the tag is applied, the `hurt` lands on the original target as usual. Guard affects `hurt` tags only.
- An attempt that fails validation (cooldown not ready, bad target, no class, downed) has no effect. The AI receives a note that the player tried to use the ability but it was not ready, and the round proceeds.

## Cooldown: eventful rounds

After a round's tags are applied, if at least one tag of kind `hurt`, `heal`, `revive`, `xp`, `milestone`, `give`, `take`, `gold` or `pay` **actually changed something** (judged from the log lines each tag-driven system produced, so a misspelled name, an unknown item, a downed target or a payment from a player with no gold does not count), every player's `ability_cooldown` drops by 1 (not below 0). Then each player who successfully used an ability this round gets that ability's full cooldown (so the round it was used never counts toward its own cooldown).

`[[scene]]`, `[[shop]]`, `[[shop_close]]` and `[[sanctuary]]` do not count. A round with no counting tag leaves every cooldown unchanged, which stops cooldowns being refreshed by idle rounds or timeouts. The existing rule that harmless actions never produce `hurt` stops "fake risk" from being used to tick cooldowns for free.

Retry safety: the cooldown tick runs inside the existing `tagsApplied` guard, so a stale retry cannot tick or set a cooldown twice.

## Data

Migration `0015_classes.sql` (0014 is reserved by the custom-adventures spec):

- `players`: `class_id text check (class_id in ('warrior','archer','cleric','rogue'))` (null allowed), `ability_cooldown int not null default 0 check (ability_cooldown >= 0)`.
- `round_actions`: `use_ability boolean not null default false`, `ability_target_id uuid references players(id)`.
- `apply_changes` is extended (copy the latest definition, add lines like the `xp` one) to accept an optional `abilityCooldown` per player, saved in the same transaction as HP and XP.
- RLS needs no change: the existing insert policy already limits a player to their own action while `active`. The server validates everything else.
- Existing players keep `class_id = null`, `ability_cooldown = 0`.

`Character` gains `classId?: string | null` and `abilityCooldown?: number` (absent means classless / 0).

## Character creation

- New `ClassPicker` component replaces `WeaponPicker` on the create-campaign page (`src/app/page.tsx`) and the join page (`src/app/join/[campaignId]/page.tsx`). It shows each class's name, starting weapon and ability in one line.
- The create and join APIs accept `classId` instead of `weaponId`. The server picks the starting weapon from the class; an unknown or missing `classId` falls back to `warrior` (shortsword, the previous default).
- Add `dagger` (1d4) to `WEAPONS` and `CATALOG`; the starting kit seeds the class's weapon plus the existing minor potion.

## Round flow

1. The player taps the ability button (choosing a target where needed). The client submits an action with generated Thai text such as "ใช้ยืนบัง ปกป้อง Suki", `use_ability = true` and `ability_target_id`.
2. `processRound` calls new `applyAbilityActions(characters, actions, rollSides)` right after `applyPotionActions` and before narration. It validates each use (above) and returns: updated characters (cleric heals), per-player notes for the AI (including archer/rogue damage numbers, which replace that action's normal weapon-damage roll and work even when dice are disabled), the set of guards (`warriorId → targetId`), and the list of successful users. Nothing is saved until the end, so a failed generation leaves state untouched for the retry, like potions.
3. After narration, `applyCharacterTags` receives the guards and redirects `hurt` as described.
4. After the tag steps, the cooldown tick runs (above) and the characters, including `abilityCooldown`, are saved in the one `saveCharacterState` call.
5. Game log lines are added, e.g. "Prem ใช้ ยืนบัง ปกป้อง Suki" and "Mila ใช้ อวยพรรักษา (+5 HP)".

## AI prompt

- The Party status line shows each player's class (Thai name) so narration fits the role.
- When an ability was used, its note is attached to that player's action line. The AI narrates it and must not invent numbers. Cooldowns are not shown to the AI.

## UI

- [ActionInput.tsx](../../../src/components/ActionInput.tsx): the "เลือกเร็ว" row gets the player's ability as a highlighted button at the end of the row.
  - No target needed (archer, rogue): one tap submits.
  - Target needed (warrior, cleric): tapping shows the eligible allies as small buttons under the row; tapping a name submits immediately, no extra confirmation.
  - States: ready; "อีก N รอบเหตุการณ์" (disabled, with a short explanation that only rounds with events count); locked when downed, already acted or submitting (same lock as the other buttons).
  - Classless players see no ability button.
- `submitAction` takes an optional `{ useAbility, targetId }`.
- `fetchRoundPlayers` returns `classId` and `abilityCooldown`; Realtime on `players` already refreshes them.

## Testing

Unit tests next to each file, written to fail first:

- `abilities.test.ts`: ability table, level 1–4 vs 5+ values, cooldowns.
- `applyAbilityActions`: ready; cooldown not zero; user downed; no class; target in another campaign / downed / self for guard; cleric heal capped at max HP and never revives; archer and rogue damage; failed attempt produces the "not ready" note and no effect.
- `applyCharacterTags` with guards: redirected damage after warrior armor, halved/thirded, at least 1; warrior downed by the redirect (including a resulting wipe); warrior not active, so no redirect.
- `processRound`: cooldown ticks only on rounds with a counting tag (silent rounds and `[[scene]]`-only rounds do not tick); the round of use does not tick its own cooldown; a retry with `tagsApplied` does not tick or set cooldowns twice; ability notes reach the prompt.
- `roundRepository` / `players.ts`: load and save `class_id` and `ability_cooldown`; missing values read as no class / 0.
- Create and join APIs: valid, invalid and missing `classId`; the starting weapon follows the class; rogue gets a dagger.
- `ClassPicker` and `ActionInput`: button states (ready, cooling down, downed, acted), target selection, classless players.
- UI check with a temporary uncommitted preview page, as for leveling.

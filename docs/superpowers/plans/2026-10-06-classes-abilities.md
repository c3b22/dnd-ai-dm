# Classes and Active Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players pick one of four classes at creation; each class has one active ability on a button, resolved by the server, with a cooldown counted in eventful rounds.

**Architecture:** Pure modules own the rules (`classes.ts`, `abilities.ts`, `applyAbilities.ts`). `processRound` resolves ability actions right after potions and before narration (state saved only at the end, so retries are safe), passes "guards" into `applyCharacterTags`, then ticks cooldowns inside the existing `tagsApplied` guard and saves with the characters in one `apply_changes` call. The client submits an ordinary `round_actions` row with two new columns.

**Tech Stack:** TypeScript, Next.js, Supabase (Postgres RPC `apply_changes`), Vitest (`npx vitest run <file>`).

**Spec:** `docs/superpowers/specs/2026-10-06-classes-abilities-design.md` (builds on the merged leveling system: `levelForXp`, `levelDamageBonus`, `Character.xp`).

## Global Constraints

- Classes (ids): `warrior`, `archer`, `cleric`, `rogue`. Starting weapons: shortsword, shortbow, staff, **dagger (new, 1d4)**. One ability per class; stronger from **level 5**.
- Abilities and cooldowns: warrior **ยืนบัง** (cooldown 3), archer **ยิงแม่นยำ** (3), cleric **อวยพรรักษา** (3), rogue **ลอบโจมตี** (4).
- Guard: damage of the round's `hurt` tags on the chosen ally moves to the warrior; it is the rolled tier damage minus the **warrior's** armor, then divided by 2 (levels 1–4) or 3 (level 5+), rounded up, at least 1. Applies to `hurt` only; ignored if the warrior is not `active` at that moment.
- Archer damage: weapon dice rolled 2 times summed (levels 1–4) or 3 times (5+). Rogue damage: weapon dice + 2d6 (1–4) or + 3d6 (5+). The user's level damage bonus is added once. Cleric: heal `medium` tier (1d6+1) at levels 1–4, `heavy` (2d6) at 5+, active targets only, capped at max HP, never revives.
- Validity: user `active`, has a class, `ability_cooldown` is 0, the action has no `useItemId`, target (when required) is in the same campaign and `active`, guard cannot target oneself. An invalid attempt has no effect and gives the AI a "tried to use … but it was not ready" note.
- Cooldown: after tags are applied, if any valid tag of kind `hurt`, `heal`, `revive`, `xp`, `milestone`, `give`, `take`, `gold`, `pay` was parsed, every `ability_cooldown` drops by 1 (floor 0); then each successful user gets their ability's full cooldown. `scene`, `shop`, `shop_close`, `sanctuary` do not count.
- Existing players keep `class_id = null` (no button). Unknown/missing `classId` falls back to `warrior`.
- Migration is `0015_classes.sql` (0014 is reserved). Do not apply it; tell the user it must be applied before deploy.
- Do **not** run `npm run build` or delete `.next`. Verify with `npx vitest run` and `npx tsc --noEmit`.
- Tests sit next to their source file in the existing Vitest style (see `src/lib/character/applyTags.test.ts`). Existing files use CRLF line endings: edit them with the Edit tool or line-aware scripts, never multi-line string replace.

## Review Focus

- Cooldown ticks in a round with only `[[scene]]` or no tags: must not tick; the round of use must not tick its own cooldown. (Task 5, 6)
- A player who sends both a potion (`useItemId`) and an ability flag: only the potion happens. (Task 3)
- A `hurt` redirected to a warrior who was already downed by an earlier `hurt` in the same narration: lands on the original target. (Task 4)
- Guard redirect that downs the warrior and completes a party wipe in the same round. (Task 4)
- Old clients sending only `weaponId` while the server now reads `classId`: the player still gets the matching class instead of a surprise warrior. (Task 8)
- Rows from before the migration (no `class_id` / `ability_cooldown`) read as classless and 0. (Task 2)

## File Structure

- Create `src/lib/character/classes.ts` (+ test): class table and helpers.
- Create `src/lib/character/abilities.ts` (+ test): level-dependent ability numbers.
- Create `src/lib/character/applyAbilities.ts` (+ test): `applyAbilityActions`, `isEventfulRound`, `tickCooldowns`.
- Modify `constants.ts` (dagger), `inventory/catalog.ts` (dagger), `character/types.ts`, `character/applyTags.ts` (guards), `character/prompt.ts`, `round/roundRepository.ts`, `round/processRound.ts`, `round/assemblePrompt.ts` (RoundAction fields only if needed), `campaign/createCampaign.ts`, `campaign/joinCampaign.ts`, `app/api/campaigns/route.ts` and `[id]/join/route.ts` if they validate input, `supabase/players.ts`, `supabase/submitAction.ts`, `components/ActionInput.tsx`, `app/page.tsx`, `app/join/[campaignId]/page.tsx`, `app/campaign/[id]/page.tsx`.
- Create `supabase/migrations/0015_classes.sql`, `src/components/ClassPicker.tsx` (+ test). Delete `WeaponPicker.tsx` + test once nothing references it.

---

### Task 1: Class table, ability numbers, dagger

**Files:**
- Create: `src/lib/character/classes.ts`, `src/lib/character/abilities.ts`
- Modify: `src/lib/character/constants.ts`, `src/lib/inventory/catalog.ts`
- Test: `src/lib/character/classes.test.ts`, `src/lib/character/abilities.test.ts`, `src/lib/character/constants.test.ts`

**Interfaces:**
- Produces (classes.ts): `type ClassId = 'warrior' | 'archer' | 'cleric' | 'rogue'`; `type AbilityTarget = 'ally' | 'ally_or_self' | null`; `interface ClassDef { id: ClassId; nameTh: string; weaponId: 'shortsword' | 'shortbow' | 'staff' | 'dagger'; ability: { nameTh: string; descTh: string; target: AbilityTarget; cooldown: number } }`; `CLASSES: Record<ClassId, ClassDef>`; `CLASS_IDS: readonly ClassId[]`; `DEFAULT_CLASS_ID: ClassId` (`'warrior'`); `isClassId(v: unknown): v is ClassId`; `classOf(id: string | null | undefined): ClassDef | null`; `classForWeapon(weaponId: string | null | undefined): ClassId` (shortbow→archer, staff→cleric, dagger→rogue, anything else→warrior).
- Produces (abilities.ts): `ABILITY_UPGRADE_LEVEL = 5`; `guardDivisor(level: number): number` (2 / 3); `archerRolls(level: number): number` (2 / 3); `clericHealTier(level: number): 'medium' | 'heavy'`; `rogueBonusDice(level: number): DiceSpec` (2d6 / 3d6, bonus 0).
- Produces (constants.ts): `WEAPONS.dagger = { nameTh: 'กริช', dice: 1d4 }`. Produces (catalog.ts): `CATALOG.dagger = { kind: 'weapon', nameTh: WEAPONS.dagger.nameTh, weight: 1 }`.

- [ ] **Step 1: Write failing tests.** `classes.test.ts`: every class id has `nameTh`, a `weaponId` that exists in `WEAPONS`, cooldown 3 for warrior/archer/cleric and 4 for rogue; targets are `ally` (warrior), `null` (archer, rogue), `ally_or_self` (cleric); `isClassId('archer')` true, `'mage'`/`null` false; `classOf('rogue')?.weaponId === 'dagger'`, `classOf(null) === null`; `classForWeapon('shortbow') === 'archer'`, `'staff' → 'cleric'`, `'dagger' → 'rogue'`, `'shortsword' → 'warrior'`, `'lightsaber' → 'warrior'`, `undefined → 'warrior'`. `abilities.test.ts`: `guardDivisor(4) === 2`, `(5) === 3`; `archerRolls(4) === 2`, `(5) === 3`; `clericHealTier(4) === 'medium'`, `(5) === 'heavy'`; `rogueBonusDice(1)` equals `{count: 2, sides: 6, bonus: 0}`, `(10)` `{count: 3, ...}`. In `constants.test.ts` and an existing catalog test, add: `weaponFor('dagger').dice` is 1d4 and `catalogEntry('dagger')?.kind === 'weapon'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/character src/lib/inventory` — Expected: FAIL (modules/dagger missing).
- [ ] **Step 3: Implement** the files exactly per the Interfaces block. Thai names: นักรบ, นักธนู, นักบวช, โจร; ability names per Global Constraints; `descTh` is one short Thai sentence describing the effect.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(classes): class table, ability numbers and dagger`.

### Task 2: Data model: migration, Character fields, repository

**Files:**
- Create: `supabase/migrations/0015_classes.sql`
- Modify: `src/lib/character/types.ts`, `src/lib/round/roundRepository.ts`, `src/lib/round/assemblePrompt.ts` (`RoundAction` untouched; only the context action type if needed)
- Test: `src/lib/round/roundRepository.test.ts`

**Interfaces:**
- Consumes: `isClassId` (Task 1).
- Produces: `Character.classId?: string | null`, `Character.abilityCooldown?: number`. `getRoundContext().characters` carry both (`classId` from `class_id`, null if absent; `abilityCooldown` from `ability_cooldown`, 0 if absent). `getRoundContext().actions[i]` gains `useAbility: boolean` and `abilityTargetId: string | null` (from `use_ability`, `ability_target_id`). `saveCharacterState` sends `abilityCooldown: c.abilityCooldown ?? 0` per character in the `apply_changes` payload.

- [ ] **Step 1: Write the migration.** `players`: `class_id text check (class_id in ('warrior','archer','cleric','rogue'))`, `ability_cooldown int not null default 0 check (ability_cooldown >= 0)`; `round_actions`: `use_ability boolean not null default false`, `ability_target_id uuid references players(id) on delete set null`; then `create or replace function apply_changes(...)` copied from `0013_xp.sql` with one more line in the `if change ? 'hp'` update: `ability_cooldown = coalesce((change->>'abilityCooldown')::int, ability_cooldown)`. Use `add column if not exists`; keep the header-comment style.
- [ ] **Step 2: Write failing tests** in `roundRepository.test.ts` (existing fake-client pattern): player row `{class_id: 'cleric', ability_cooldown: 2}` loads as `classId: 'cleric'`, `abilityCooldown: 2`; a row with both missing loads as `classId: null`, `abilityCooldown: 0`; the players `select` string includes `class_id` and `ability_cooldown`; an action row `{use_ability: true, ability_target_id: 'p2'}` loads as `useAbility: true, abilityTargetId: 'p2'` and a row without them as `false` / `null` (the `round_actions` select includes both columns); `saveCharacterState` payload entries contain `abilityCooldown` (2 for a character with 2, 0 for one without). Update existing expectations in this file that `toEqual` whole character/action objects.
- [ ] **Step 3: Run** `npx vitest run src/lib/round/roundRepository.test.ts` — Expected: FAIL on the new cases.
- [ ] **Step 4: Implement** the type fields and the repository select/mapping/payload changes.
- [ ] **Step 5: Run** `npx vitest run src/lib/round` — Expected: PASS. Commit `feat(classes): class and cooldown columns, loaded and saved by the round repository`.

### Task 3: Resolving ability actions

**Files:**
- Create: `src/lib/character/applyAbilities.ts`
- Test: `src/lib/character/applyAbilities.test.ts`

**Interfaces:**
- Consumes: `classOf`, `CLASSES`, `guardDivisor`, `archerRolls`, `clericHealTier`, `rogueBonusDice` (Task 1); `levelForXp`, `levelDamageBonus` (leveling); `rollDice`, `TIERS`, `weaponFor`; `Character`.
- Produces: `interface AbilityAction { playerId?: string; useAbility?: boolean; abilityTargetId?: string | null; useItemId?: string | null }` and
  `applyAbilityActions(characters: Character[], actions: AbilityAction[], rollDie: (sides: number) => number): { characters: Character[]; notes: Record<string, string>; damage: Record<string, number>; guards: Record<string, string>; used: string[]; changes: string[] }` where `notes`/`damage` are keyed by acting player id, `guards` maps **protected target id → warrior id** (first guard on a target wins), and `used` lists ids of players whose ability succeeded. Does not mutate its input; actions without `useAbility` are ignored.

Behaviour the signature does not carry: a player whose action also has `useItemId` is ignored entirely (the potion wins, no "not ready" note). Failure notes read `"<name> tried to use <ability nameTh> but it was not ready"`. Success notes (English, for the AI): guard — `"used <ability> to shield <target name> this round"`; archer/rogue — `"used <ability>: damage roll <N>"`; cleric — `"used <ability> on <target name> and restored <N> HP"`. `damage[playerId]` = ability dice total + `levelDamageBonus(level)`. `changes` Thai lines: `"<name> ใช้<ability> ปกป้อง <target>"` (guard), `"<name> ใช้<ability>"` (archer/rogue), `"<name> ใช้<ability> (+<N> HP)"` on the target, or `"<name> ใช้<ability> ให้ <target> (+<N> HP)"` when the target is someone else.

- [ ] **Step 1: Write failing tests** (a `char()` helper with `classId`, `xp`, `abilityCooldown`, `status`; `rollDie = () => 4`): warrior with ready cooldown guarding `p2` → `guards` `{p2: 'p1'}`, `used` `['p1']`; guard on self → failure note, no guard; cleric at level 1 healing `p2` (hp 10/20) with die 4 → hp 15 (1d6+1 = 5), note mentions 5; cleric heal capped at max HP; cleric healing a downed target → failure; cleric healing self works (`ally_or_self`); archer level 1 with shortbow (1d6) and die 4 → damage 8, level 5 (xp 420) → 12 + `levelDamageBonus(5)` = 14; rogue level 1 dagger 1d4 die 4 → 4 + 2d6 (8) = 12; cooldown 2 → failure note, no effect, not in `used`; classless player → failure; downed user → ignored/failure with no effect; target in another campaign (id not in `characters`) → failure; action with `useItemId` set → no note at all; non-ability action → untouched; input array not mutated.
- [ ] **Step 2: Run** `npx vitest run src/lib/character/applyAbilities.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `applyAbilityActions` in `applyAbilities.ts`; use `findByDisplayName`-free lookups by id; cleric heal uses `rollDice(TIERS[clericHealTier(level)], rollDie)` capped at `maxHp - hp`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(classes): resolve ability actions`.

### Task 4: Guard redirect in applyCharacterTags

**Files:**
- Modify: `src/lib/character/applyTags.ts`
- Test: `src/lib/character/applyTags.test.ts`

**Interfaces:**
- Consumes: `guardDivisor`, `levelForXp`.
- Produces: `applyCharacterTags(characters, tags, rollDie, guards: Record<string, string> = {})` — a `hurt` on an **active** target whose id is a key in `guards`, whose guard warrior is currently `active` and is a different character, is applied to the warrior instead: `damage = Math.max(1, Math.ceil((rolled - (warrior.armorReduction ?? 0)) / guardDivisor(levelForXp(warrior.xp ?? 0))))`. The warrior goes `downed` at 0 HP like any hurt. Change line: `"<warrior> รับดาเมจแทน <target> −<N> HP"` (plus the existing `"<warrior> ล้มลง"` when it drops to 0). All other behaviour unchanged.

- [ ] **Step 1: Write failing tests** (die returns 4; `medium` = 5, `heavy` = 8): warrior (armor 1, level 1) guarding Suki takes `ceil((5-1)/2)` = 2 from `hurt: Suki | medium` and Suki is untouched; level 5 (xp 420) takes `ceil(4/3)` = 2 from the same and `ceil((8-1)/3)` = 3 from heavy; minimum damage 1 (`light` roll 4 with armor 3 at level 1 → 1); warrior already `downed` (including downed by an earlier `hurt` tag in the same call) → the `hurt` lands on Suki as usual; `hurt` on someone not guarded unaffected; a `heal` on the guarded target is unaffected; warrior at low HP downed by the redirect → `status: 'downed'` and, if everyone is then down, `wiped` is true; empty/omitted `guards` behaves exactly as before (existing tests pass).
- [ ] **Step 2: Run** `npx vitest run src/lib/character/applyTags.test.ts` — Expected: FAIL on the new cases only.
- [ ] **Step 3: Implement** the optional parameter and redirect in the `hurt` branch.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(classes): warrior guard redirects hurt tags`.

### Task 5: Cooldown rules

**Files:**
- Modify: `src/lib/character/applyAbilities.ts`
- Test: `src/lib/character/applyAbilities.test.ts`

**Interfaces:**
- Consumes: `CharacterTag` (tags.ts), `classOf`.
- Produces: `isEventfulRound(tags: CharacterTag[]): boolean` (true if any tag has kind `hurt|heal|revive|xp|milestone|give|take|gold|pay`); `tickCooldowns(characters: Character[], eventful: boolean, used: string[]): Character[]` — if `eventful`, every character's `abilityCooldown` becomes `max(0, (abilityCooldown ?? 0) - 1)`; then every id in `used` gets `classOf(c.classId).ability.cooldown`. Does not mutate.

- [ ] **Step 1: Write failing tests:** `isEventfulRound` true for each counting kind, false for `[]`, `[{kind:'sanctuary'}]`, `shop`, `shop_close`, and mixed non-counting tags; `tickCooldowns` with cooldown 2 and eventful → 1; cooldown 0 stays 0; non-eventful → unchanged; a user in `used` with cooldown 0 and eventful → full cooldown (3 for archer, 4 for rogue), **not** cooldown − 1; a user in `used` and non-eventful → full cooldown; a character without `abilityCooldown` field treated as 0.
- [ ] **Step 2: Run** `npx vitest run src/lib/character/applyAbilities.test.ts` — Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the two functions.
- [ ] **Step 4: Run** the same command — Expected: PASS. Commit `feat(classes): eventful-round cooldown rules`.

### Task 6: processRound wiring

**Files:**
- Modify: `src/lib/round/processRound.ts`
- Test: `src/lib/round/processRound.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5; `context.actions[i].useAbility`/`abilityTargetId` and `context.characters[i].classId`/`abilityCooldown` (Task 2).

Wiring (decisions the tests below pin):
1. After `potions = applyPotionActions(...)`, run `abilities = applyAbilityActions(potions.characters, context.actions, rollSides)`. Everything downstream that used `potions.characters` (prompt, tag application) uses `abilities.characters`.
2. In the `rolled` map, merge `abilities.notes[playerId]` into the action `note` (potion note first if both exist) and, when `abilities.damage[playerId]` exists, use it as `damage` (and set `weaponLabel` to the ability's weapon as before) instead of rolling the normal weapon damage; this works even when dice are disabled.
3. In the tag-apply block: `applyCharacterTags(abilities.characters, tags, rollSides, abilities.guards)`, then the existing inventory/economy/XP steps, then `tickCooldowns(xpResult.characters, isEventfulRound(tags), abilities.used)`; save that array with `saveCharacterState`. Add `abilities.changes` to the stats lines before `result.changes`.

- [ ] **Step 1: Write failing tests** (extend the `processRound leveling` helper style, new `describe('processRound abilities')`): archer with `useAbility` and die 4 gets `damage` = 2×4 in the prompt line and the note text appears; a failed attempt puts the "not ready" note in the prompt; narration `"…\n[[hurt: Suki | medium]]"` with warrior guarding Suki saves the warrior at reduced HP and Suki at full; **cooldown**: after a round whose narration has `[[xp: small]]` a player with `abilityCooldown: 2` is saved with 1; after a round with only `[[scene: crypt]]` (or no tags) saved unchanged at 2; the player who used the ability this round is saved with the full cooldown (3) even when the round was eventful; retry with `tagsApplied: true` → no `saveCharacterState` call; cleric heal shows in the saved HP; a player with both `useItemId` and `useAbility` only drinks the potion. Existing tests unchanged.
- [ ] **Step 2: Run** `npx vitest run src/lib/round/processRound.test.ts` — Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the three wiring changes.
- [ ] **Step 4: Run** `npx vitest run src/lib/round` — Expected: PASS. Commit `feat(classes): resolve abilities and tick cooldowns in round processing`.

### Task 7: AI prompt

**Files:**
- Modify: `src/lib/character/prompt.ts`
- Test: `src/lib/character/prompt.test.ts`, `src/lib/round/assemblePrompt.test.ts` (only if an assertion breaks)

**Interfaces:**
- Consumes: `classOf` (Task 1).

- [ ] **Step 1: Write failing tests:** a character with `classId: 'warrior'` and `xp: 150` renders `Prem (Lv 3, นักรบ):`; classless renders as before (`Prem (Lv 1):`); the prompt tells the DM that an ability note on an action is an outcome to narrate and never to invent numbers; the Party status lines contain no cooldown number (assert no `/cooldown/i`).
- [ ] **Step 2: Run** `npx vitest run src/lib/character/prompt.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement:** class name inside the existing parenthesis after the level; one extra instruction line about ability notes.
- [ ] **Step 4: Run** `npx vitest run src/lib` — Expected: PASS. Commit `feat(classes): show classes to the DM`.

### Task 8: Creating and joining with a class

**Files:**
- Modify: `src/lib/campaign/createCampaign.ts`, `src/lib/campaign/joinCampaign.ts`, `src/app/api/campaigns/route.ts` / `src/app/api/campaigns/[id]/join/route.ts` (pass `classId` through), `src/lib/inventory/startingKit.ts` (only if the weapon lookup needs the dagger)
- Test: `src/lib/campaign/joinCampaign.test.ts`, `src/app/api/campaigns/route.test.ts`, `src/app/api/campaigns/[id]/join/route.test.ts`, `src/lib/inventory/startingKit.test.ts`

**Interfaces:**
- Consumes: `isClassId`, `DEFAULT_CLASS_ID`, `CLASSES`, `classForWeapon` (Task 1).
- Produces: `createCampaign(supabase, { name, userId, displayName, adventureId?, classId?, weaponId? })` and `joinCampaign(supabase, { campaignId, userId, displayName, classId?, weaponId? })`. The class is `classId` if valid, else `classForWeapon(weaponId)` when only a legacy `weaponId` is given, else `warrior`. The player row stores `class_id` and `weapon_id: CLASSES[class].weaponId`; `seedStartingKit` receives that weapon.

- [ ] **Step 1: Write failing tests:** `classId: 'rogue'` stores `class_id: 'rogue'`, `weapon_id: 'dagger'` and seeds the dagger kit; `classId: 'mage'` and no params both store `warrior`/`shortsword`; legacy `weaponId: 'shortbow'` with no `classId` stores `archer`/`shortbow`; `weaponId: 'staff'` → `cleric`; a valid `classId` wins over a conflicting `weaponId`; an existing player is still returned unchanged by `joinCampaign`. Update the existing `weaponId`-based expectations in these files to the new payloads.
- [ ] **Step 2: Run** `npx vitest run src/lib/campaign src/app/api src/lib/inventory` — Expected: FAIL on the new/updated cases.
- [ ] **Step 3: Implement** the class resolution once as a small helper reused by both functions (put it in `classes.ts` as `resolveClassId(params: { classId?: unknown; weaponId?: unknown }): ClassId`, with its own test cases in `classes.test.ts` covering the three rules above).
- [ ] **Step 4: Run** the same command — Expected: PASS. Commit `feat(classes): create and join with a class`.

### Task 9: Class picker UI

**Files:**
- Create: `src/components/ClassPicker.tsx`
- Modify: `src/app/page.tsx`, `src/app/join/[campaignId]/page.tsx`
- Delete: `src/components/WeaponPicker.tsx` and its test, plus `STARTING_WEAPON_IDS`, `isStartingWeapon`, `DEFAULT_WEAPON_ID` in `constants.ts` **only if** no reference remains (grep first; adjust `constants.test.ts` accordingly)
- Test: `src/components/ClassPicker.test.tsx`

**Interfaces:**
- Consumes: `CLASSES`, `CLASS_IDS`, `DEFAULT_CLASS_ID`, `weaponFor`, `diceLabel`.
- Produces: `ClassPicker({ value: string; onChange: (classId: string) => void })`; the two pages send `classId` instead of `weaponId` in their request bodies.

- [ ] **Step 1: Write failing test:** renders four options (นักรบ, นักธนู, นักบวช, โจร), each showing its weapon name, dice label and ability name; the one equal to `value` has `aria-pressed="true"`; clicking another calls `onChange` with its id (same style as the old `WeaponPicker.test.tsx`).
- [ ] **Step 2: Run** `npx vitest run src/components/ClassPicker.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `ClassPicker` reusing the `wp-list` / `adv wp-item` classes; swap it into both pages with initial state `DEFAULT_CLASS_ID`; remove the old picker and dead constants as stated.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: PASS / no errors. Commit `feat(classes): choose a class instead of a weapon`.

### Task 10: Ability button

**Files:**
- Modify: `src/lib/supabase/players.ts`, `src/lib/supabase/submitAction.ts`, `src/components/ActionInput.tsx`, `src/app/campaign/[id]/page.tsx`, the stylesheet that defines `.qa`
- Test: `src/components/ActionInput.test.tsx`, `src/lib/supabase/players` tests if they exist

**Interfaces:**
- Produces: `RoundPlayer.classId?: string | null`, `RoundPlayer.abilityCooldown?: number` (fetched from `class_id`, `ability_cooldown`); `submitAction(roundId, playerId, actionText, useItemId?, ability?: { targetId?: string | null })` — when `ability` is given the insert also sets `use_ability: true` and `ability_target_id`; `ActionInput` gains optional prop `ability?: { nameTh: string; target: AbilityTarget; cooldown: number; allies: { id: string; name: string }[] }` and `onUseAbility?: (targetId: string | null) => Promise<void>`.
- Page: builds `ability` from `classOf(me.classId)` and the other `players` (`status === 'active'`; self included only for `ally_or_self`), and `onUseAbility` calls `submitAction(roundId, playerId, 'ใช้<nameTh>' + (target ? ' ' + <verb> + target.name : ''), undefined, { targetId })` with verbs "ปกป้อง" (guard) / "ให้" (heal), then `refreshPlayers()`.

- [ ] **Step 1: Write failing tests** in `ActionInput.test.tsx`: with an ability with no target, a button with the ability name appears at the end of the quick row; clicking calls `onUseAbility(null)` and then the "ส่ง action แล้ว" status shows; with `target: 'ally'` clicking the ability button shows one button per ally and clicking a name calls `onUseAbility(thatId)`; `cooldown: 2` disables the ability button and shows `อีก 2 รอบเหตุการณ์`; the button is disabled when `disabledReason` or `alreadyActed` is set; no `ability` prop renders exactly the old UI (existing tests untouched).
- [ ] **Step 2: Run** `npx vitest run src/components/ActionInput.test.tsx` — Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the data fetch, `submitAction` option, button and target list, page wiring and the small style for a highlighted `.qa.ability` button.
- [ ] **Step 4: Run** `npx vitest run src/components src/lib/supabase` — Expected: PASS. Commit `feat(classes): ability button in the action dock`.

### Task 11: Whole-suite verification

- [ ] **Step 1: Run** `npx vitest run` — Expected: all PASS.
- [ ] **Step 2: Run** `npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 3: Preview.** Start the dev server with `preview_start` (name `dnd-ai-dm`), add a temporary **uncommitted** page under `src/app/dev-preview/` rendering `ClassPicker` and `ActionInput` with a warrior ability (ready, cooling down, with target list) and check desktop and mobile widths; delete the page and stop the server afterwards. Do not log in or create campaigns: the app uses a hosted Supabase. Report what could not be verified, and that `0015_classes.sql` must be applied before deploy.

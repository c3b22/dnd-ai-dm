# Character status (HP, weapons, downed) — design

## Goal

Give every player a character with HP and a weapon so combat has stakes and players play carefully, without ever eliminating a friend from the game. The AI DM narrates; **the server owns every number**.

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Who decides HP/damage? | Hybrid: the AI announces *what happened* via tags, the server rolls the dice and applies the numbers. |
| Character creation | Minimal: everyone starts at 20 HP and picks one starting weapon from a short list. No classes, no ability scores. |
| At 0 HP | **Downed** (not dead): cannot act until a friend rescues them. No permadeath. |
| Revive | Back at **5 HP**, and max HP drops by a growing amount: **−2, −4, −6 …** (the n-th revive of that player since their last sanctuary costs 2n). Never below 10. |
| Sanctuary | A place of healing (e.g. a temple) restores everyone's max HP to full and resets everyone's revive counter. |
| Whole party downed | Everyone is revived at **half of their (reduced) max HP**, max HP drops by the player's revive cost **plus 2** (−4, −6, −8 … by their own counter, and it counts as a revive), and the AI must narrate a concrete story cost next round. |

## Out of scope

Enemy HP, armor/AC, multi-item inventory, classes, XP, healing potions, unique-name enforcement.

## Data

Migration `0007_character_status.sql`:

- `players`: `hp int not null default 20`, `max_hp int not null default 20`, `weapon_id text`, `status text not null default 'active'` (`'active' | 'downed'`), `revives_since_sanctuary int not null default 0`.
- `campaigns`: `pending_wipe boolean not null default false` (set when the party wipes, consumed by the next round's prompt).
- RLS: the "players can submit only their own action" policy also requires `players.status = 'active'`, so a downed player cannot act even from a modified client.

Existing players get 20/20 and no weapon; a null weapon counts as bare hands (1d2).

Constants (in code, `src/lib/character/`): `BASE_MAX_HP = 20`, `MIN_MAX_HP = 10` (max HP never drops below this, so nobody is stuck in a death spiral), `REVIVE_HP = 5`, `REVIVE_MAX_HP_STEP = 2` (revive n costs `2n`), `WIPE_EXTRA_MAX_HP_PENALTY = 2` (a wipe costs the revive cost + 2).

Weapons (`weapons.ts`): shortsword 1d8, shortbow 1d6, staff 1d4, bare hands 1d2. Thai display names live next to the ids.

Severity tiers (`tiers.ts`), used for both damage and healing: `light` 1d4, `medium` 1d6+1, `heavy` 2d6.

### Sanctuaries (new `sanctuary` field on each adventure)

| Adventure | Sanctuary |
|---|---|
| The Sunken Bell of Marrowmere | Brother Tolliver's empty chapel on the lakeshore |
| The Wolf King of Ashenfell | The hearth in Jarl Asgrim's longhall |
| The Market of a Thousand Doors | Ozric the Lantern-Seller's stall (the AI narrates the "price" as a small story favor, never a number) |
| The Crown of the Sunken King | The tavern near Castle Dunmoor where the map was bought (a retreat from the dungeon, so resting has a cost in momentum) |

## Round flow

`processRound` already rolls a d20 per action before calling the AI. It additionally:

1. Rolls each acting player's **weapon damage die** and includes it in the prompt next to the d20 (`Prem (shortsword, d20 14, damage 5): ...`), so the narrated hit matches the real numbers.
2. Adds a **characters block** to the prompt: each player's HP/max HP, weapon and status, plus the rules for the tags below and "never invent HP numbers".
3. If `campaigns.pending_wipe` is set, adds an **aftermath instruction**: the party was defeated last round; narrate how they survived and impose one concrete story consequence (captured, lost something valuable, the antagonist advances). Clears the flag once the round is posted.
4. After narration is generated and posted, parses the tags from the text (same approach as `parseSceneTag`; tags never reach the visible message) and applies them.

### Tags the AI may emit (end of narration)

- `[[hurt: Name | light|medium|heavy]]` — the named player took a hit.
- `[[heal: Name | light|medium|heavy]]` — the named player was healed.
- `[[revive: Name]]` — a downed player was rescued by a teammate's action.
- `[[sanctuary]]` — the party is at a place of healing. The prompt names each adventure's designated sanctuary (new `sanctuary` field on each adventure) and forbids the tag anywhere else.

Names match `display_name` case-insensitively. Unknown or ambiguous names (two players with the same name) are ignored — the round never fails on a bad tag.

### Applying tags — pure function `applyCharacterTags`

Input: current players, parsed tags, `rollDie(sides)`. Output: new player states plus a list of change lines for the log. Rules, in order:

- `hurt`: roll the tier dice, `hp = max(0, hp - dmg)`; at 0 the status becomes `downed`. Already-downed players ignore `hurt`.
- `heal`: only for `active` players; `hp = min(max_hp, hp + roll)`. A downed player is only recovered by `revive`.
- `revive`: only for `downed` players. `revives_since_sanctuary += 1`, `max_hp = max(MIN_MAX_HP, max_hp - 2 * revives_since_sanctuary)`, `hp = min(REVIVE_HP, max_hp)`, status `active`.
- `sanctuary`: `max_hp = BASE_MAX_HP` and `revives_since_sanctuary = 0` for every player; downed players are not revived by it.
- After all tags: if every player is `downed`, apply the **wipe** per player: `revives_since_sanctuary += 1`, `max_hp = max(MIN_MAX_HP, max_hp - (2 * revives_since_sanctuary + 2))`, `hp = ceil(max_hp / 2)`, status `active` for all, and set `campaigns.pending_wipe = true`.
- Whenever `max_hp` drops below `hp`, `hp` is clamped down.

The round then posts one system message `{ "type": "stats", "changes": string[] }` (e.g. "Prem −5 HP", "Prem ล้มลง", "Prem ฟื้นขึ้นมา (max HP −4)") and updates the `players` rows.

Failure policy: applying state is best-effort, like the roll summary and scene change — if it throws, the round still closes so the table never stalls. A round claim is still released only when narration generation fails (existing behavior).

## Turn flow with downed players

- The "everyone has acted" trigger counts only **active** players (`subscribeToRoundActionCount` counts `players` with `status = 'active'`).
- A downed player's input is locked with "คุณล้มลง รอเพื่อนช่วย", and the round timer path is unchanged.
- The server-side RLS change above is the real guard; the client lock is UX.

## UI

- Create-room and join forms get a weapon picker (default: shortsword). `/api/campaigns` and `/api/campaigns/[id]/join` accept `weaponId` and validate it against the catalog (unknown → default).
- `RoundPlayer` gains `hp`, `maxHp`, `weaponId`, `status`. `PlayerOrder` shows an HP bar, the weapon name and a "ล้มลง" badge; it updates in real time because `players` is already subscribed.
- `MessageList` renders `stats` system messages as compact lines, like the `rolls` message. They arrive after the DM message, so the existing dice-overlay buffering is unaffected.

## Testing

Test-first, dependency-injected like the rest of the codebase:

- `parseCharacterTags` (extract, strip from text, ignore malformed).
- `applyCharacterTags`: every rule above, including clamping, the `MIN_MAX_HP` floor, downed players ignoring hurt/heal, sanctuary not reviving, and the wipe.
- `assemblePrompt`: characters block, weapon damage in action lines, aftermath instruction only when `pending_wipe`.
- `processRound`: tags applied and stripped, stats message posted, wipe sets the flag, apply failure does not fail the round.
- Components: `PlayerOrder` HP/badge, weapon picker, downed input lock, `stats` message rendering.

The migration is applied to the live Supabase project through the browser (SQL editor), per the standing instruction, and verified against the REST API before deploying.

## Known limitations

- Two players sharing a display name make tags for that name ambiguous (ignored).
- The AI can still forget a tag or over-use `sanctuary`; the prompt constrains it, but this is model behavior, not enforced by the server.

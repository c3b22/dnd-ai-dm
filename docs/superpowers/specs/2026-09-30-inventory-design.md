# Inventory and equipment — design

Sub-project 2 of 3 (1: character status, done. 3: economy — gold, merchants, trading — is separate and builds on this).

## Goal

Give every character things to carry and wear: weapons, armor, potions and story items. Gear changes the numbers (armor absorbs damage, potions heal, the equipped weapon sets damage) and the AI DM can hand items out and take them away. **The server owns every number and every item**, as with HP.

## Decisions (agreed with the user, defaults filled in where the user said "your call")

| Question | Decision |
|---|---|
| Item catalog | Fixed list in code. Weapons, armor, potions, plus AI-named story items with no stats. |
| Slots | One equipped weapon, one equipped armor; everything else sits in the backpack. |
| Weight | Everyone carries up to **10 weight units**. Equipped items count. Over the limit, new items are refused. |
| Armor | Reduces **each hit** by a flat amount; a hit always does at least 1. |
| Who hands out items | The AI, with tags the server validates. Players never create items. |
| Using items | Equip/unequip is instant and free. Drinking a potion takes the player's action for the round. |
| Out of scope | Gold, shops, merchants, player-to-player trade (sub-project 3), item durability, enemy loot tables, crafting. |

## Catalog (`src/lib/inventory/catalog.ts`)

| id | Thai name | slot | effect | weight |
|---|---|---|---|---|
| `shortsword` | ดาบสั้น | weapon | 1d8 | 2 |
| `shortbow` | ธนูสั้น | weapon | 1d6 | 2 |
| `staff` | ไม้เท้า | weapon | 1d4 | 2 |
| `armor_light` | เกราะหนัง | armor | −1 per hit | 1 |
| `armor_medium` | เกราะโซ่ | armor | −2 per hit | 2 |
| `armor_heavy` | เกราะเหล็ก | armor | −3 per hit | 3 |
| `potion_minor` | ยาฟื้นฟูเล็ก | consumable | heals 1d6+1 | 1 |
| `potion_major` | ยาฟื้นฟูใหญ่ | consumable | heals 2d6 | 1 |
| `story:<title>` | (AI's title, ≤ 40 chars) | none | none | 0 |

Bare hands (1d2) are not an item: with no weapon equipped a player uses them, as today. Weapon dice reuse the existing `WEAPONS` table in `character/constants.ts` (single source of truth; the catalog references it).

## Data

Migration `0008_inventory.sql`:

- `inventory_items`: `id uuid pk`, `player_id uuid references players on delete cascade`, `item_id text not null` (catalog id, or `story`), `custom_name text` (story items only), `quantity int not null check (quantity > 0)`, `slot text check (slot in ('weapon','armor'))` (copied from the catalog at insert), `equipped boolean not null default false`.
- Uniqueness: one row per `(player_id, item_id, coalesce(custom_name, ''))` (so potions stack); a partial unique index on `(player_id, slot) where equipped` guarantees at most one equipped weapon and one equipped armor even if application code has a bug.
- RLS: campaign members may **select** inventories of players in their campaign (the party sees each other's gear, and trading will need it). **No insert/update/delete policy**: all writes go through server routes using the service-role client. This closes the hole found in the character-status review, where a modified client could write its own stats.
- Backfill: for every existing player with a `weapon_id`, insert that weapon as an equipped `inventory_items` row.
- `players.weapon_id` is no longer read or written after this migration (left in the table so the migration is reversible). The equipped weapon row is the single source of truth.
- `round_actions.use_item_id text` (nullable): the catalog id of a consumable the player drinks this round. The existing insert policy is unchanged; the server validates ownership when processing the round.

## Rules — pure module `src/lib/inventory/`

- `weightOf(items)`: sum of catalog weight × quantity. `CARRY_CAPACITY = 10`.
- `giveItem(items, itemId, customName?)`: returns the new list and a result `added | full | unknown`. Refused (`full`) when the added weight would exceed capacity. Story items cap at 5 per player so the table cannot grow unbounded. A newly given weapon or armor goes in the backpack, except that a slot with nothing equipped auto-equips it (a player who found their first sword is not left fighting bare-handed).
- `takeItem(items, itemId, customName?)`: removes one unit (quantity − 1, row deleted at 0), unequipping automatically. Unknown item → no change.
- `equip(items, itemId)` / `unequip(items, slot)`: enforce one item per slot and that the item is in the backpack.
- `armorReduction(items)`: the equipped armor's value, 0 if none.
- `equippedWeaponId(items)`: catalog id or `null` (bare hands).
- `useConsumable(items, itemId)`: consumes one potion and returns its heal dice; the caller applies healing through the existing HP rules (clamped to max HP, only for active players).

All functions are pure over `InventoryItem[]` and take the RNG as a parameter where dice are involved, like `applyCharacterTags`.

## Round flow changes

1. `getRoundContext` also loads each character's inventory. `Character` gains `armorReduction: number`, `weaponId` is derived from the equipped weapon row, and the context carries `inventories` keyed by player id.
2. **Drinking a potion.** For each action with `use_item_id`, before narration: verify the player is active and owns the potion; consume it, roll the heal, apply it (clamped to max HP). The action line in the prompt says so ("Prem drinks a minor potion, +4 HP") so the narration matches. If the item is missing or invalid the action is treated as ordinary text; the round never fails.
3. **Prompt.** A new inventory block lists each player's equipped weapon and armor, backpack contents and weight used/10, the catalog ids the AI may hand out, and the tag rules below. The AI is told to give items sparingly and to prefer story items unless a weapon, armor or potion is a real reward.
4. **Armor in damage.** `applyCharacterTags` takes each character's `armorReduction`: `hurt` damage becomes `max(1, roll − armorReduction)`. The stats line shows it: `Prem −3 HP (เกราะกัน 2)`.
5. **Give/take tags** are applied after HP tags, in reading order, and produce lines in the same `stats` system message: `Prem ได้รับ ยาฟื้นฟูเล็ก`, `Prem เสียไป กุญแจสนิม`, `Prem แบกไม่ไหว: ไม่ได้รับ เกราะเหล็ก`.
6. All inventory persistence is best-effort like character state: a failure never leaves the table stuck.

### Tags

- `[[give: PlayerName | item_id]]`, e.g. `[[give: Prem | potion_minor]]`
- `[[give: PlayerName | story: Rusty Key]]`
- `[[take: PlayerName | item_id]]` and `[[take: PlayerName | story: Rusty Key]]`

Names match like HP tags (trimmed, case-insensitive, unknown or ambiguous names ignored). Unknown catalog ids are ignored. Misspelled or malformed `give/take` tags are stripped from the visible narration (the existing leftover-tag rule is extended; this also fixes the same known gap for the older tags where the keyword is right).

## Routes

- `POST /api/campaigns/[id]/inventory/equip` body `{ userId, itemId, action: 'equip' | 'unequip' }` — validates the player belongs to the campaign, applies the pure rule, writes with the service-role client. Returns the new inventory.
- `join` and campaign creation seed the starting kit server-side: the chosen starting weapon, equipped, and one `potion_minor`.
- Following the app's existing convention the routes trust `userId` from the request body (anonymous ids are unguessable); this is not a new weakness but is listed under limitations.

## UI

- `Inventory` panel (button on the game screen opens it): weight bar (`6/10`), equipped weapon and armor with unequip buttons, backpack list with equip buttons for weapons/armor and a "ดื่ม" button for potions, story items listed with no actions.
- Pressing "ดื่ม" selects the potion for this round's action (`use_item_id`) and submits it as the player's action (text "ดื่ม <potion name>") — one tap, one action, consistent with quick actions. Disabled when downed or already acted.
- `PlayerOrder` shows the armor value next to the weapon; the party can see each other's gear via the realtime-subscribed inventory rows.
- The weapon picker at join is unchanged from the player's view; it now seeds the inventory instead of `players.weapon_id`.

## Testing

Test-first, dependency-injected like the rest of the code:

- Inventory rules: weight math, give (added/full/unknown/story cap/auto-equip empty slot), take (unequips, removes at 0), equip/unequip slot rules, armor reduction, consumable use.
- `parseCharacterTags` extension: give/take parsing incl. story titles with spaces, stripping malformed tags.
- `applyCharacterTags`: armor reduction with the minimum-1 floor and the changed stats line.
- `processRound`: potion action heals and consumes, invalid potion ignored, give/take applied and stripped, failure in inventory persistence does not fail the round.
- `roundRepository`: inventory load/save mapping.
- Routes: equip route validation and errors.
- Components: `Inventory` panel (weight bar, equip/unequip/drink buttons and their disabled states), `PlayerOrder` armor display.

The migration is applied to the live Supabase project through the browser SQL editor and verified via the REST API before deploying, per the standing instruction. `weapon_id` backfill is verified on the existing test campaign.

## Known limitations

- Story item titles are free text from the AI; a title that differs by a character on a later `take` will not match (the take is ignored).
- The AI may forget to tag, over-give items, or narrate an item the server refused; the prompt tells it the pack was full on the next round, but this is model behavior.
- Routes trust the `userId` in the request body, as the join route does today.
- Two players sharing a display name make give/take for that name ambiguous (ignored), as with HP tags.

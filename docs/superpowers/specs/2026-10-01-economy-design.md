# Economy (gold, merchants, player trading) — design

Sub-project 3 of 3. Builds on character status (HP, tags, `processRound`) and inventory (items, weight, server-only writes).

## Goal

Give items a value and give players something to do with them: earn gold, buy and sell with AI-played merchants, and trade with each other. As everywhere else, **the server owns every number and every item**; the AI narrates and announces events with tags, it never sets prices or moves goods.

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Whose gold? | Personal: `players.gold`. Everyone starts with **20**. |
| How is gold earned? | The AI awards a tier with `[[gold: Name \| small\|medium\|large]]`; the server rolls the amount. Selling items to a merchant also pays. |
| How is gold spent by the story? | `[[pay: Name \| small\|medium\|large]]` (bribe, toll, fee): the server deducts the rolled amount, never more than the player has. |
| Buying and selling | An in-app shop panel with server-side fixed prices. It does not use the round's action. The AI only opens and closes the shop. |
| Player-to-player | A proposal the other player accepts or declines. Giving for nothing is the same thing with an empty request. |
| Out of scope | Haggling, merchant gold or limited stock, banks, crafting, item rarity, selling story items. |

## Numbers (`src/lib/economy/`, all in code)

- `STARTING_GOLD = 20`.
- Gold tiers: `small` 2d4+2 (4–10), `medium` 3d6+5 (8–23), `large` 6d6+10 (16–46).
- Base prices: `potion_minor` 10, `potion_major` 25, `staff` 20, `shortsword` 30, `shortbow` 30, `armor_light` 25, `armor_medium` 50, `armor_heavy` 90. Buying costs the base price; selling pays `floor(base / 2)`. Story items have no price and cannot be sold to a merchant. They can still be traded between players.
- Weight still caps every pack at 10: a purchase or a trade that would exceed it is refused.

## Data — migration `0010_economy.sql`

- `players.gold int not null default 20 check (gold >= 0)`. Existing players get 20.
- `campaigns.current_shop jsonb` (null = no shop): `{ "name": string, "itemIds": string[] }`.
- `trades`: `id uuid pk`, `campaign_id`, `from_player_id`, `to_player_id` (both `references players on delete cascade`, `check (from_player_id <> to_player_id)`), `give_items jsonb not null default '[]'`, `give_gold int not null default 0 check (give_gold >= 0)`, `want_items jsonb not null default '[]'`, `want_gold int not null default 0 check (want_gold >= 0)`, `status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled'))`, `created_at`, `resolved_at`. An item entry is `{ itemId, customName, quantity }`. RLS: members **select** only; no write policies. Added to the realtime publication, as is `players`/`campaigns` already.
- **One atomic function**, `apply_changes(changes jsonb, trade_id uuid default null)`, is the only way gold and items move outside the round pipeline. `changes` is an array of `{ playerId, goldDelta, items | null }` where `items` is the player's complete new item list (or null to leave items alone). In one transaction it locks the affected `players` rows in id order (`for update`, no deadlocks), for each player removes rows no longer listed and upserts the rest (keeping the database's current `equipped` flags for rows that already exist and equipping a new item only into a free slot, the same rules as `saveInventories`), adds `goldDelta` to `players.gold` (the `gold >= 0` check rolls the whole thing back on overspend), and, when `trade_id` is given, sets that trade `accepted` only if it is still `pending`. **`revoke execute … from public, anon, authenticated`**: PostgREST exposes functions to signed-in clients by default, and this one must be callable only with the service-role key.

## Pure rules (`src/lib/economy/`)

- `prices.ts`: `PRICES`, `buyPrice(itemId): number | null`, `sellPrice(itemId): number | null`.
- `gold.ts`: `GOLD_TIERS`, `STARTING_GOLD`, `rollGold(tier, rollDie)`.
- `shop.ts`: `buyFromShop(player, items, shop, itemId) → { ok, items, goldDelta } | { ok: false, reason }` (reasons: `closed`, `not_sold`, `no_gold`, `full`); `sellToShop(player, items, itemId, customName?)` (reasons: `closed`, `not_sellable`, `not_owned`). Uses `giveItem`/`takeItem`, so auto-equip into an empty slot and weight rules are the ones from inventory.
- `trade.ts`: `validateTrade(trade, fromItems, toItems, fromGold, toGold)` and `applyTrade(...)` returning the new item lists and gold deltas for both players, or a reason (`missing_items`, `no_gold`, `full`). An offered item that was equipped simply leaves the giver's slot empty; the receiver's new weapon or armor goes into their free slot or the backpack.

## Tags (extend `parseCharacterTags`)

- `[[gold: Name | small|medium|large]]` and `[[pay: Name | small|medium|large]]`
- `[[shop: Merchant Name | id, id, …]]` — opens the shop with those catalog ids (unknown ids dropped, empty result → ignored). Opening a shop replaces any open one.
- `[[shop_close]]`

Malformed forms of these keywords are hidden from the narration like the existing ones. `gold`/`pay` use the same name matching as HP tags.

## Round pipeline changes

- Gold tags apply after HP and inventory tags, in reading order. The server rolls; results go into the round's `stats` message (`Prem ได้รับ 14 ทอง`, `Prem เสียไป 6 ทอง`, `Prem จ่ายเท่าที่มี 3 ทอง` when short).
- Gold changes persist through `apply_changes` (items `null`), best-effort like the rest: a failure never blocks a round and never blocks the stats line.
- `shop` / `shop_close` update `campaigns.current_shop`. When the scene changes (`setCurrentScene`) the shop closes.
- The prompt gains an economy block: each player's gold, whether a shop is open and what it sells, and the tag rules. The AI is told gold and prices are server-managed, that shopping happens in the app panel, and that it must not narrate prices, totals or completed purchases, nor award gold without a reason (`small` for a minor find, `large` only for a major reward).

## Routes (Bearer-authenticated like `turn-order` and `inventory/equip`)

- `POST /api/campaigns/[id]/shop` `{ action: 'buy' | 'sell', itemId, customName? }`: loads the caller's player, pack and gold and the campaign's `current_shop`, applies the pure rule, calls `apply_changes`, posts a `stats` log line (`Prem ซื้อ ดาบสั้น (−30 ทอง)`, `Prem ขาย ยาฟื้นฟูเล็ก (+5 ทอง)`). Errors map to `{ error: reason }` with 400/403/409.
- `POST /api/campaigns/[id]/trades` with `action`:
  - `propose` `{ toPlayerId, giveItems, giveGold, wantItems, wantGold }` (proposer is the caller; must own what they give and have the gold; at most 3 pending proposals per player; at least something on one side).
  - `accept` / `decline` `{ tradeId }` (only `to_player`); accept re-validates everything against current packs, weights and gold, then calls `apply_changes(…, trade_id)` so both players and the trade change together. A pending proposal older than 30 minutes is treated as expired and refused.
  - `cancel` `{ tradeId }` (only `from_player`).
  - Accepted trades post a `stats` log line (`Prem แลกกับ Suki: ให้ ดาบสั้น ได้ 20 ทอง`).

## UI

- Gold appears on the inventory card header and on each player's row in `PlayerOrder`.
- `Shop` card in the side rail, visible only while `current_shop` is set (realtime via the existing campaign subscription): merchant name, items for sale with price and a buy button (disabled with the reason when it cannot be afforded or carried), and "ขายของคุณ" listing the player's sellable items with the sell price.
- `Trades` card: "เสนอแลก" opens a small form (pick a player, choose items and gold each way) and lists incoming proposals with ตกลง/ปฏิเสธ and outgoing ones with ยกเลิก. Realtime on `trades`.
- Buying, selling and trading never touch the round's action, `ActionInput` or the round timer.

## Testing

Test-first, dependency-injected like the rest of the code:

- Prices and gold tiers; `buyFromShop`/`sellToShop` (every reason, weight, auto-equip); `validateTrade`/`applyTrade` (missing items, insufficient gold, full pack, equipped item given away, empty request = gift).
- Tag parsing for the new tags, including malformed ones and unknown shop ids.
- `processRound`: gold and pay tags (clamped), shop open/close, shop closes on scene change, failures don't block the round or the stats line.
- `roundRepository` mapping (gold on characters, `current_shop`, `apply_changes` call shape).
- Routes: auth, validation, each error path, the 3-pending limit, expiry.
- The `apply_changes` function is verified against the live database: overspend rolls back everything, a double accept of the same trade applies once, a client with the anon/authenticated role cannot call it.
- Components: `Shop`, `Trades`, gold display.

The migration is applied to the live Supabase project through the browser SQL editor and verified before deploying, per the standing instruction.

## Known limitations

- A purchase made while the DM is writing a round can race with that round's gold save: both go through `apply_changes` / atomic deltas so gold cannot go negative or be lost, but the stats lines may interleave.
- No price changes by place or story; every merchant charges base price and pays half.
- The AI can over-award gold or open shops too often; the prompt constrains it, but this is model behavior, not enforced.
- Story-item trades match the title exactly as stored.
- A trade involving an item the giver is actively wearing unequips it with no confirmation step.

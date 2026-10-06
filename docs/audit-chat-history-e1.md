# E1 audit: ประวัติแชทที่ส่งเข้า AI / Chat history sent to the AI

## How messages are loaded
- `roundRepository.ts` (~L166-176): `from('messages').select('role, content').eq('campaign_id', id)`,
  optionally `.gt('created_at', <opened_at of the round covered by campaign_summary>)`,
  `order created_at desc`, `limit(40)`, then `.reverse()` -> `recentMessages`.
- `assemblePrompt.ts` (L53-55): maps every message to `ROLE: content` and joins with newlines under
  "Recent narration and dialogue:". No filtering at all.

## Role filtering?
- **No.** Neither the query nor `assemblePrompt` filters by `role` (ไม่มีการกรอง role เลย).
- DB: `messages.role` is `check (role in ('dm','player','system'))` (`0001_init_schema.sql` L43);
  no later migration changes it. There is no `ooc`/`ask` role or flag yet.
- Rows written today: `player` (action text), `dm` (narration, opening in `startCampaign.ts`),
  `system` (JSON `{type:'rolls'}` / `{type:'stats'}` from roundRepository, shop notices in `serverShop.ts`).
  All of these, including the JSON system rows, currently reach the prompt.
- Side note: the 40-row limit counts every row, so OOC/ask rows would also push real history out of the window.

## What E2 must change
1. Decide how OOC/ask messages are stored: either widen the role check constraint (new migration, next number 0019+)
   or keep `role` and add a `kind`/`channel` column (e.g. `story` default, `ooc`, `ask`). Code must tolerate the column
   missing in production (best effort).
2. Filter at the query in `roundRepository.ts` (not only in `assemblePrompt`) so the `limit(40)` window is filled with story rows only
   (e.g. `.in('role', ['dm','player','system'])` or `.eq('kind','story')`/`.is('kind', null)`).
3. Optionally defensively filter again in `assemblePrompt`.
4. E2 test must assert: `ooc` and `ask` messages never appear in the prompt / `recentMessages`, and that the 40-limit is applied after filtering.
   Put a comment summarizing this audit at the top of that test.

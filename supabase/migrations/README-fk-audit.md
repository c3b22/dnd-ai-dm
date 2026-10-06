# FK audit: campaigns / players (task A1, 2026-10-06)

Scope: every `supabase/migrations/*.sql` (0001-0015). Conclusion: deleting ONE row
from `campaigns` removes all child data; deleting ONE row from `players` removes
all of that player's data. No migration needed.

## References to campaigns(id)  (all `on delete cascade`)
| table | column | source |
|---|---|---|
| players | campaign_id | 0001 |
| rounds | campaign_id | 0001 |
| messages | campaign_id | 0001 |
| game_state | campaign_id (pk) | 0001 |
| campaign_summary | campaign_id (pk) | 0001 |
| inventory_items | campaign_id | 0008 |
| trades | campaign_id | 0010 |

## References to players(id)
| table | column | action | source |
|---|---|---|---|
| round_actions | player_id | cascade | 0001 |
| inventory_items | player_id | cascade | 0008 |
| trades | from_player_id, to_player_id | cascade | 0010 |
| round_actions | ability_target_id | set null | 0015_classes |

(Leaving a campaign = deleting a `players` row: a trade the player is on either
side of is deleted; another player's action targeting them just loses its target.)

## References to rounds(id)
| table | column | action |
|---|---|---|
| round_actions | round_id | cascade |
| messages | round_id | set null |
| campaigns | current_round_id | NO ACTION (0001, `campaigns_current_round_fk`) |
| campaign_summary | covers_up_to_round | NO ACTION (0001) |

## The two NO ACTION FKs: not a blocker
`DELETE FROM campaigns WHERE id = X` cascades to `rounds`, but the only rows that
reference those rounds with NO ACTION (the campaigns row itself and its
campaign_summary row) are deleted in the same statement. NO ACTION is checked at
end of statement, when no referencing row remains, so no violation occurs
(unlike RESTRICT, which checks immediately). Therefore a single campaigns delete
succeeds.

Caveat for future code: deleting a single `rounds` row that is the campaign's
`current_round_id` (or a summary's `covers_up_to_round`) WILL fail. Nothing in A1-A5
does that; if it is ever needed, null the reference first or change the FK to
`on delete set null`.

## Not tied to campaigns/players
`custom_adventures.owner_id -> auth.users(id)` cascade only; `campaigns.adventure_id`
is plain text (no FK), so deleting a campaign never touches adventures.

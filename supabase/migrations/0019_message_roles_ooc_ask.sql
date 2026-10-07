-- E2: new message kinds and the speaker.
--   ooc        = team chat between players (never sent to the AI)
--   ask        = a player's question to the DM (never sent to the AI story prompt)
--   ask_answer = the DM's answer to an ask
-- player_id identifies the speaker (used for the ask quota and for showing names).
alter table messages drop constraint if exists messages_role_check;
alter table messages
  add constraint messages_role_check
  check (role in ('dm', 'player', 'system', 'ooc', 'ask', 'ask_answer'));

alter table messages
  add column if not exists player_id uuid null references players(id) on delete set null;

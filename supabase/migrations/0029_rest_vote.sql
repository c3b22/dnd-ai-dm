-- J2: team rest vote. campaigns.rest_vote = {"kind":"short"|"long","proposerId":playerId,"agree":[playerId],
-- "roundId":uuid,"status":"open"|"passed"}; NULL = no vote. A vote whose roundId is no longer the campaign's
-- current_round_id counts as expired (app code ignores it). `campaigns` is already in the supabase_realtime
-- publication (0001_init_schema.sql), so this column syncs realtime like current_encounter with no extra step.
-- App code tolerates both columns being absent in production.
alter table campaigns add column if not exists rest_vote jsonb;

-- Short rests taken since the last long rest (max 2, see src/lib/character/restConstants.ts).
alter table players add column if not exists short_rests_used int not null default 0;

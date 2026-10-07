-- K2: data structure for several abilities per character (see docs/class-options-draft.md).
-- players.ability_cooldowns = { "<ability id>": cooldown left } for every ability beyond the class's main
-- one; the main ability (id = class id) keeps using players.ability_cooldown, so old rows read as before.
-- players.subclass_id = chosen subclass (K5); players.ability_picks = { "6": "<id>", "9": "<id>" } (K6);
-- players.spell_slots_used = spell slots spent since the last rest (K3).
-- round_actions.ability_id / spell_id = which ability or spell the player picked (null = the main ability).
-- App code tolerates every one of these columns being absent in production.
alter table players add column if not exists ability_cooldowns jsonb;
alter table players add column if not exists subclass_id text;
alter table players add column if not exists ability_picks jsonb;
alter table players add column if not exists spell_slots_used int not null default 0;

alter table round_actions add column if not exists ability_id text;
alter table round_actions add column if not exists spell_id text;

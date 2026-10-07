-- D1: six D&D ability scores per player, {"STR":10,"DEX":10,"CON":10,"INT":10,"WIS":10,"CHA":10}.
-- NULL = not set; app code treats NULL / missing keys as 10 (see normalizeAbilities).
alter table players add column if not exists abilities jsonb;

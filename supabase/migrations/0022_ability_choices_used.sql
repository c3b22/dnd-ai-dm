-- F4a: ability score improvements already spent (earned at levels 4 and 8; see abilityChoicesAvailable).
-- App code must tolerate this column being absent in production (treat as 0).
alter table players add column if not exists ability_choices_used int not null default 0;

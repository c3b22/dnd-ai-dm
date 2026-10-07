-- F5e: the enemy a scroll is aimed at, chosen when the action is submitted (free text enemy name, nullable).
-- NULL = no target. App code must tolerate this column being absent in production (scrolls are then simply not used).
alter table round_actions add column if not exists item_target text;

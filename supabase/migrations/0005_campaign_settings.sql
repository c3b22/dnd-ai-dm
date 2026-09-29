-- Owner-adjustable table rules: round time, narration length, difficulty, dice, who can reorder.
alter table campaigns add column if not exists settings jsonb not null default '{}'::jsonb;

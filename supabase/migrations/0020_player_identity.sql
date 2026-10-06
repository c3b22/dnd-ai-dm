-- F1: character identity text fields per player (all nullable; API caps each at 500 chars).
-- NULL = not set. App code must tolerate these columns being absent in production.
alter table players add column if not exists backstory text;
alter table players add column if not exists personality text;
alter table players add column if not exists goal text;

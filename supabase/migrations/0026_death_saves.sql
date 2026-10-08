-- H1: death save tally while a character is at 0 HP: {"successes":0-3,"failures":0-3,"stable":bool,"dead":bool}.
-- null = no saves in progress. App code must tolerate this column being absent in production
-- (death saves then simply do not persist between rounds).
alter table players add column if not exists death_saves jsonb;

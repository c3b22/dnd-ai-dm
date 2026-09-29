-- A waiting room before play starts: a short code to invite by, and the moment the owner starts the game.
alter table campaigns add column if not exists join_code text;
alter table campaigns add column if not exists started_at timestamptz;
create unique index if not exists campaigns_join_code_key on campaigns (join_code) where join_code is not null;

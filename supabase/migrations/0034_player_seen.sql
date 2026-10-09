-- S1: track when each player last opened the room and the round they last saw (for the "previously on..." recap),
-- plus a per-player cache of generated recaps. Written only by the server (service role); the owner may read.
alter table players add column if not exists last_seen_at timestamptz;
alter table players add column if not exists last_seen_round_id uuid;

create table if not exists player_recaps (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  from_round_id uuid,
  to_round_id uuid,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists player_recaps_player_idx on player_recaps (player_id, created_at desc);

alter table player_recaps enable row level security;
drop policy if exists "players can read their own recaps" on player_recaps;
create policy "players can read their own recaps"
  on player_recaps for select
  using (
    exists (
      select 1 from players
      where players.id = player_recaps.player_id
      and players.user_id = auth.uid()
    )
  );
-- no insert/update/delete policies: only the service role writes.

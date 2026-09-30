alter table players add column if not exists hp int not null default 20;
alter table players add column if not exists max_hp int not null default 20;
alter table players add column if not exists weapon_id text;
alter table players add column if not exists status text not null default 'active'
  check (status in ('active', 'downed'));
alter table players add column if not exists revives_since_sanctuary int not null default 0;

alter table campaigns add column if not exists pending_wipe boolean not null default false;

-- A downed player cannot act, even from a modified client.
drop policy if exists "players can submit only their own action" on round_actions;
create policy "players can submit only their own action"
  on round_actions for insert
  with check (
    exists (
      select 1 from players
      where players.id = round_actions.player_id
      and players.user_id = auth.uid()
      and players.status = 'active'
    )
  );

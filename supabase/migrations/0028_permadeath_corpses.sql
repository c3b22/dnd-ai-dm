-- H3a: permanent death (rooms with settings.permadeath only).
-- 1) players.status may now also be 'dead'. App code tolerates this migration being absent in production:
--    saving a dead character then falls back to 'downed' and no corpse is written.
-- 2) campaign_corpses holds what a dead character left behind (pack as jsonb, gold) for the table to loot (H3c).
do $$
declare con text;
begin
  for con in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.players'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%' and pg_get_constraintdef(c.oid) ilike '%downed%'
  loop
    execute format('alter table players drop constraint %I', con);
  end loop;
end $$;

alter table players add constraint players_status_check check (status in ('active', 'downed', 'dead'));

create table if not exists campaign_corpses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  gold int not null default 0 check (gold >= 0),
  created_at timestamptz not null default now()
);

create index if not exists campaign_corpses_campaign_idx on campaign_corpses (campaign_id);

alter table campaign_corpses enable row level security;

-- Members may read; all writes go through the server (service-role key).
drop policy if exists "members can view campaign corpses" on campaign_corpses;
create policy "members can view campaign corpses"
  on campaign_corpses for select
  using (is_campaign_member(campaign_corpses.campaign_id));

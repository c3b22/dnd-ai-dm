-- G1: durable world memory per campaign. kind = 'npc' (key = NPC name, value = attitude),
-- 'quest' (key = quest name, value = 'open' | 'done'), 'clue' (key = null, value = clue text).
create table if not exists campaign_facts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null check (kind in ('npc', 'quest', 'clue')),
  key text,
  value text not null,
  updated_at timestamptz not null default now(),
  -- npc and quest facts are identified by name; only clues may have no key.
  check (kind = 'clue' or key is not null),
  -- Postgres treats NULLs as distinct in a unique constraint, so (campaign, 'npc'/'quest', name)
  -- is deduped (upsert target for G2) while clues with a NULL key may legitimately repeat: many
  -- rows per campaign. Do not coalesce the key; that would collapse all clues into one row.
  unique (campaign_id, kind, key)
);

create index if not exists campaign_facts_campaign_idx on campaign_facts (campaign_id, kind);

alter table campaign_facts enable row level security;

-- Members read facts; all writes go through the server (service-role key).
drop policy if exists "members can view campaign facts" on campaign_facts;
create policy "members can view campaign facts"
  on campaign_facts for select
  using (is_campaign_member(campaign_facts.campaign_id));

do $$
begin
  alter publication supabase_realtime add table campaign_facts;
exception when duplicate_object then null;
end $$;

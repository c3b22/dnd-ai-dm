-- F5f: magic items the server has already handed out per campaign, so [[magic]] draws never repeat
-- until a pool is used up, and at most one legendary per campaign.
-- App code must tolerate this table being absent in production (then [[magic]] tags are ignored).
create table if not exists campaign_magic_given (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  item_id text not null,
  given_at timestamptz not null default now()
);

create index if not exists campaign_magic_given_campaign_idx on campaign_magic_given (campaign_id);

alter table campaign_magic_given enable row level security;

-- Members may read; all writes go through the server (service-role key).
drop policy if exists "members can view campaign magic given" on campaign_magic_given;
create policy "members can view campaign magic given"
  on campaign_magic_given for select
  using (is_campaign_member(campaign_magic_given.campaign_id));

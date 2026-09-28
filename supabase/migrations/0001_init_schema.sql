create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  current_round_id uuid
);

create table players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'closed')),
  opened_at timestamptz not null default now(),
  processing_started_at timestamptz
);

alter table campaigns
  add constraint campaigns_current_round_fk
  foreign key (current_round_id) references rounds(id);

create table round_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  action_text text not null,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  round_id uuid references rounds(id) on delete set null,
  role text not null check (role in ('dm', 'player', 'system')),
  content text not null default '',
  created_at timestamptz not null default now()
);

create table game_state (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table campaign_summary (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  summary text not null default '',
  covers_up_to_round uuid references rounds(id),
  updated_at timestamptz not null default now()
);

alter table campaigns enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table round_actions enable row level security;
alter table messages enable row level security;
alter table game_state enable row level security;
alter table campaign_summary enable row level security;

create or replace function is_campaign_member(target_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from players
    where players.campaign_id = target_campaign_id
    and players.user_id = auth.uid()
  );
$$;

create policy "players can view their campaigns"
  on campaigns for select
  using (is_campaign_member(campaigns.id));

create policy "users can view players in their campaigns"
  on players for select
  using (is_campaign_member(players.campaign_id));

create policy "users can join a campaign as themselves"
  on players for insert
  with check (user_id = auth.uid());

create policy "players can view rounds in their campaigns"
  on rounds for select
  using (is_campaign_member(rounds.campaign_id));

create policy "players can view round actions in their campaigns"
  on round_actions for select
  using (
    exists (
      select 1 from rounds
      where rounds.id = round_actions.round_id
      and is_campaign_member(rounds.campaign_id)
    )
  );

create policy "players can submit only their own action"
  on round_actions for insert
  with check (
    exists (
      select 1 from players
      where players.id = round_actions.player_id
      and players.user_id = auth.uid()
    )
  );

create policy "players can view messages in their campaigns"
  on messages for select
  using (is_campaign_member(messages.campaign_id));

create policy "players can view game state in their campaigns"
  on game_state for select
  using (is_campaign_member(game_state.campaign_id));

create policy "players can view campaign summary in their campaigns"
  on campaign_summary for select
  using (is_campaign_member(campaign_summary.campaign_id));

alter publication supabase_realtime add table messages, round_actions, campaigns;

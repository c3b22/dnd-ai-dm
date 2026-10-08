-- L2: campaign end. campaigns had no status column before this; a room is 'active' until the DM's [[campaign_end]]
-- is accepted (server-side, see lib/campaign/campaignEnd.ts), then 'ended'. chapter counts the sequels (L5 bumps it).
alter table campaigns add column if not exists status text not null default 'active';
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check check (status in ('active', 'ended'));
alter table campaigns add column if not exists chapter int not null default 1;

-- An ended campaign takes no new action, even from a modified client (the submit/ask/rest APIs answer 409).
drop policy if exists "players can submit only their own action" on round_actions;
create policy "players can submit only their own action"
  on round_actions for insert
  with check (
    exists (
      select 1 from players
      join campaigns on campaigns.id = players.campaign_id
      where players.id = round_actions.player_id
      and players.user_id = auth.uid()
      and players.status = 'active'
      and campaigns.status <> 'ended'
    )
  );

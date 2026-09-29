-- Players choose who acts first in a round; the DM resolves actions in this order.
alter table players add column if not exists turn_order int;

-- Number existing players by join order so every campaign starts with a complete order.
update players
set turn_order = ranked.position
from (
  select id, row_number() over (partition by campaign_id order by created_at, id) as position
  from players
) as ranked
where players.id = ranked.id and players.turn_order is null;

-- Let clients see order changes live.
do $$
begin
  alter publication supabase_realtime add table players;
exception when duplicate_object then null;
end $$;

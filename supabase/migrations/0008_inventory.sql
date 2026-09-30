create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  item_id text not null,
  custom_name text not null default '',
  quantity int not null check (quantity > 0),
  slot text check (slot in ('weapon', 'armor')),
  equipped boolean not null default false,
  unique (player_id, item_id, custom_name)
);

-- At most one equipped weapon and one equipped armor per player, even if application code has a bug.
create unique index if not exists inventory_one_equipped_per_slot
  on inventory_items (player_id, slot) where equipped;

alter table inventory_items enable row level security;

-- Members read inventories. There is deliberately no insert/update/delete policy:
-- every write goes through the server with the service-role key.
drop policy if exists "members can view inventories" on inventory_items;
create policy "members can view inventories"
  on inventory_items for select
  using (is_campaign_member(inventory_items.campaign_id));

do $$
begin
  alter publication supabase_realtime add table inventory_items;
exception when duplicate_object then null;
end $$;

-- Drinking a potion is a round action naming the item; the server validates ownership.
alter table round_actions add column if not exists use_item_id text;

-- Existing players: their weapon becomes an equipped item, and everyone gets one minor potion.
insert into inventory_items (campaign_id, player_id, item_id, quantity, slot, equipped)
select campaign_id, id, weapon_id, 1, 'weapon', true
from players
where weapon_id in ('shortsword', 'shortbow', 'staff')
on conflict do nothing;

insert into inventory_items (campaign_id, player_id, item_id, quantity, slot, equipped)
select campaign_id, id, 'potion_minor', 1, null, false
from players
on conflict do nothing;

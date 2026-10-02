-- Personal gold. Everyone starts with 20; it can never go negative.
alter table players add column if not exists gold int not null default 20 check (gold >= 0);

-- The open merchant shop, if any: { "name": string, "itemIds": string[] }.
alter table campaigns add column if not exists current_shop jsonb;

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  from_player_id uuid not null references players(id) on delete cascade,
  to_player_id uuid not null references players(id) on delete cascade,
  give_items jsonb not null default '[]'::jsonb,
  give_gold int not null default 0 check (give_gold >= 0),
  want_items jsonb not null default '[]'::jsonb,
  want_gold int not null default 0 check (want_gold >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_player_id <> to_player_id)
);

alter table trades enable row level security;

-- Members read trades; all writes go through the server (service-role key).
drop policy if exists "members can view trades" on trades;
create policy "members can view trades"
  on trades for select
  using (is_campaign_member(trades.campaign_id));

do $$
begin
  alter publication supabase_realtime add table trades;
exception when duplicate_object then null;
end $$;

-- The one way gold and items move outside a round. `changes` is a JSON array of
-- { "playerId": uuid, "goldDelta": int, "clamp": bool?,
--   "items": [ { itemId, customName, quantity, slot, equipped } ] | null,
--   "baseItems": [ { itemId, customName, quantity } ] | null }
-- where items, when present, is that player's complete new item list, and baseItems, when
-- present, is the item list the caller read before computing it (item_id/custom_name/quantity
-- only). Everything happens in one transaction: an overspend (gold check, unless clamp is true),
-- a trade that is no longer pending, or a baseItems mismatch (someone else changed this player's
-- items between the caller's read and this call) aborts the whole call with no partial effect.
create or replace function apply_changes(changes jsonb, trade_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  item jsonb;
  pid uuid;
  cid uuid;
  live record;
  occupied text[];
  want_equipped boolean;
  delta int;
  mismatch boolean;
begin
  -- Lock every affected player row in id order so two concurrent calls cannot deadlock, and so
  -- they serialize: a second call only sees this transaction's writes once it can take the lock.
  perform 1 from players
    where id in (select (c->>'playerId')::uuid from jsonb_array_elements(changes) c)
    order by id
    for update;

  for change in select * from jsonb_array_elements(changes) loop
    pid := (change->>'playerId')::uuid;
    select campaign_id into cid from players where id = pid;
    if cid is null then
      raise exception 'unknown player %', pid;
    end if;

    if jsonb_typeof(change->'items') = 'array' then
      if jsonb_typeof(change->'baseItems') = 'array' then
        -- The item list this call computed assumed the pack looked like baseItems. If the live
        -- pack has since changed (another call landed first), applying that computed list would
        -- silently duplicate or lose items/gold. Refuse instead; the caller can retry.
        select exists (
          (
            select item_id, custom_name, quantity from inventory_items where player_id = pid
            except
            select b->>'itemId', coalesce(b->>'customName', ''), (b->>'quantity')::int
            from jsonb_array_elements(change->'baseItems') b
          )
          union all
          (
            select b->>'itemId', coalesce(b->>'customName', ''), (b->>'quantity')::int
            from jsonb_array_elements(change->'baseItems') b
            except
            select item_id, custom_name, quantity from inventory_items where player_id = pid
          )
        ) into mismatch;
        if mismatch then
          raise exception 'inventory changed concurrently for player %', pid using errcode = 'EC001';
        end if;
      end if;

      -- Rows no longer listed go first, which also frees their equipment slots.
      delete from inventory_items i
       where i.player_id = pid
         and not exists (
           select 1 from jsonb_array_elements(change->'items') it
            where it->>'itemId' = i.item_id
              and coalesce(it->>'customName', '') = i.custom_name
         );

      select coalesce(array_agg(slot), '{}') into occupied
        from inventory_items
       where player_id = pid and equipped and slot is not null;

      for item in select * from jsonb_array_elements(change->'items') loop
        select * into live from inventory_items
         where player_id = pid
           and item_id = item->>'itemId'
           and custom_name = coalesce(item->>'customName', '');
        if found then
          -- Keep the equipped flag the database has now; only the quantity changes.
          update inventory_items set quantity = (item->>'quantity')::int where id = live.id;
        else
          want_equipped := coalesce((item->>'equipped')::boolean, false)
            and (item->>'slot') is not null
            and not ((item->>'slot') = any(occupied));
          insert into inventory_items (campaign_id, player_id, item_id, custom_name, quantity, slot, equipped)
          values (cid, pid, item->>'itemId', coalesce(item->>'customName', ''),
                  (item->>'quantity')::int, item->>'slot', want_equipped);
          if want_equipped then
            occupied := occupied || (item->>'slot');
          end if;
        end if;
      end loop;
    end if;

    delta := coalesce((change->>'goldDelta')::int, 0);
    if delta <> 0 then
      if coalesce((change->>'clamp')::boolean, false) then
        -- Used for round-triggered gold (the server already clamped a `pay` against the gold it
        -- read at round start; if that is now stale, floor at 0 instead of raising, so one
        -- player's inconsistency never rolls back every other player's gold in the same round.
        update players set gold = greatest(0, gold + delta) where id = pid;
      else
        update players set gold = gold + delta where id = pid;  -- check (gold >= 0) rolls everything back
      end if;
    end if;
  end loop;

  if trade_id is not null then
    update trades set status = 'accepted', resolved_at = now() where id = trade_id and status = 'pending';
    if not found then
      raise exception 'trade is not pending';
    end if;
  end if;
end;
$$;

-- PostgREST exposes functions to signed-in clients by default; this one must only be callable
-- with the service-role key, or any player could mint gold.
revoke execute on function apply_changes(jsonb, uuid) from public, anon, authenticated;
grant execute on function apply_changes(jsonb, uuid) to service_role;

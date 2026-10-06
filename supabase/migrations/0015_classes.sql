-- Classes and active abilities. players.class_id picks the class (null = classless, the way every
-- player was before); ability_cooldown counts the eventful rounds left before the ability is
-- ready again. A round action can flag that it uses the ability, with an optional ally target.
alter table players add column if not exists class_id text
  check (class_id in ('warrior', 'archer', 'cleric', 'rogue'));
alter table players add column if not exists ability_cooldown int not null default 0
  check (ability_cooldown >= 0);

alter table round_actions add column if not exists use_ability boolean not null default false;
alter table round_actions add column if not exists ability_target_id uuid references players(id) on delete set null;

-- Extend apply_changes so a round's HP/status/revive changes save the same way gold and items
-- already do: every character in one call, inside the one transaction apply_changes already
-- runs in, so a failure partway (a bad row, a dropped connection) leaves no one's HP changed
-- instead of leaving whichever players were processed first out of sync with the rest.
-- hp/maxHp/status/revivesSinceSanctuary are each optional and, when present, set directly (the
-- caller already computed the next value; there is no delta or concurrency check to make here,
-- unlike items/gold, since nothing outside round processing writes these columns).
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

    if change ? 'hp' then
      update players set
        hp = (change->>'hp')::int,
        max_hp = coalesce((change->>'maxHp')::int, max_hp),
        status = coalesce(change->>'status', status),
        revives_since_sanctuary = coalesce((change->>'revivesSinceSanctuary')::int, revives_since_sanctuary),
        xp = coalesce((change->>'xp')::int, xp),
        ability_cooldown = coalesce((change->>'abilityCooldown')::int, ability_cooldown)
      where id = pid;
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

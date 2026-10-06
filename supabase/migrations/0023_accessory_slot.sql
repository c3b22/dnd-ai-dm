-- F5d: allow the 'accessory' equipment slot (one worn accessory per player by default).
-- The existing unique index inventory_one_equipped_per_slot (player_id, slot) where equipped
-- already enforces "one equipped item per slot", so it stays correct for 'accessory' as-is.
-- App code must tolerate this migration not being applied yet (accessories just cannot be stored until then).
alter table inventory_items drop constraint if exists inventory_items_slot_check;
alter table inventory_items
  add constraint inventory_items_slot_check check (slot in ('weapon', 'armor', 'accessory'));

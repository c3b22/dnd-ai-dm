-- C1: the active combat encounter, if any (shape validated in app code), like current_shop.
-- NULL = no encounter. `campaigns` is already in the supabase_realtime publication
-- (0001_init_schema.sql), so changes to this column sync realtime with no extra step.
alter table campaigns add column if not exists current_encounter jsonb;

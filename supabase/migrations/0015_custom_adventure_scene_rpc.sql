-- Sets one scene's imagePath in a single UPDATE, so two near-simultaneous uploads for
-- different scenes of the same adventure can't overwrite each other's change (a
-- read-then-write from the app would start both from the same stale scenes snapshot).
-- Callable only by the service role, which the upload route uses after its own
-- ownership checks.
create or replace function update_custom_adventure_scene_image(
  p_adventure_id uuid,
  p_key text,
  p_image_path text
) returns void
language sql
as $$
  update custom_adventures
  set scenes = (
    select coalesce(jsonb_agg(
      case when elem->>'key' = p_key
        then jsonb_set(elem, '{imagePath}', to_jsonb(p_image_path))
        else elem
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(scenes) as elem
  )
  where id = p_adventure_id;
$$;

revoke execute on function update_custom_adventure_scene_image(uuid, text, text) from public, anon, authenticated;

-- Guard against a malformed row (e.g. written directly with the anon key, bypassing the
-- app's own validation) poisoning every round of every campaign that uses it.
-- CASE, not AND: Postgres doesn't guarantee AND evaluation order, and jsonb_array_length
-- raises on a non-array instead of failing the check cleanly.
alter table custom_adventures
  add constraint custom_adventures_acts_shape
  check (case when jsonb_typeof(acts) = 'array' then jsonb_array_length(acts) >= 1 else false end);

alter table custom_adventures
  add constraint custom_adventures_npcs_shape
  check (jsonb_typeof(npcs) = 'array');

alter table custom_adventures
  add constraint custom_adventures_scenes_shape
  check (jsonb_typeof(scenes) = 'array');

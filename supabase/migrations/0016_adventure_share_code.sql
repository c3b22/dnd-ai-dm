-- B1: share code for custom adventures (link/code sharing).
-- NULL = not shared. Unique among non-null values. RLS is intentionally untouched.
alter table custom_adventures add column share_code text;

create unique index custom_adventures_share_code_key
  on custom_adventures (share_code)
  where share_code is not null;

-- L1: running per-campaign statistics (defeated enemies by tier, gold earned, magic items found, downs/deaths,
-- rounds played, nat 20 checks). Updated best-effort by processRound; null = nothing counted yet.
alter table campaigns add column if not exists stats jsonb;

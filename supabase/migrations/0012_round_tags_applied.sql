-- Marks when a round's HP/inventory/gold tags have been applied, so a round that generated its
-- narration and applied its effects but then failed or timed out before closing (claimRound's
-- staleness window lets it be picked up again) does not regenerate narration, re-roll dice, or
-- re-apply the same hurt/heal/give/take/gold effects a second time on top of the first attempt's
-- already-saved state.
alter table rounds add column if not exists tags_applied_at timestamptz;

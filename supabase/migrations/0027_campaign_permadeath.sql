-- H2: permadeath lives inside campaigns.settings (jsonb, see 0005) as {"permadeath": boolean}.
-- No schema change is needed: normalizeSettings() treats a missing key as false, so this is a documented no-op.
select 1;

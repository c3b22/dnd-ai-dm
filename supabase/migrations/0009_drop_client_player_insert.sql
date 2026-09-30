-- Players are only ever created by the server (service-role key: createCampaign / joinCampaign).
-- This policy let any signed-in client insert its own players row straight through PostgREST,
-- with any hp / max_hp / weapon, into any campaign whose id it knew. Nothing in the app uses it.
drop policy if exists "users can join a campaign as themselves" on players;

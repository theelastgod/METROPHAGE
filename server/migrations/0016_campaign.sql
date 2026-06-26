-- Path A: full per-player campaign arc in the shared world (replaces quest_step index).
-- JSON blob matches src/net/campaign.ts CampaignData.
ALTER TABLE players ADD COLUMN campaign TEXT NOT NULL DEFAULT '{"activeId":null,"stage":0,"progress":0,"completed":[],"flags":[]}';
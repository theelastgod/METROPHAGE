// Back-compat shim — the Blank micro-questline is superseded by the full campaign.
export {
  Campaign as CampaignEngine,
  Campaign,
  campaignHud,
  CAMPAIGN_DONE_TEXT,
  parseCampaign,
  serializeCampaign,
  DEFAULT_CAMPAIGN,
  type CampaignData,
} from "./campaign";
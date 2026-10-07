export type FactKind = "npc" | "quest" | "clue";

/** A row of `campaign_facts` (see migration 0021). `key` is null only for clues. */
export interface CampaignFact {
  id: string;
  campaignId: string;
  kind: FactKind;
  key: string | null;
  value: string;
  updatedAt: string;
}

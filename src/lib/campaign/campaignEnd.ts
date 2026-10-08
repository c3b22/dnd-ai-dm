import type { SupabaseClient } from '@supabase/supabase-js';
import type { CharacterTag } from '@/lib/character/tags';
import type { Encounter } from '@/lib/combat/encounter';
import type { CampaignStats } from './stats';

/** L2: the fewest rounds played in a chapter before the DM's [[campaign_end]] is believed. */
export const MIN_CHAPTER_ROUNDS = 15;

export const CAMPAIGN_ENDED_MESSAGE = 'แคมเปญนี้จบแล้ว ไม่รับการกระทำใหม่';

/** Rounds played in the current chapter (stats.rounds counts every chapter; chapterBase is where this one began). */
export function chapterRounds(stats: CampaignStats): number {
  return Math.max(0, stats.rounds - (stats.chapterBase ?? 0));
}

/**
 * Whether the round's tags really end the campaign: the DM said so, no fight is on at the end of the round, and the
 * chapter has run long enough. `stats` null (unknown, e.g. the column is missing) means the tag is ignored.
 */
export function shouldEndCampaign(input: { tags: CharacterTag[]; encounter: Encounter | null; stats: CampaignStats | null }): boolean {
  if (!input.tags.some((t) => t.kind === 'campaign_end')) return false;
  if (input.encounter) return false;
  if (!input.stats) return false;
  return chapterRounds(input.stats) >= MIN_CHAPTER_ROUNDS;
}

/**
 * True when campaigns.status = 'ended'. Best-effort: a missing status column (migration 0033 not applied) or any
 * read failure counts as "not ended" so nothing is blocked by accident.
 */
export async function isCampaignEnded(supabase: SupabaseClient, campaignId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('campaigns').select('status').eq('id', campaignId).maybeSingle();
    if (error) return false;
    return (data as { status?: unknown } | null)?.status === 'ended';
  } catch {
    return false;
  }
}

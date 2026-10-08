import type { SupabaseClient } from '@supabase/supabase-js';
import { applyEnemyTags, type Encounter } from '@/lib/combat/encounter';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import type { EnemyTier } from '@/lib/character/tags';

/** L1: running totals for a campaign, stored in campaigns.stats (jsonb). */
export interface CampaignStats {
  rounds: number;
  defeated: Record<EnemyTier, number>;
  gold: number;
  magicItems: number;
  downs: number;
  deaths: number;
  nat20: number;
}

/** What one round adds to the totals. */
export type StatsDelta = Omit<CampaignStats, 'rounds'> & { rounds?: number };

const TIERS: EnemyTier[] = ['minion', 'normal', 'strong', 'boss'];

export const emptyStats = (): CampaignStats => ({
  rounds: 0,
  defeated: { minion: 0, normal: 0, strong: 0, boss: 0 },
  gold: 0,
  magicItems: 0,
  downs: 0,
  deaths: 0,
  nat20: 0,
});

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Reads a jsonb value from the database; anything odd (null, wrong shape) becomes zeros. */
export function normalizeStats(raw: unknown): CampaignStats {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const d = r.defeated && typeof r.defeated === 'object' ? (r.defeated as Record<string, unknown>) : {};
  for (const t of TIERS) base.defeated[t] = count(d[t]);
  base.rounds = count(r.rounds);
  base.gold = count(r.gold);
  base.magicItems = count(r.magicItems);
  base.downs = count(r.downs);
  base.deaths = count(r.deaths);
  base.nat20 = count(r.nat20);
  return base;
}

/** Adds one round's delta to the totals (negative or junk numbers count as zero). */
export function addStats(current: CampaignStats, delta: StatsDelta): CampaignStats {
  const defeated = { ...current.defeated };
  for (const t of TIERS) defeated[t] += count(delta.defeated?.[t]);
  return {
    rounds: current.rounds + count(delta.rounds),
    defeated,
    gold: current.gold + count(delta.gold),
    magicItems: current.magicItems + count(delta.magicItems),
    downs: current.downs + count(delta.downs),
    deaths: current.deaths + count(delta.deaths),
    nat20: current.nat20 + count(delta.nat20),
  };
}

/** Enemies at 0 pips (not fled) now that were not already at 0 pips before, per tier. */
export function countDefeated(before: Encounter | null, after: Encounter | null): Record<EnemyTier, number> {
  const out = { minion: 0, normal: 0, strong: 0, boss: 0 };
  if (!after) return out;
  const wasDown = new Set((before?.enemies ?? []).filter((e) => e.pip <= 0 || e.fled).map((e) => e.name));
  for (const e of after.enemies) {
    if (e.pip <= 0 && !e.fled && !wasDown.has(e.name)) out[e.tier] += 1;
  }
  return out;
}

/**
 * Enemies defeated in a whole round: by spells, scrolls and attacks (`mid` = the fight after those, `before` = as the
 * round started) plus by the DM's own [[enemy_hurt]] tags. applyEnemyTags drops a fight whose last enemy fell, so the
 * tags are replayed one at a time and the state before each is kept to see who fell.
 */
export function defeatedThisRound(before: Encounter | null, mid: Encounter | null, tags: CharacterTag[]): Record<EnemyTier, number> {
  const out = countDefeated(before, mid);
  let state = mid;
  for (const tag of tags) {
    if (tag.kind !== 'enemy' && tag.kind !== 'enemy_hurt' && tag.kind !== 'enemy_flee' && tag.kind !== 'combat_end') continue;
    const next = applyEnemyTags(state, [tag]);
    if (tag.kind === 'enemy_hurt' && state) {
      if (next) {
        const fallen = countDefeated(state, next);
        for (const t of TIERS) out[t] += fallen[t];
      } else {
        // The fight collapsed: the hurt target was the last active enemy and it fell.
        for (const e of state.enemies) if (e.pip > 0 && !e.fled) out[e.tier] += 1;
      }
    }
    state = next;
  }
  return out;
}

/** Characters that newly went downed / newly died between two snapshots of the party. */
export function countStatusChanges(before: Character[], after: Character[]): { downs: number; deaths: number } {
  const was = new Map(before.map((c) => [c.id, c.status]));
  let downs = 0;
  let deaths = 0;
  for (const c of after) {
    const prev = was.get(c.id);
    if (!prev || prev === c.status) continue;
    if (c.status === 'downed') downs += 1;
    else if (c.status === 'dead') deaths += 1;
  }
  return { downs, deaths };
}

/** Sum of the positive gold deltas (gold earned; spending and corpse transfers are not earnings). */
export function goldEarned(deltas: Record<string, number>): number {
  return Object.values(deltas).reduce((sum, d) => sum + (d > 0 ? d : 0), 0);
}

/**
 * Reads, adds and writes campaigns.stats. Throws when the column is missing or a call fails; the caller
 * (processRound) swallows that, so a broken stats update never stalls a round.
 */
export async function persistCampaignStats(supabase: SupabaseClient, campaignId: string, delta: StatsDelta): Promise<void> {
  const { data, error } = await supabase.from('campaigns').select('stats').eq('id', campaignId).single();
  if (error) throw error;
  const next = addStats(normalizeStats((data as { stats?: unknown } | null)?.stats), delta);
  const { error: updateError } = await supabase.from('campaigns').update({ stats: next }).eq('id', campaignId);
  if (updateError) throw updateError;
}

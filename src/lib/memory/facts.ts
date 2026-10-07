import type { SupabaseClient } from '@supabase/supabase-js';
import type { CharacterTag } from '@/lib/character/tags';
import type { CampaignFact, FactKind } from './types';

/** Longest stored key (NPC / quest name). Longer AI output is cut, not rejected. */
export const MAX_KEY_LENGTH = 80;
/** Longest stored value (attitude, quest status, clue text). */
export const MAX_VALUE_LENGTH = 300;
/** Most facts accepted from a single round's narration; the rest are ignored. */
export const MAX_FACTS_PER_ROUND = 10;
/** Most rows kept per campaign per kind. Existing npc/quest keys can still be updated when full;
 * new keys and new clues are dropped, so a runaway AI cannot grow the table without bound. */
export const MAX_FACTS_PER_KIND = 50;

export interface FactInput {
  kind: FactKind;
  key: string | null;
  value: string;
}

export interface FactWritePlan {
  upserts: FactInput[];
  clues: FactInput[];
}

const clamp = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max).trim();

/** Pure: picks npc/quest/clue tags, clamps them, dedupes npc/quest by key (last wins), caps count. */
export function selectFacts(tags: CharacterTag[]): FactInput[] {
  const byKey = new Map<string, FactInput>();
  const ordered: FactInput[] = [];
  for (const tag of tags) {
    if (tag.kind !== 'npc' && tag.kind !== 'quest' && tag.kind !== 'clue') continue;
    const value = clamp(tag.value, MAX_VALUE_LENGTH);
    if (!value) continue;
    if (tag.kind === 'clue') {
      ordered.push({ kind: 'clue', key: null, value });
      continue;
    }
    const key = clamp(tag.key, MAX_KEY_LENGTH);
    if (!key) continue;
    const id = `${tag.kind}\u0000${key}`;
    const existing = byKey.get(id);
    if (existing) {
      existing.value = value;
    } else {
      const fact: FactInput = { kind: tag.kind, key, value };
      byKey.set(id, fact);
      ordered.push(fact);
    }
  }
  return ordered.slice(0, MAX_FACTS_PER_ROUND);
}

/** Pure: decides what to write given the rows already stored, enforcing the per-kind cap and clue dedupe. */
export function planFactWrites(existing: FactInput[], incoming: FactInput[]): FactWritePlan {
  const counts: Record<FactKind, number> = { npc: 0, quest: 0, clue: 0 };
  const knownKeys = new Set<string>();
  const knownClues = new Set<string>();
  for (const row of existing) {
    counts[row.kind] += 1;
    if (row.kind === 'clue') knownClues.add(row.value);
    else knownKeys.add(`${row.kind}\u0000${row.key}`);
  }
  const plan: FactWritePlan = { upserts: [], clues: [] };
  for (const fact of incoming) {
    if (fact.kind === 'clue') {
      if (knownClues.has(fact.value) || counts.clue >= MAX_FACTS_PER_KIND) continue;
      knownClues.add(fact.value);
      counts.clue += 1;
      plan.clues.push(fact);
      continue;
    }
    const id = `${fact.kind}\u0000${fact.key}`;
    if (!knownKeys.has(id)) {
      if (counts[fact.kind] >= MAX_FACTS_PER_KIND) continue;
      knownKeys.add(id);
      counts[fact.kind] += 1;
    }
    plan.upserts.push(fact);
  }
  return plan;
}

/**
 * Best-effort write of a round's facts (use the service-role client). Never throws: a missing
 * campaign_facts table or any write error is logged and swallowed so round processing is unaffected.
 */
export async function persistFacts(supabase: SupabaseClient, campaignId: string, facts: FactInput[]): Promise<void> {
  if (facts.length === 0) return;
  try {
    const { data, error } = await supabase.from('campaign_facts').select('kind, key, value').eq('campaign_id', campaignId);
    if (error) throw error;
    const plan = planFactWrites((data ?? []) as FactInput[], facts);
    const now = new Date().toISOString();
    const toRow = (f: FactInput) => ({ campaign_id: campaignId, kind: f.kind, key: f.key, value: f.value, updated_at: now });
    if (plan.upserts.length > 0) {
      const { error: upsertError } = await supabase
        .from('campaign_facts')
        .upsert(plan.upserts.map(toRow), { onConflict: 'campaign_id,kind,key' });
      if (upsertError) throw upsertError;
    }
    if (plan.clues.length > 0) {
      const { error: insertError } = await supabase.from('campaign_facts').insert(plan.clues.map(toRow));
      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('persistFacts failed (ignored):', error);
  }
}

interface FactRow {
  id: string;
  campaign_id: string;
  kind: FactKind;
  key: string | null;
  value: string;
  updated_at: string;
}

/** Reads a campaign's facts, oldest first. Returns [] if the table is missing or the read fails. */
export async function loadFacts(supabase: SupabaseClient, campaignId: string): Promise<CampaignFact[]> {
  try {
    const { data, error } = await supabase
      .from('campaign_facts')
      .select('id, campaign_id, kind, key, value, updated_at')
      .eq('campaign_id', campaignId)
      .order('updated_at', { ascending: true });
    if (error || !data) return [];
    return (data as FactRow[]).map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      kind: r.kind,
      key: r.key,
      value: r.value,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}

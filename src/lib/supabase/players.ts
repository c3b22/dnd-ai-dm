import { supabaseBrowserClient } from './client';
import { findOwnerId, sortByTurnOrder } from '@/lib/campaign/turnOrder';
import { abilityChoicesAvailable, effectiveMaxHp, levelForXp, type AbilityChoice } from '@/lib/character/leveling';
import { normalizeAbilities, type AbilityScores } from '@/lib/character/constants';
import { fetchCampaignInventories } from './inventory';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';

export interface RoundPlayer {
  id: string;
  displayName: string;
  acted: boolean;
  /** The player who sat down first may arrange everyone. */
  isOwner: boolean;
  hp: number;
  maxHp: number;
  /** Experience points; level is derived from this. */
  xp?: number;
  /** Class id (see classes.ts); null or absent means classless. */
  classId?: string | null;
  /** Eventful rounds left before the class ability is ready. */
  abilityCooldown?: number;
  /** K3/K4: spell slots a mage has spent since the last rest; absent/0 means none (also when the column is not readable yet). */
  spellSlotsUsed?: number;
  /** K7: chosen subclass id; null = none yet; absent when the column is not readable yet. */
  subclassId?: string | null;
  /** K7: abilities picked at Lv6/Lv9; absent when the column is not readable yet. */
  abilityPicks?: Record<string, string>;
  /** K7: cooldown of each extra ability (beyond the class's main one). */
  abilityCooldowns?: Record<string, number>;
  /** Ability scores; absent when the column is not readable yet. */
  abilities?: AbilityScores;
  /** Unspent ability score improvements (level 4 and 8); absent/0 means none. */
  abilityChoicesLeft?: number;
  items: InventoryItem[];
  status: 'active' | 'downed' | 'dead';
  gold: number;
}

export async function fetchRoundPlayers(
  campaignId: string,
  roundId: string | null
): Promise<RoundPlayer[]> {
  const baseColumns = 'id, display_name, turn_order, created_at, hp, max_hp, status, gold, xp, class_id, ability_cooldown';
  const load = (columns: string) =>
    supabaseBrowserClient.from('players').select(columns).eq('campaign_id', campaignId);
  // `abilities` / `ability_choices_used` may be missing on a database without the latest migrations.
  let withAbilities = true;
  let { data: players, error } = await load(`${baseColumns}, abilities, ability_choices_used`);
  if (error) {
    withAbilities = false;
    ({ data: players, error } = await load(baseColumns));
  }
  if (error) throw error;

  // K4: spell slots spent in their own query: players.spell_slots_used may not exist yet, which must not hide the players above.
  const slotsById = new Map<string, number>();
  try {
    const { data: slotRows, error: slotError } = await load('id, spell_slots_used');
    if (!slotError) for (const row of (slotRows ?? []) as any[]) slotsById.set(row.id as string, Number(row.spell_slots_used ?? 0));
  } catch {
    /* unreadable means no slots spent */
  }

  // K7: subclass, picks and per-ability cooldowns in their own query: columns from migration 0030 may not exist yet.
  const optionsById = new Map<string, { subclassId: string | null; abilityPicks: Record<string, string>; abilityCooldowns: Record<string, number> }>();
  try {
    const { data: optionRows, error: optionError } = await load('id, subclass_id, ability_picks, ability_cooldowns');
    if (!optionError) {
      const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
      for (const row of (optionRows ?? []) as any[]) {
        optionsById.set(row.id as string, {
          subclassId: typeof row.subclass_id === 'string' && row.subclass_id ? row.subclass_id : null,
          abilityPicks: Object.fromEntries(Object.entries(obj(row.ability_picks)).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
          abilityCooldowns: Object.fromEntries(Object.entries(obj(row.ability_cooldowns)).map(([k, v]) => [k, Number(v) || 0])),
        });
      }
    }
  } catch {
    /* unreadable means no choices are offered */
  }

  // A database without the inventory table (migration not applied yet) plays with empty packs.
  const inventories = await fetchCampaignInventories(campaignId).catch(() => ({}) as Inventories);

  let actedIds = new Set<string>();
  if (roundId) {
    const { data: actions } = await supabaseBrowserClient
      .from('round_actions')
      .select('player_id')
      .eq('round_id', roundId);
    actedIds = new Set((actions ?? []).map((a: { player_id: string }) => a.player_id));
  }

  const rows = (players ?? []).map((p: any) => ({
    id: p.id as string,
    displayName: p.display_name as string,
    turnOrder: p.turn_order as number | null,
    joinedAt: p.created_at as string,
    items: inventories[p.id] ?? [],
    hp: p.hp as number,
    maxHp: effectiveMaxHp(p.max_hp as number, Number(p.xp ?? 0)),
    xp: Number(p.xp ?? 0),
    classId: (p.class_id ?? null) as string | null,
    abilityCooldown: Number(p.ability_cooldown ?? 0),
    spellSlotsUsed: slotsById.get(p.id as string) ?? 0,
    ...optionsById.get(p.id as string),
    status: p.status as 'active' | 'downed' | 'dead',
    gold: Number(p.gold ?? 0),
    abilities: withAbilities ? normalizeAbilities(p.abilities) : undefined,
    abilityChoicesLeft: withAbilities
      ? abilityChoicesAvailable(levelForXp(Number(p.xp ?? 0)), Number(p.ability_choices_used ?? 0))
      : 0,
  }));
  const ownerId = findOwnerId(rows);
  return sortByTurnOrder(rows).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    acted: actedIds.has(p.id),
    isOwner: p.id === ownerId,
    hp: p.hp,
    maxHp: p.maxHp,
    xp: p.xp,
    classId: p.classId,
    abilityCooldown: p.abilityCooldown,
    spellSlotsUsed: p.spellSlotsUsed,
    subclassId: p.subclassId,
    abilityPicks: p.abilityPicks,
    abilityCooldowns: p.abilityCooldowns,
    items: p.items,
    status: p.status,
    gold: p.gold,
    abilities: p.abilities,
    abilityChoicesLeft: p.abilityChoicesLeft,
  }));
}

export function subscribeToPlayers(campaignId: string, onChange: () => void): () => void {
  const channel = supabaseBrowserClient
    .channel(`players:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `campaign_id=eq.${campaignId}` },
      onChange
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function saveTurnOrder(
  campaignId: string,
  playerId: string,
  orderedPlayerIds: string[]
): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/turn-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ playerId, orderedPlayerIds }),
  });
  if (!response.ok) throw new Error('could not save the turn order');
}

export async function requestAbilityChoice(campaignId: string, choice: AbilityChoice): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/ability-choice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ choice }),
  });
  if (!response.ok) throw new Error('could not save the ability choice');
}

async function postChoice(campaignId: string, path: string, body: object): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`could not save the ${path}`);
}

/** K7: pick the subclass (Lv3); the API lets only the character's own owner do it. */
export const requestSubclassChoice = (campaignId: string, subclassId: string) => postChoice(campaignId, 'subclass-choice', { subclassId });

/** K7: pick the Lv6 / Lv9 ability. */
export const requestAbilityPick = (campaignId: string, abilityId: string) => postChoice(campaignId, 'ability-pick', { abilityId });

export interface RespawnRequest {
  displayName: string;
  classId: string;
  backstory?: string;
  personality?: string;
  goal?: string;
}

/** Replaces the caller's permanently dead character; throws an Error whose message is the API error code. */
export async function requestRespawn(
  campaignId: string,
  request: RespawnRequest
): Promise<{ playerId: string; level: number }> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/respawn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'failed');
  }
  return response.json();
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredMessage, RoundAction } from './assemblePrompt';
import { sortByTurnOrder } from '@/lib/campaign/turnOrder';
import { normalizeSettings, type CampaignSettings } from '@/lib/campaign/settings';
import type { Character } from '@/lib/character/types';
import type { Corpse } from '@/lib/character/permadeath';
import type { CorpseUpdate, LootableCorpse } from '@/lib/character/loot';
import { rowsToInventories, type InventoryRow } from '@/lib/inventory/rows';
import { equippedWeaponId, armorReduction, armorWeight, equippedSkillBonuses, equippedItemEffects, equippedReviveCharm } from '@/lib/inventory/rules';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';
import { normalizeShop } from '@/lib/economy/shop';
import type { ShopState } from '@/lib/economy/apply';
import { normalizeEncounter, type Encounter } from '@/lib/combat/encounter';
import { persistFacts, loadFacts, type FactInput } from '@/lib/memory/facts';
import { loadMagicGiven, persistMagicGiven } from '@/lib/inventory/magicGiven';
import type { CampaignFact } from '@/lib/memory/types';
import { isInventoryConflict } from '@/lib/economy/errors';
import { baseMaxHp, effectiveMaxHp } from '@/lib/character/leveling';
import { normalizeAbilities } from '@/lib/character/constants';
import { normalizeRestVote, type RestVote } from '@/lib/campaign/restVote';
import { normalizeDeathSaves } from '@/lib/character/deathSaves';
import { STORY_MESSAGE_ROLES } from '@/lib/messages/roles';
import type { Adventure } from '@/lib/adventures/adventures';
import { getAdventureById } from '@/lib/adventures/adventures';
import { allowedSceneIdsAsync, sceneInstructionAsync } from '@/lib/scenes/scenes';

export interface RoundContext {
  campaignId: string;
  adventureId: string | null;
  currentSceneId: string | null;
  adventure: Adventure | null;
  allowedSceneIds: string[];
  sceneInstructionText: string;
  settings: CampaignSettings;
  campaignSummary: string;
  recentMessages: StoredMessage[];
  actions: RoundAction[];
  characters: Character[];
  inventories: Inventories;
  pendingWipe: boolean;
  currentShop: ShopState | null;
  /** The fight in progress, or null. Null as well when the column does not exist yet. */
  currentEncounter: Encounter | null;
  /** World memory (npc/quest/clue); [] when the table is missing or unreadable. */
  facts: CampaignFact[];
  /** True once an earlier attempt at this round already applied its HP/inventory/gold tags. */
  tagsApplied: boolean;
  /** Magic item ids this room already received (F5f); null/absent when the table is missing. */
  magicGiven?: string[] | null;
  /** H3c: corpses in this room that still hold something; [] / absent when the table is missing. */
  corpses?: LootableCorpse[];
  /** J3: the team's rest vote when it passed in this very round; null/absent when none (or the column is missing). */
  restVote?: RestVote | null;
}

/** One line of the posted roll summary; `check` is present when the roll was a skill check. */
export interface RollSummaryEntry {
  playerDisplayName: string;
  roll: number;
  check?: {
    skill: string;
    dc: number;
    advantage: 'none' | 'advantage' | 'disadvantage';
    dice: number[];
    modifier: number;
    proficiency: number;
    total: number;
    success: boolean;
    critical: 'success' | 'failure' | null;
  };
  /** I3: present when this roll is a player attacking an enemy; ability modifier, proficiency and magic weapon bonus are shown separately. */
  attack?: {
    target: string;
    modifier: number;
    proficiency: number;
    magic: number;
    total: number;
    ac: number;
    hit: boolean;
    critical: 'success' | 'failure' | null;
  };
  /** I2: present when this roll is an enemy attacking a player; `playerDisplayName` is then the enemy's name. */
  enemyAttack?: {
    target: string;
    bonus: number;
    total: number;
    ac: number;
    hit: boolean;
    critical: 'success' | 'failure' | null;
  };
}

export interface RoundRepository {
  getRoundContext(roundId: string): Promise<RoundContext>;
  /**
   * Claims the right to apply this round's tags: true the first time (and only the first time) it
   * is called for a round, false on every call after. Lets a stale retry that reaches this point
   * know whether an earlier attempt already saved these effects.
   */
  claimRoundTags(roundId: string): Promise<boolean>;
  insertPlayerActionMessages(
    campaignId: string,
    roundId: string,
    actions: RoundAction[]
  ): Promise<void>;
  insertRollSummary(
    campaignId: string,
    roundId: string,
    rolls: RollSummaryEntry[]
  ): Promise<void>;
  saveCharacterState(campaignId: string, characters: Character[], pendingWipe: boolean): Promise<void>;
  /** H1: persists the death save tally. Optional so older fakes keep working; tolerates a missing column. */
  saveDeathSaves?(characters: Character[]): Promise<void>;
  /** K2: persists players.ability_cooldowns (only for characters that carry the map). Optional so older fakes keep working; tolerates a missing column. */
  saveAbilityCooldowns?(characters: Character[]): Promise<void>;
  /** J3: persists players.short_rests_used. Optional so older fakes keep working; tolerates a missing column. */
  saveShortRestsUsed?(characters: Character[]): Promise<void>;
  /** J3: consumes the rest vote (campaigns.rest_vote = null). Optional so older fakes keep working; tolerates a missing column. */
  clearRestVote?(campaignId: string): Promise<void>;
  /** H3a: stores the corpses (pack + gold) of permanently dead characters. Optional so older fakes keep working; throws when the table is missing. */
  saveCorpses?(campaignId: string, corpses: Corpse[]): Promise<void>;
  /** H3c: writes back what is left on looted corpses (an emptied one is deleted). Optional so older fakes keep working; throws on failure. */
  saveCorpseLoot?(updates: CorpseUpdate[]): Promise<void>;
  saveInventories(
    campaignId: string,
    changes: { playerId: string; items: InventoryItem[]; baseItems: InventoryItem[] }[]
  ): Promise<void>;
  applyGold(changes: { playerId: string; delta: number }[]): Promise<void>;
  setShop(campaignId: string, shop: ShopState | null): Promise<void>;
  setEncounter(campaignId: string, encounter: Encounter | null): Promise<void>;
  /** Best-effort world-memory write (npc/quest/clue); never throws, tolerates a missing table. */
  saveFacts(campaignId: string, facts: FactInput[]): Promise<void>;
  /** Records magic items handed out this round (F5f). Optional so older fakes keep working. */
  saveMagicGiven?(campaignId: string, itemIds: string[]): Promise<void>;
  insertStatsSummary(campaignId: string, roundId: string, changes: string[]): Promise<void>;
  insertDmMessagePlaceholder(campaignId: string, roundId: string): Promise<string>;
  appendToMessage(messageId: string, textChunk: string): Promise<void>;
  updateCampaignSummary(
    campaignId: string,
    summary: string,
    coversUpToRoundId: string
  ): Promise<void>;
  closeRoundAndOpenNext(campaignId: string, roundId: string): Promise<string>;
  setCurrentScene(campaignId: string, sceneId: string): Promise<void>;
}

/** H3c: best-effort; a database without campaign_corpses (migration 0028 pending) just has nothing to loot. */
async function loadCorpses(supabase: SupabaseClient, campaignId: string): Promise<LootableCorpse[]> {
  try {
    const { data, error } = await supabase
      .from('campaign_corpses')
      .select('id, name, items, gold')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as any[])
      .map((r) => ({ id: String(r.id), name: String(r.name), items: (Array.isArray(r.items) ? r.items : []) as InventoryItem[], gold: Math.max(0, Number(r.gold ?? 0)) }))
      .filter((c) => c.items.length > 0 || c.gold > 0);
  } catch {
    return [];
  }
}

export function createSupabaseRoundRepository(supabase: SupabaseClient): RoundRepository {
  return {
    async getRoundContext(roundId) {
      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('campaign_id, tags_applied_at')
        .eq('id', roundId)
        .single();
      if (roundError) throw roundError;

      const campaignId = round.campaign_id as string;

      const { data: campaignRow } = await supabase
        .from('campaigns')
        .select('adventure_id, current_scene_id')
        .eq('id', campaignId)
        .maybeSingle();

      const adventure = await getAdventureById(supabase, campaignRow?.adventure_id as string | null);
      const allowedSceneIds = await allowedSceneIdsAsync(supabase, campaignRow?.adventure_id as string | null);
      const sceneInstructionText = await sceneInstructionAsync(
        supabase,
        campaignRow?.adventure_id as string | null,
        campaignRow?.current_scene_id as string | null
      );

      // Separate query: a database without the settings column just plays with the defaults.
      const { data: settingsRow } = await supabase
        .from('campaigns')
        .select('settings')
        .eq('id', campaignId)
        .maybeSingle();

      // Separate queries so a database without the character columns still plays.
      const { data: characterRows } = await supabase
        .from('players')
        .select('id, display_name, weapon_id, hp, max_hp, status, revives_since_sanctuary, gold, xp, class_id, ability_cooldown')
        .eq('campaign_id', campaignId);

      // Ability scores in their own query: players.abilities may not exist yet, and that must not
      // hide the characters above. Unreadable means every score defaults to 10.
      const { data: abilityRows } = await supabase.from('players').select('id, abilities').eq('campaign_id', campaignId);
      const abilitiesById = new Map<string, unknown>((abilityRows ?? []).map((row: any) => [row.id as string, row.abilities]));

      // Death saves (H1) in their own query: players.death_saves may not exist yet; unreadable means none.
      const { data: deathRows } = await supabase.from('players').select('id, death_saves').eq('campaign_id', campaignId);
      const deathSavesById = new Map<string, unknown>((deathRows ?? []).map((row: any) => [row.id as string, row.death_saves]));

      // Short rests used (J2/J3) in their own query: players.short_rests_used may not exist yet; unreadable means 0.
      const { data: restRows } = await supabase.from('players').select('id, short_rests_used').eq('campaign_id', campaignId);
      const shortRestsById = new Map<string, number>((restRows ?? []).map((row: any) => [row.id as string, Number(row.short_rests_used ?? 0)]));

      // K2: multi-ability data in its own query: these players columns may not exist yet; unreadable means none.
      const { data: multiRows } = await supabase
        .from('players')
        .select('id, ability_cooldowns, subclass_id, ability_picks, spell_slots_used')
        .eq('campaign_id', campaignId);
      const multiById = new Map<string, any>((multiRows ?? []).map((row: any) => [row.id as string, row]));

      // The rest vote (J3) in its own query too: campaigns.rest_vote may not exist yet; unreadable means no vote.
      const { data: voteRow } = await supabase.from('campaigns').select('rest_vote').eq('id', campaignId).maybeSingle();
      const restVote = normalizeRestVote((voteRow as any)?.rest_vote, roundId);

      // Identity text in its own query for the same reason: unreadable means no identity, not no characters.
      const { data: identityRows } = await supabase.from('players').select('id, backstory, personality, goal').eq('campaign_id', campaignId);
      const identityById = new Map<string, any>((identityRows ?? []).map((row: any) => [row.id as string, row]));

      // Must not be tolerated like the columns above: an unreadable inventory read as "empty"
      // would let a later give/take save delete the player's real items.
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('player_id, item_id, custom_name, quantity, slot, equipped')
        .eq('campaign_id', campaignId);
      if (inventoryError) throw inventoryError;
      const inventories = rowsToInventories((inventoryRows ?? []) as InventoryRow[]);

      const { data: wipeRow } = await supabase
        .from('campaigns')
        .select('pending_wipe, current_shop')
        .eq('id', campaignId)
        .maybeSingle();

      // Separate query: a database without the encounter column just plays without combat tracking.
      const { data: encounterRow } = await supabase
        .from('campaigns')
        .select('current_encounter')
        .eq('id', campaignId)
        .maybeSingle();

      const { data: actionsRows, error: actionsError } = await supabase
        .from('round_actions')
        .select('action_text, use_item_id, use_ability, ability_target_id, player_id, players(display_name, turn_order, created_at)')
        .eq('round_id', roundId);
      if (actionsError) throw actionsError;

      // Scroll targets (F5e) in their own query: round_actions.item_target may not exist yet, and that
      // must not hide the actions above. Unreadable means scrolls simply have no target (not used).
      const { data: targetRows } = await supabase.from('round_actions').select('player_id, item_target').eq('round_id', roundId);
      // K2: which ability / spell an action picked, in its own query for the same reason.
      const { data: pickRows } = await supabase.from('round_actions').select('player_id, ability_id, spell_id').eq('round_id', roundId);
      const picksByPlayer = new Map<string, { abilityId?: string; spellId?: string }>(
        (pickRows ?? []).filter((r: any) => r.ability_id || r.spell_id).map((r: any) => [
          r.player_id as string,
          { ...(r.ability_id ? { abilityId: r.ability_id as string } : {}), ...(r.spell_id ? { spellId: r.spell_id as string } : {}) },
        ])
      );
      const itemTargetByPlayer = new Map<string, string>(
        (targetRows ?? []).filter((r: any) => r.item_target).map((r: any) => [r.player_id as string, r.item_target as string])
      );

      const { data: summaryRow } = await supabase
        .from('campaign_summary')
        .select('summary, covers_up_to_round')
        .eq('campaign_id', campaignId)
        .maybeSingle();

      let sinceTimestamp: string | null = null;
      if (summaryRow?.covers_up_to_round) {
        const { data: coveredRound } = await supabase
          .from('rounds')
          .select('opened_at')
          .eq('id', summaryRow.covers_up_to_round)
          .maybeSingle();
        sinceTimestamp = coveredRound?.opened_at ?? null;
      }

      let messagesQuery = supabase
        .from('messages')
        .select('role, content')
        .eq('campaign_id', campaignId)
        // Filter before the limit so ooc/ask rows never fill or reach the AI history window.
        .in('role', [...STORY_MESSAGE_ROLES]);
      if (sinceTimestamp) {
        messagesQuery = messagesQuery.gt('created_at', sinceTimestamp);
      }
      const { data: messageRows, error: messagesError } = await messagesQuery
        .order('created_at', { ascending: false })
        .limit(40);
      if (messagesError) throw messagesError;

      return {
        campaignId,
        adventureId: (campaignRow?.adventure_id as string | null) ?? null,
        currentSceneId: (campaignRow?.current_scene_id as string | null) ?? null,
        adventure,
        allowedSceneIds,
        sceneInstructionText,
        settings: normalizeSettings(settingsRow?.settings),
        campaignSummary: summaryRow?.summary ?? '',
        recentMessages: (messageRows ?? []).reverse() as StoredMessage[],
        characters: (characterRows ?? []).map((row: any) => ({
          id: row.id as string,
          displayName: row.display_name as string,
          weaponId: equippedWeaponId(inventories[row.id] ?? []),
          armorReduction: armorReduction(inventories[row.id] ?? []),
          armorWeight: armorWeight(inventories[row.id] ?? []),
          skillBonuses: equippedSkillBonuses(inventories[row.id] ?? []),
          itemEffects: equippedItemEffects(inventories[row.id] ?? []),
          ...(equippedReviveCharm(inventories[row.id] ?? []) ? { reviveCharm: equippedReviveCharm(inventories[row.id] ?? []) } : {}),
          hp: row.hp as number,
          maxHp: effectiveMaxHp(row.max_hp as number, Number(row.xp ?? 0)),
          status: row.status as Character['status'],
          revivesSinceSanctuary: row.revives_since_sanctuary as number,
          gold: Number(row.gold ?? 0),
          xp: Number(row.xp ?? 0),
          classId: (row.class_id ?? null) as string | null,
          abilityCooldown: Number(row.ability_cooldown ?? 0),
          abilities: normalizeAbilities(abilitiesById.get(row.id as string)),
          shortRestsUsed: shortRestsById.get(row.id as string) ?? 0,
          ...multiFields(multiById.get(row.id as string)),
          ...(deathSavesById.get(row.id as string) ? { deathSaves: normalizeDeathSaves(deathSavesById.get(row.id as string)) } : {}),
          backstory: (identityById.get(row.id as string)?.backstory ?? null) as string | null,
          personality: (identityById.get(row.id as string)?.personality ?? null) as string | null,
          goal: (identityById.get(row.id as string)?.goal ?? null) as string | null,
        })),
        inventories,
        pendingWipe: Boolean(wipeRow?.pending_wipe),
        currentShop: normalizeShop(wipeRow?.current_shop),
        currentEncounter: normalizeEncounter(encounterRow?.current_encounter),
        facts: await loadFacts(supabase, campaignId),
        magicGiven: await loadMagicGiven(supabase, campaignId),
        corpses: await loadCorpses(supabase, campaignId),
        restVote,
        tagsApplied: Boolean(round.tags_applied_at),
        // Actions reach the DM in the order the players chose for this round.
        actions: sortByTurnOrder(
          (actionsRows ?? []).map((row: any) => ({
            playerDisplayName: row.players?.display_name ?? 'Unknown',
            actionText: row.action_text as string,
            playerId: row.player_id as string,
            useItemId: (row.use_item_id ?? null) as string | null,
            itemTarget: itemTargetByPlayer.get(row.player_id as string) ?? null,
            useAbility: Boolean(row.use_ability),
            abilityTargetId: (row.ability_target_id ?? null) as string | null,
            ...(picksByPlayer.get(row.player_id as string) ?? {}),
            turnOrder: (row.players?.turn_order ?? null) as number | null,
            joinedAt: (row.players?.created_at ?? '') as string,
          }))
        ).map(({ playerDisplayName, actionText, playerId, useItemId, itemTarget, useAbility, abilityTargetId, abilityId, spellId }) => ({ playerDisplayName, actionText, playerId, useItemId, itemTarget, useAbility, abilityTargetId, ...(abilityId ? { abilityId } : {}), ...(spellId ? { spellId } : {}) })),
      };
    },

    async insertPlayerActionMessages(campaignId, roundId, actions) {
      if (actions.length === 0) return;
      const { error } = await supabase.from('messages').insert(
        actions.map((a) => ({
          campaign_id: campaignId,
          round_id: roundId,
          role: 'player' as const,
          content: `${a.playerDisplayName}: ${a.actionText}`,
        }))
      );
      if (error) throw error;
    },

    async insertRollSummary(campaignId, roundId, rolls) {
      if (rolls.length === 0) return;
      const { error } = await supabase.from('messages').insert({
        campaign_id: campaignId,
        round_id: roundId,
        role: 'system',
        content: JSON.stringify({ type: 'rolls', rolls }),
      });
      if (error) throw error;
    },

    async claimRoundTags(roundId) {
      const { data, error } = await supabase
        .from('rounds')
        .update({ tags_applied_at: new Date().toISOString() })
        .eq('id', roundId)
        .is('tags_applied_at', null)
        .select('id');
      if (error) throw error;
      return (data?.length ?? 0) === 1;
    },

    async saveCharacterState(campaignId, characters, pendingWipe) {
      // One apply_changes call for every character, not one update per character: that function
      // runs inside a single transaction, so a failure partway (a bad row, a dropped connection)
      // leaves no one's HP changed instead of leaving whichever players were processed first out
      // of sync with the rest.
      if (characters.length > 0) {
        const call = (status: (c: Character) => string) =>
          supabase.rpc('apply_changes', {
            changes: characters.map((c) => ({
              playerId: c.id,
              goldDelta: 0,
              items: null,
              hp: c.hp,
              maxHp: baseMaxHp(c.maxHp, c.xp ?? 0),
              xp: c.xp ?? 0,
              abilityCooldown: c.abilityCooldown ?? 0,
              status: status(c),
              revivesSinceSanctuary: c.revivesSinceSanctuary,
            })),
          });
        let { error } = await call((c) => c.status);
        // H3a: a database that has not got the 'dead' status yet (migration pending) rejects the whole
        // call; save everyone else's HP anyway and keep the dead character downed, as before permadeath.
        if (error && characters.some((c) => c.status === 'dead')) {
          ({ error } = await call((c) => (c.status === 'dead' ? 'downed' : c.status)));
        }
        if (error) throw error;
      }
      const { error } = await supabase
        .from('campaigns')
        .update({ pending_wipe: pendingWipe })
        .eq('id', campaignId);
      if (error) throw error;
    },

    async saveDeathSaves(characters) {
      for (const c of characters) {
        const { error } = await supabase.from('players').update({ death_saves: c.deathSaves ?? null }).eq('id', c.id);
        if (error) throw error;
      }
    },

    async saveAbilityCooldowns(characters) {
      for (const c of characters) {
        if (!c.abilityCooldowns) continue;
        const { error } = await supabase.from('players').update({ ability_cooldowns: c.abilityCooldowns }).eq('id', c.id);
        if (error) throw error;
      }
    },

    async saveShortRestsUsed(characters) {
      for (const c of characters) {
        const { error } = await supabase.from('players').update({ short_rests_used: c.shortRestsUsed ?? 0 }).eq('id', c.id);
        if (error) throw error;
      }
    },

    async clearRestVote(campaignId) {
      const { error } = await supabase.from('campaigns').update({ rest_vote: null }).eq('id', campaignId);
      if (error) throw error;
    },

    async saveCorpses(campaignId, corpses) {
      if (corpses.length === 0) return;
      const { error } = await supabase
        .from('campaign_corpses')
        .insert(corpses.map((c) => ({ campaign_id: campaignId, name: c.name, items: c.items, gold: c.gold })));
      if (error) throw error;
    },

    async saveCorpseLoot(updates) {
      for (const u of updates) {
        const { error } = u.empty
          ? await supabase.from('campaign_corpses').delete().eq('id', u.id)
          : await supabase.from('campaign_corpses').update({ items: u.items, gold: u.gold }).eq('id', u.id);
        if (error) throw error;
      }
    },

    async saveInventories(campaignId, changes) {
      // One apply_changes call per player (not one call for all): the equip-slot logic and the
      // concurrency check below live in that function now, and one player's pack having moved
      // since the round started must not stop the rest of the table's changes from saving.
      for (const { playerId, items, baseItems } of changes) {
        const { error } = await supabase.rpc('apply_changes', {
          changes: [{ playerId, goldDelta: 0, items, baseItems }],
        });
        if (error) {
          // Someone else's write (a shop purchase, a trade, another round retry) landed between
          // this round reading its snapshot and saving it. Keep their write; drop this round's
          // inventory change for this player rather than overwriting or corrupting either.
          if (isInventoryConflict(error)) continue;
          throw error;
        }
      }
    },

    async applyGold(changes) {
      if (changes.length === 0) return;
      const { error } = await supabase.rpc('apply_changes', {
        // clamp: a `pay` tag's amount was computed against the gold this round read at the
        // start; if that is now stale (a shop purchase mid-round), floor at 0 instead of
        // raising the gold >= 0 check, so one player's stale pay never rolls back every other
        // player's gold change in the same call.
        changes: changes.map((c) => ({ playerId: c.playerId, goldDelta: c.delta, items: null, clamp: true })),
      });
      if (error) throw error;
    },

    async setShop(campaignId, shop) {
      const { error } = await supabase.from('campaigns').update({ current_shop: shop }).eq('id', campaignId);
      if (error) throw error;
    },

    async setEncounter(campaignId, encounter) {
      const { error } = await supabase.from('campaigns').update({ current_encounter: encounter }).eq('id', campaignId);
      if (error) throw error;
    },

    async saveFacts(campaignId, facts) {
      await persistFacts(supabase, campaignId, facts);
    },

    async saveMagicGiven(campaignId, itemIds) {
      await persistMagicGiven(supabase, campaignId, itemIds);
    },

    async insertStatsSummary(campaignId, roundId, changes) {
      if (changes.length === 0) return;
      const { error } = await supabase.from('messages').insert({
        campaign_id: campaignId,
        round_id: roundId,
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes }),
      });
      if (error) throw error;
    },

    async insertDmMessagePlaceholder(campaignId, roundId) {
      const { data, error } = await supabase
        .from('messages')
        .insert({ campaign_id: campaignId, round_id: roundId, role: 'dm', content: '' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async appendToMessage(messageId, textChunk) {
      const { data, error } = await supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .single();
      if (error) throw error;
      const { error: updateError } = await supabase
        .from('messages')
        .update({ content: (data.content as string) + textChunk })
        .eq('id', messageId);
      if (updateError) throw updateError;
    },

    async updateCampaignSummary(campaignId, summary, coversUpToRoundId) {
      const { error } = await supabase.from('campaign_summary').upsert({
        campaign_id: campaignId,
        summary,
        covers_up_to_round: coversUpToRoundId,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },

    async closeRoundAndOpenNext(campaignId, roundId) {
      const { error: closeError } = await supabase
        .from('rounds')
        .update({ status: 'closed' })
        .eq('id', roundId);
      if (closeError) throw closeError;

      const { data: nextRound, error: nextRoundError } = await supabase
        .from('rounds')
        .insert({ campaign_id: campaignId, status: 'pending' })
        .select('id')
        .single();
      if (nextRoundError) throw nextRoundError;

      const { error: campaignError } = await supabase
        .from('campaigns')
        .update({ current_round_id: nextRound.id })
        .eq('id', campaignId);
      if (campaignError) throw campaignError;

      return nextRound.id as string;
    },

    async setCurrentScene(campaignId, sceneId) {
      const { error } = await supabase
        .from('campaigns')
        .update({ current_scene_id: sceneId })
        .eq('id', campaignId);
      if (error) throw error;
    },
  };
}

/**
 * K2: the optional multi-ability fields of a players row, left out when absent or malformed so a
 * character without them keeps the exact shape it had before.
 */
function multiFields(row: any): Pick<Character, 'abilityCooldowns' | 'subclassId' | 'abilityPicks' | 'spellSlotsUsed'> {
  if (!row) return {};
  const out: Pick<Character, 'abilityCooldowns' | 'subclassId' | 'abilityPicks' | 'spellSlotsUsed'> = {};
  const cooldowns = Object.entries(row.ability_cooldowns && typeof row.ability_cooldowns === 'object' ? row.ability_cooldowns : {})
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map(([k, v]) => [k, Math.floor(v as number)] as const);
  if (cooldowns.length > 0) out.abilityCooldowns = Object.fromEntries(cooldowns);
  if (typeof row.subclass_id === 'string' && row.subclass_id) out.subclassId = row.subclass_id;
  const picks = Object.entries(row.ability_picks && typeof row.ability_picks === 'object' ? row.ability_picks : {})
    .filter(([, v]) => typeof v === 'string' && v);
  if (picks.length > 0) out.abilityPicks = Object.fromEntries(picks) as Record<string, string>;
  const slots = Number(row.spell_slots_used ?? 0);
  if (slots > 0) out.spellSlotsUsed = Math.floor(slots);
  return out;
}

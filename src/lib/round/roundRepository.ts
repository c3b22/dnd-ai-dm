import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredMessage, RoundAction } from './assemblePrompt';
import { sortByTurnOrder } from '@/lib/campaign/turnOrder';
import { normalizeSettings, type CampaignSettings } from '@/lib/campaign/settings';
import type { Character } from '@/lib/character/types';
import { rowsToInventories, itemsToRows, type InventoryRow } from '@/lib/inventory/rows';
import { equippedWeaponId, armorReduction } from '@/lib/inventory/rules';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';

export interface RoundContext {
  campaignId: string;
  adventureId: string | null;
  currentSceneId: string | null;
  settings: CampaignSettings;
  campaignSummary: string;
  recentMessages: StoredMessage[];
  actions: RoundAction[];
  characters: Character[];
  inventories: Inventories;
  pendingWipe: boolean;
}

export interface RoundRepository {
  getRoundContext(roundId: string): Promise<RoundContext>;
  insertPlayerActionMessages(
    campaignId: string,
    roundId: string,
    actions: RoundAction[]
  ): Promise<void>;
  insertRollSummary(
    campaignId: string,
    roundId: string,
    rolls: { playerDisplayName: string; roll: number }[]
  ): Promise<void>;
  saveCharacterState(campaignId: string, characters: Character[], pendingWipe: boolean): Promise<void>;
  saveInventories(campaignId: string, changes: { playerId: string; items: InventoryItem[] }[]): Promise<void>;
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

export function createSupabaseRoundRepository(supabase: SupabaseClient): RoundRepository {
  return {
    async getRoundContext(roundId) {
      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('campaign_id')
        .eq('id', roundId)
        .single();
      if (roundError) throw roundError;

      const campaignId = round.campaign_id as string;

      const { data: campaignRow } = await supabase
        .from('campaigns')
        .select('adventure_id, current_scene_id')
        .eq('id', campaignId)
        .maybeSingle();

      // Separate query: a database without the settings column just plays with the defaults.
      const { data: settingsRow } = await supabase
        .from('campaigns')
        .select('settings')
        .eq('id', campaignId)
        .maybeSingle();

      // Separate queries so a database without the character columns still plays.
      const { data: characterRows } = await supabase
        .from('players')
        .select('id, display_name, weapon_id, hp, max_hp, status, revives_since_sanctuary')
        .eq('campaign_id', campaignId);

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
        .select('pending_wipe')
        .eq('id', campaignId)
        .maybeSingle();

      const { data: actionsRows, error: actionsError } = await supabase
        .from('round_actions')
        .select('action_text, use_item_id, player_id, players(display_name, turn_order, created_at)')
        .eq('round_id', roundId);
      if (actionsError) throw actionsError;

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
        .eq('campaign_id', campaignId);
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
        settings: normalizeSettings(settingsRow?.settings),
        campaignSummary: summaryRow?.summary ?? '',
        recentMessages: (messageRows ?? []).reverse() as StoredMessage[],
        characters: (characterRows ?? []).map((row: any) => ({
          id: row.id as string,
          displayName: row.display_name as string,
          weaponId: equippedWeaponId(inventories[row.id] ?? []),
          armorReduction: armorReduction(inventories[row.id] ?? []),
          hp: row.hp as number,
          maxHp: row.max_hp as number,
          status: row.status as 'active' | 'downed',
          revivesSinceSanctuary: row.revives_since_sanctuary as number,
        })),
        inventories,
        pendingWipe: Boolean(wipeRow?.pending_wipe),
        // Actions reach the DM in the order the players chose for this round.
        actions: sortByTurnOrder(
          (actionsRows ?? []).map((row: any) => ({
            playerDisplayName: row.players?.display_name ?? 'Unknown',
            actionText: row.action_text as string,
            playerId: row.player_id as string,
            useItemId: (row.use_item_id ?? null) as string | null,
            turnOrder: (row.players?.turn_order ?? null) as number | null,
            joinedAt: (row.players?.created_at ?? '') as string,
          }))
        ).map(({ playerDisplayName, actionText, playerId, useItemId }) => ({ playerDisplayName, actionText, playerId, useItemId })),
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

    async saveCharacterState(campaignId, characters, pendingWipe) {
      for (const c of characters) {
        const { error } = await supabase
          .from('players')
          .update({
            hp: c.hp,
            max_hp: c.maxHp,
            status: c.status,
            revives_since_sanctuary: c.revivesSinceSanctuary,
          })
          .eq('id', c.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from('campaigns')
        .update({ pending_wipe: pendingWipe })
        .eq('id', campaignId);
      if (error) throw error;
    },

    async saveInventories(campaignId, changes) {
      for (const { playerId, items } of changes) {
        const keep = new Set(items.map((i) => `${i.itemId}|${i.customName}`));
        const { data: existing, error: readError } = await supabase
          .from('inventory_items')
          .select('id, item_id, custom_name, slot, equipped')
          .eq('player_id', playerId);
        if (readError) throw readError;
        // Remove first: the one-equipped-per-slot index would reject a new equipped row while the old one exists.
        const staleRows = (existing ?? []).filter((r: any) => !keep.has(`${r.item_id}|${r.custom_name}`));
        if (staleRows.length) {
          const { error } = await supabase.from('inventory_items').delete().in('id', staleRows.map((r: any) => r.id as string));
          if (error) throw error;
        }
        if (items.length) {
          // The round's snapshot is from before the DM wrote, and the player may have swapped gear
          // since. A round never changes an existing row's equipped flag, so keep what the database
          // has now, and only equip a new item into a slot that is still empty.
          const staleIds = new Set(staleRows.map((r: any) => r.id));
          const live = (existing ?? []).filter((r: any) => !staleIds.has(r.id));
          const dbEquipped = new Map(live.map((r: any) => [`${r.item_id}|${r.custom_name}`, Boolean(r.equipped)]));
          const occupied = new Set(live.filter((r: any) => r.equipped).map((r: any) => r.slot));
          const merged = items.map((i) => {
            const key = `${i.itemId}|${i.customName}`;
            return { ...i, equipped: dbEquipped.has(key) ? dbEquipped.get(key)! : i.equipped && !occupied.has(i.slot) };
          });
          const { error } = await supabase
            .from('inventory_items')
            .upsert(itemsToRows(campaignId, playerId, merged), { onConflict: 'player_id,item_id,custom_name' });
          if (error) throw error;
        }
      }
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

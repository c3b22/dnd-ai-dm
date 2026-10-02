import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredMessage, RoundAction } from './assemblePrompt';
import { sortByTurnOrder } from '@/lib/campaign/turnOrder';
import { normalizeSettings, type CampaignSettings } from '@/lib/campaign/settings';
import type { Character } from '@/lib/character/types';
import { rowsToInventories, type InventoryRow } from '@/lib/inventory/rows';
import { equippedWeaponId, armorReduction } from '@/lib/inventory/rules';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';
import { normalizeShop } from '@/lib/economy/shop';
import type { ShopState } from '@/lib/economy/apply';
import { isInventoryConflict } from '@/lib/economy/errors';

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
  currentShop: ShopState | null;
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
  saveInventories(
    campaignId: string,
    changes: { playerId: string; items: InventoryItem[]; baseItems: InventoryItem[] }[]
  ): Promise<void>;
  applyGold(changes: { playerId: string; delta: number }[]): Promise<void>;
  setShop(campaignId: string, shop: ShopState | null): Promise<void>;
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
        .select('id, display_name, weapon_id, hp, max_hp, status, revives_since_sanctuary, gold')
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
        .select('pending_wipe, current_shop')
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
          gold: Number(row.gold ?? 0),
        })),
        inventories,
        pendingWipe: Boolean(wipeRow?.pending_wipe),
        currentShop: normalizeShop(wipeRow?.current_shop),
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

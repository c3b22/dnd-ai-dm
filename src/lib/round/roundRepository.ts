import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredMessage, RoundAction } from './assemblePrompt';

export interface RoundContext {
  campaignId: string;
  adventureId: string | null;
  campaignSummary: string;
  recentMessages: StoredMessage[];
  actions: RoundAction[];
}

export interface RoundRepository {
  getRoundContext(roundId: string): Promise<RoundContext>;
  insertPlayerActionMessages(
    campaignId: string,
    roundId: string,
    actions: RoundAction[]
  ): Promise<void>;
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
        .select('adventure_id')
        .eq('id', campaignId)
        .maybeSingle();

      const { data: actionsRows, error: actionsError } = await supabase
        .from('round_actions')
        .select('action_text, players(display_name)')
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
        campaignSummary: summaryRow?.summary ?? '',
        recentMessages: (messageRows ?? []).reverse() as StoredMessage[],
        actions: (actionsRows ?? []).map((row: any) => ({
          playerDisplayName: row.players?.display_name ?? 'Unknown',
          actionText: row.action_text,
        })),
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

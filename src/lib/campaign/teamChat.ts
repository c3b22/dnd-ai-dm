import { createServiceRoleClient } from '@/lib/supabase/server';

type Client = ReturnType<typeof createServiceRoleClient>;

export const MAX_OOC_LENGTH = 500;

export class TeamChatError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 = 400
  ) {
    super(message);
  }
}

/**
 * Team (out-of-character) chat. Members only. Stored as role='ooc' with no round, so it never
 * touches round state and is never sent to the AI. Delivered through the existing messages realtime.
 */
export async function postTeamChat(
  supabase: Client,
  params: { campaignId: string; userId: string; content: unknown }
): Promise<void> {
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, user_id')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) throw new TeamChatError('only campaign members can chat', 403);

  const content = typeof params.content === 'string' ? params.content.trim() : '';
  if (!content) throw new TeamChatError('message is empty', 400);
  if (content.length > MAX_OOC_LENGTH) {
    throw new TeamChatError(`message is too long (max ${MAX_OOC_LENGTH} characters)`, 400);
  }

  const { error } = await supabase.from('messages').insert({
    campaign_id: params.campaignId,
    round_id: null,
    role: 'ooc',
    player_id: player.id,
    content,
  });
  if (error) throw error;
}

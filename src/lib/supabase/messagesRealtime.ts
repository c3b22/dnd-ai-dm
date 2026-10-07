import { supabaseBrowserClient } from './client';
import type { Message } from '@/components/MessageList';

export async function fetchInitialMessages(campaignId: string): Promise<Message[]> {
  const query = (columns: string) =>
    supabaseBrowserClient
      .from('messages')
      .select(columns)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50);
  // player_id is newer than the rest; a database without it falls back to the old column list.
  let { data, error } = await query('id, role, content, player_id');
  if (error) ({ data, error } = await query('id, role, content'));
  if (error) throw error;
  // Newest 50, flipped back to chronological order for display.
  return (data as unknown as Message[]).reverse();
}

export function subscribeToNewMessages(
  campaignId: string,
  onMessage: (message: Message) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`messages:${campaignId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `campaign_id=eq.${campaignId}`,
      },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

import { supabaseBrowserClient } from './client';
import type { Message } from '@/components/MessageList';

export async function fetchInitialMessages(campaignId: string): Promise<Message[]> {
  const { data, error } = await supabaseBrowserClient
    .from('messages')
    .select('id, role, content')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  // Newest 50, flipped back to chronological order for display.
  return (data as Message[]).reverse();
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

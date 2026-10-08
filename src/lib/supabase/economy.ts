import { supabaseBrowserClient } from './client';
import type { TradeItem } from '@/lib/economy/trade';

export interface TradeRow {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  giveItems: TradeItem[];
  giveGold: number;
  wantItems: TradeItem[];
  wantGold: number;
  createdAt: string;
}

export async function fetchPendingTrades(campaignId: string): Promise<TradeRow[]> {
  const { data, error } = await supabaseBrowserClient
    .from('trades')
    .select('id, from_player_id, to_player_id, give_items, give_gold, want_items, want_gold, created_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    id: t.id,
    fromPlayerId: t.from_player_id,
    toPlayerId: t.to_player_id,
    giveItems: t.give_items ?? [],
    giveGold: t.give_gold,
    wantItems: t.want_items ?? [],
    wantGold: t.want_gold,
    createdAt: t.created_at,
  }));
}

export function subscribeToTrades(campaignId: string, onChange: () => void): () => void {
  const channel = supabaseBrowserClient
    .channel(`trades:${campaignId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `campaign_id=eq.${campaignId}` }, onChange)
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

async function post(path: string, body: unknown): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: 'failed' }));
    throw new Error(typeof error === 'string' ? error : 'failed');
  }
}

export const requestShop = (campaignId: string, action: 'buy' | 'sell', itemId: string, customName?: string) =>
  post(`/api/campaigns/${campaignId}/shop`, { action, itemId, customName });

export const requestTrade = (campaignId: string, body: object) => post(`/api/campaigns/${campaignId}/trades`, body);

/** L5: the table owner continues an ended campaign as the next chapter. */
export const requestSequel = (campaignId: string) => post(`/api/campaigns/${campaignId}/sequel`, {});

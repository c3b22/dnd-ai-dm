import { supabaseBrowserClient } from './client';
import { rowsToInventories, type InventoryRow } from '@/lib/inventory/rows';
import type { Inventories } from '@/lib/inventory/types';

export async function fetchCampaignInventories(campaignId: string): Promise<Inventories> {
  const { data, error } = await supabaseBrowserClient
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('campaign_id', campaignId);
  if (error) throw error;
  return rowsToInventories((data ?? []) as InventoryRow[]);
}

export function subscribeToInventory(campaignId: string, onChange: () => void): () => void {
  const channel = supabaseBrowserClient
    .channel(`inventory:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_items', filter: `campaign_id=eq.${campaignId}` },
      onChange
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function requestEquip(
  campaignId: string,
  itemId: string,
  action: 'equip' | 'unequip'
): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/inventory/equip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ itemId, action }),
  });
  if (!response.ok) throw new Error('could not change equipment');
}

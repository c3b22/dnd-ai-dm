import { supabaseBrowserClient } from './client';

export async function startCampaignForClient(campaignId: string): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'could not start the game');
  }
}

import { supabaseBrowserClient } from './client';
import { DEFAULT_SETTINGS, normalizeSettings, type CampaignSettings } from '@/lib/campaign/settings';

export async function fetchCampaignSettings(campaignId: string): Promise<CampaignSettings> {
  // Errors (for example a database without the settings column) mean "use the defaults".
  const { data } = await supabaseBrowserClient
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle();
  return data ? normalizeSettings(data.settings) : DEFAULT_SETTINGS;
}

export function subscribeToCampaignSettings(
  campaignId: string,
  onChange: (settings: CampaignSettings) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`campaign_settings:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => onChange(normalizeSettings((payload.new as { settings?: unknown }).settings))
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function saveCampaignSettings(
  campaignId: string,
  patch: Partial<CampaignSettings>
): Promise<CampaignSettings> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'could not save the settings');
  }
  return normalizeSettings((await response.json()).settings);
}

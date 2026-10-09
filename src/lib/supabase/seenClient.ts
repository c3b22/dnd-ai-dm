import { supabaseBrowserClient } from './client';

const MIN_INTERVAL_MS = 60_000;
const lastSent = new Map<string, number>();

/** Tells the server this player is looking at the room. At most once a minute per campaign; never throws. */
export async function reportSeen(campaignId: string, now: number = Date.now()): Promise<void> {
  const previous = lastSent.get(campaignId);
  if (previous !== undefined && now - previous < MIN_INTERVAL_MS) return;
  lastSent.set(campaignId, now);
  try {
    const { data } = await supabaseBrowserClient.auth.getSession();
    await fetch(`/api/campaigns/${campaignId}/seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    });
  } catch {
    // best effort
  }
}

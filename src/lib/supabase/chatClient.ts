import { supabaseBrowserClient } from './client';

export class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function post(path: string, payload: Record<string, string>): Promise<Record<string, unknown>> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ChatRequestError(body.error ?? 'request failed', response.status);
  return body;
}

export async function sendTeamChat(campaignId: string, content: string): Promise<void> {
  await post(`/api/campaigns/${campaignId}/chat`, { content });
}

export async function askDmForClient(campaignId: string, question: string): Promise<string> {
  const body = await post(`/api/campaigns/${campaignId}/ask`, { question });
  return typeof body.answer === 'string' ? body.answer : '';
}

/** How many questions this player already asked in the round. Best effort: 0 if the column is missing. */
export async function fetchAskCount(campaignId: string, playerId: string, roundId: string): Promise<number> {
  try {
    const { count, error } = await supabaseBrowserClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('role', 'ask')
      .eq('player_id', playerId)
      .eq('round_id', roundId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

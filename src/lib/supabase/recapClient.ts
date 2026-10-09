export type RecapResult =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'error'; status: number };

export type LoadRecap = (force: boolean) => Promise<RecapResult>;

/** Parses a recap API response into a RecapResult. Never throws. */
export async function parseRecapResponse(res: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<RecapResult> {
  if (!res.ok) return { kind: 'error', status: res.status };
  try {
    const body = (await res.json()) as { needed?: boolean; text?: unknown };
    if (body.needed && typeof body.text === 'string' && body.text.trim()) return { kind: 'text', text: body.text };
    return { kind: 'none' };
  } catch {
    return { kind: 'error', status: 500 };
  }
}

/** GET /api/campaigns/[id]/recap (force=true skips the S2 conditions). Never throws. */
export async function fetchRecap(campaignId: string, force: boolean): Promise<RecapResult> {
  try {
    // Imported lazily so the pure parser above stays importable without Supabase env vars (tests).
    const { supabaseBrowserClient } = await import('./client');
    const { data } = await supabaseBrowserClient.auth.getSession();
    const res = await fetch(`/api/campaigns/${campaignId}/recap${force ? '?force=1' : ''}`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    });
    return await parseRecapResponse(res);
  } catch {
    return { kind: 'error', status: 0 };
  }
}

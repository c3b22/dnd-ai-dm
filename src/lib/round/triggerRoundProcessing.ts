export interface TriggerRoundProcessingOptions {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  maxAttempts?: number;
}

async function attemptOnce(fetchImpl: typeof fetch, roundId: string): Promise<boolean> {
  try {
    const response = await fetchImpl('/api/round/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId }),
      // Just past the route's 60s maxDuration, so a killed function can't leave the spinner
      // up forever; the "ให้ DM ตัดสินตอนนี้" button then works as a last-resort retry.
      signal: AbortSignal.timeout(65_000),
    });
    // 409 means someone else already claimed or finished this round, not a failure.
    return response.ok || response.status === 409;
  } catch {
    return false;
  }
}

/**
 * A transient Gemini hiccup (e.g. both the primary and fallback model returning an empty
 * response) releases the round for a fresh attempt instead of leaving it half-written, so a
 * failed call is safe to retry automatically before falling back to the manual "ให้ DM
 * ตัดสินตอนนี้" button.
 */
export async function triggerRoundProcessing(
  roundId: string,
  options: TriggerRoundProcessingOptions = {}
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const maxAttempts = options.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await attemptOnce(fetchImpl, roundId);
    if (ok || attempt === maxAttempts) return;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

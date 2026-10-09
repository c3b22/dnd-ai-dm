import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { bufferTextOrThrow, EmptyResponseError, PromptBlockedError, type GeminiClientDeps } from './geminiClient';

export const GEMINI_MODELS = {
  primary: 'gemini-3.5-flash-lite',
  fallback: 'gemini-3.1-flash-lite',
  // Bigger non-lite model for narration when a room asks for quality (see docs/ai-models.md).
  narrationPremium: 'gemini-3.5-flash',
};

// Two sequential calls (primary, then fallback) plus a summary must fit in the route's 60s
// maxDuration, so each call gets a hard cap instead of waiting on a hung request.
export const GEMINI_CALL_TIMEOUT_MS = 18_000;

export const realGeminiDeps: GeminiClientDeps = {
  primaryModel: GEMINI_MODELS.primary,
  fallbackModel: GEMINI_MODELS.fallback,
  premiumModel: GEMINI_MODELS.narrationPremium,
  streamText: async ({ model, prompt, timeoutMs }) => {
    const signal = AbortSignal.timeout(timeoutMs ?? GEMINI_CALL_TIMEOUT_MS);
    const startedAt = Date.now();
    const result = streamText({
      model: google(model),
      prompt,
      abortSignal: signal,
      // The SDK's default 2 retries back off silently; our own fallback model handles 429/5xx.
      maxRetries: 0,
    });
    // `streamText` never rejects on API failures (429, 5xx, bad key, retired model):
    // it emits an `{ type: 'error' }` part on `fullStream` and `textStream` just ends
    // empty. Buffer the full stream so failures throw here, where generateNarration's
    // rate-limit fallback can see them, instead of becoming an empty DM message.
    try {
      return { textStream: await bufferTextOrThrow(result.fullStream) };
    } catch (error) {
      console.error('gemini call failed', { model, promptChars: prompt.length, ms: Date.now() - startedAt, aborted: signal.aborted });
      // The stream carries no detail when Gemini refuses a prompt, so ask the REST API once more
      // for its promptFeedback/finishReason.
      const raw = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(8_000),
        }
      )
        .then(async (res) => {
          const json = (await res.json()) as { promptFeedback?: unknown; candidates?: { finishReason?: string; safetyRatings?: unknown }[]; error?: unknown };
          return { status: res.status, promptFeedback: json.promptFeedback, finishReason: json.candidates?.[0]?.finishReason, safetyRatings: json.candidates?.[0]?.safetyRatings, error: json.error };
        })
        .catch((e) => ({ diagnosticFailed: String(e) }));
      console.error('gemini raw diagnostic', JSON.stringify(raw));
      // A refused prompt fails the same on every model, so tell callers instead of falling back.
      const blockReason = (raw as { promptFeedback?: { blockReason?: string } }).promptFeedback?.blockReason;
      if (error instanceof EmptyResponseError && blockReason) throw new PromptBlockedError(blockReason);
      throw error;
    }
  },
};

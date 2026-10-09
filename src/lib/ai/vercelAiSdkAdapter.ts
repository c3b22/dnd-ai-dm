import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { bufferTextOrThrow, type GeminiClientDeps } from './geminiClient';

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
    const result = streamText({
      model: google(model),
      prompt,
      abortSignal: AbortSignal.timeout(timeoutMs ?? GEMINI_CALL_TIMEOUT_MS),
      // The SDK's default 2 retries back off silently; our own fallback model handles 429/5xx.
      maxRetries: 0,
    });
    // `streamText` never rejects on API failures (429, 5xx, bad key, retired model):
    // it emits an `{ type: 'error' }` part on `fullStream` and `textStream` just ends
    // empty. Buffer the full stream so failures throw here, where generateNarration's
    // rate-limit fallback can see them, instead of becoming an empty DM message.
    return { textStream: await bufferTextOrThrow(result.fullStream) };
  },
};

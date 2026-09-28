import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { bufferTextOrThrow, type GeminiClientDeps } from './geminiClient';

export const GEMINI_MODELS = {
  primary: 'gemini-2.0-flash',
  fallback: 'gemini-2.0-flash-lite',
};

export const realGeminiDeps: GeminiClientDeps = {
  primaryModel: GEMINI_MODELS.primary,
  fallbackModel: GEMINI_MODELS.fallback,
  streamText: async ({ model, prompt }) => {
    const result = streamText({ model: google(model), prompt });
    // `streamText` never rejects on API failures (429, 5xx, bad key, retired model):
    // it emits an `{ type: 'error' }` part on `fullStream` and `textStream` just ends
    // empty. Buffer the full stream so failures throw here, where generateNarration's
    // rate-limit fallback can see them, instead of becoming an empty DM message.
    return { textStream: await bufferTextOrThrow(result.fullStream) };
  },
};

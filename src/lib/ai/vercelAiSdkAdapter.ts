import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GeminiClientDeps } from './geminiClient';

export const GEMINI_MODELS = {
  primary: 'gemini-2.0-flash',
  fallback: 'gemini-2.0-flash-lite',
};

export const realGeminiDeps: GeminiClientDeps = {
  primaryModel: GEMINI_MODELS.primary,
  fallbackModel: GEMINI_MODELS.fallback,
  streamText: async ({ model, prompt }) => {
    const result = await streamText({ model: google(model), prompt });
    return { textStream: result.textStream };
  },
};

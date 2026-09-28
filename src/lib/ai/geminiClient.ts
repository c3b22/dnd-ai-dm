export interface TextStreamer {
  (params: { model: string; prompt: string }): Promise<{
    textStream: AsyncIterable<string>;
  }>;
}

export interface GeminiClientDeps {
  streamText: TextStreamer;
  primaryModel: string;
  fallbackModel: string;
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
  return status === 429;
}

export async function generateNarration(
  prompt: string,
  deps: GeminiClientDeps
): Promise<AsyncIterable<string>> {
  try {
    const result = await deps.streamText({ model: deps.primaryModel, prompt });
    return result.textStream;
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    const fallbackResult = await deps.streamText({ model: deps.fallbackModel, prompt });
    return fallbackResult.textStream;
  }
}

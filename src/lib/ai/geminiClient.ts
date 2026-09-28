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

/**
 * An API failure with the HTTP status lifted to the top level, so `isRateLimitError`
 * can classify it no matter how deeply the SDK wrapped the original error.
 */
export class GeminiApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number, cause: unknown) {
    super(message, { cause });
    this.name = 'GeminiApiError';
    this.status = status;
  }
}

function extractStatus(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== 'object' || depth > 5) return undefined;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    lastError?: unknown;
    errors?: unknown;
  };
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  // The `ai` SDK's RetryError wraps the underlying APICallError(s): `lastError` is
  // the final attempt, `errors` is every attempt in order.
  if (candidate.lastError !== undefined) return extractStatus(candidate.lastError, depth + 1);
  if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
    return extractStatus(candidate.errors[candidate.errors.length - 1], depth + 1);
  }
  return undefined;
}

/**
 * Turns whatever error the `ai` SDK surfaced (APICallError with `.statusCode`, or a
 * RetryError wrapping APICallErrors in `.lastError`/`.errors`) into an error carrying a
 * top-level `.status`. Errors with no discoverable status are returned unchanged.
 */
export function normalizeGeminiError(error: unknown): unknown {
  const status = extractStatus(error);
  if (status === undefined) return error;
  const message = error instanceof Error ? error.message : `Gemini request failed (${status})`;
  return new GeminiApiError(message, status, error);
}

export interface NarrationStreamPart {
  type: string;
  textDelta?: string;
  error?: unknown;
}

/**
 * Drains an SDK `fullStream`, throwing if it carries an error part or yields no text.
 * The SDK's `textStream` silently drops error parts, so this is the only way to learn
 * that a request failed before committing its (empty) output anywhere.
 */
export async function bufferTextOrThrow(
  fullStream: AsyncIterable<NarrationStreamPart>
): Promise<AsyncIterable<string>> {
  const chunks: string[] = [];
  for await (const part of fullStream) {
    if (part.type === 'error') {
      throw normalizeGeminiError(part.error);
    }
    if (part.type === 'text-delta' && part.textDelta) {
      chunks.push(part.textDelta);
    }
  }
  if (chunks.length === 0) {
    throw new Error('Gemini returned an empty response with no error part');
  }

  async function* replay() {
    for (const chunk of chunks) yield chunk;
  }
  return replay();
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

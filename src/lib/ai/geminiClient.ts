export interface TextStreamer {
  (params: { model: string; prompt: string; timeoutMs?: number }): Promise<{
    textStream: AsyncIterable<string>;
  }>;
}

export interface GeminiClientDeps {
  streamText: TextStreamer;
  primaryModel: string;
  fallbackModel: string;
  /** The bigger model used for the premium purposes when a room is set to 'good'. */
  premiumModel?: string;
  /** Clock for the time budget (R4); tests inject one. */
  now?: () => number;
  /** Where the per-call model/time line goes; defaults to console.log. */
  log?: (line: string) => void;
}

/** Time budget for one request (R4): everything must finish before `deadlineAt` (ms on the `now` clock). */
export interface AiBudget {
  deadlineAt: number;
  /** Told which model actually answered and whether the big model was skipped or failed over. */
  onUsed?: (info: AiUsedInfo) => void;
}

export interface AiUsedInfo {
  purpose?: AiPurpose;
  model: string;
  elapsedMs: number;
  /** True when a premium call ended up on a lite model (skipped for lack of time, or it failed). */
  fellBack: boolean;
}

/** The big model gets at most this long, and must leave RESERVE_MS for the rest of the request. */
export const PREMIUM_MAX_MS = 25_000;
export const RESERVE_MS = 20_000;
const LITE_MAX_MS = 18_000;
const LITE_MIN_MS = 3_000;
const LITE_MARGIN_MS = 2_000;

/** What an AI call is for. Only the premium purposes may use the bigger model, and only in a 'good' room. */
export type AiPurpose = 'plan' | 'narration' | 'summary' | 'epilogue' | 'sequel' | 'ask';

export type AiQuality = 'fast' | 'good';

export interface AiCallOptions {
  purpose: AiPurpose;
  quality: AiQuality;
}

/** Narration, the epilogue (L3) and the sequel outline (L5) are the only calls that use the big model. */
export const PREMIUM_PURPOSES: readonly AiPurpose[] = ['narration', 'epilogue', 'sequel'];

/**
 * The models to try, in order, for one call. Premium calls start on the big model and then follow the usual
 * lite chain; everything else (and every 'fast' room) uses primary then fallback as before.
 */
export function modelsForCall(deps: GeminiClientDeps, call?: AiCallOptions): string[] {
  const lite = [deps.primaryModel, deps.fallbackModel];
  if (call && call.quality === 'good' && deps.premiumModel && PREMIUM_PURPOSES.includes(call.purpose)) {
    return [deps.premiumModel, ...lite];
  }
  return lite;
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
  return status === 429;
}

export function isServerError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
  return typeof status === 'number' && status >= 500 && status < 600;
}

/** A call that outlived its abort signal (AbortSignal.timeout throws TimeoutError). */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** The model answered 200 but produced nothing, or the stream ended early after an abort. */
export class EmptyResponseError extends Error {
  constructor() {
    super('Gemini returned an empty response with no error part');
    this.name = 'EmptyResponseError';
  }
}

/** Failures worth retrying once on the fallback model; anything else (bad key) would fail again. */
export function isFallbackWorthy(error: unknown): boolean {
  return (
    isRateLimitError(error) ||
    isServerError(error) ||
    isTimeoutError(error) ||
    error instanceof EmptyResponseError
  );
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
    throw new EmptyResponseError();
  }

  async function* replay() {
    for (const chunk of chunks) yield chunk;
  }
  return replay();
}

export async function generateNarration(
  prompt: string,
  deps: GeminiClientDeps,
  call?: AiCallOptions,
  budget?: AiBudget
): Promise<AsyncIterable<string>> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const started = now();
  const intended = modelsForCall(deps, call);
  let models = intended;
  const bigModel = intended.length > 2 ? intended[0] : undefined;
  let premiumTimeout: number | undefined;
  if (bigModel && budget) {
    premiumTimeout = Math.min(PREMIUM_MAX_MS, budget.deadlineAt - started - RESERVE_MS);
    // Not enough time left for the big model to be worth trying: go straight to lite.
    if (premiumTimeout <= 0) models = intended.slice(1);
  }
  for (let i = 0; ; i++) {
    const model = models[i];
    let timeoutMs: number | undefined;
    if (budget) {
      timeoutMs =
        model === bigModel
          ? premiumTimeout
          : Math.min(LITE_MAX_MS, Math.max(budget.deadlineAt - now() - LITE_MARGIN_MS, LITE_MIN_MS));
    }
    try {
      const result = await deps.streamText(
        timeoutMs === undefined ? { model, prompt } : { model, prompt, timeoutMs }
      );
      const info: AiUsedInfo = {
        purpose: call?.purpose,
        model,
        elapsedMs: now() - started,
        fellBack: bigModel !== undefined && model !== bigModel,
      };
      log(`[ai] purpose=${info.purpose ?? 'unknown'} model=${model} elapsedMs=${info.elapsedMs} fellBack=${info.fellBack}`);
      budget?.onUsed?.(info);
      return result.textStream;
    } catch (error) {
      // Retry down the chain only for failures another model could fix, and only while a model is left.
      if (!isFallbackWorthy(error) || i === models.length - 1) throw error;
      log(`[ai] purpose=${call?.purpose ?? 'unknown'} model=${model} failed after ${now() - started}ms, trying next`);
    }
  }
}

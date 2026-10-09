import { describe, it, expect, vi } from 'vitest';
import {
  bufferTextOrThrow,
  generateNarration,
  isRateLimitError,
  normalizeGeminiError,
  type AiPurpose,
  type NarrationStreamPart,
} from './geminiClient';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

async function* fakeFullStream(parts: NarrationStreamPart[]) {
  for (const part of parts) yield part;
}

// Mirrors the shapes in node_modules: @ai-sdk/provider's APICallError carries
// `statusCode`; ai's RetryError carries `errors` (every attempt) and `lastError`.
function fakeApiCallError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { name: 'AI_APICallError', statusCode });
}

function fakeRetryError(errors: unknown[]) {
  return Object.assign(new Error('Failed after retries'), {
    name: 'AI_RetryError',
    reason: 'maxRetriesExceeded',
    errors,
    lastError: errors[errors.length - 1],
  });
}

describe('normalizeGeminiError', () => {
  it('lifts an APICallError statusCode into a rate-limit-classifiable error', () => {
    const normalized = normalizeGeminiError(fakeApiCallError(429));
    expect(isRateLimitError(normalized)).toBe(true);
  });

  it('unwraps a RetryError to the status of its last attempt', () => {
    const normalized = normalizeGeminiError(
      fakeRetryError([fakeApiCallError(429), fakeApiCallError(429), fakeApiCallError(429)])
    );
    expect(isRateLimitError(normalized)).toBe(true);
    expect((normalized as Error).cause).toBeInstanceOf(Error);
  });

  it('does not classify a RetryError that ended on a non-429 as a rate limit', () => {
    const normalized = normalizeGeminiError(
      fakeRetryError([fakeApiCallError(429), fakeApiCallError(400)])
    );
    expect(isRateLimitError(normalized)).toBe(false);
    expect((normalized as { status: number }).status).toBe(400);
  });

  it('returns errors with no discoverable status unchanged', () => {
    const original = new Error('parse failure');
    expect(normalizeGeminiError(original)).toBe(original);
  });
});

describe('bufferTextOrThrow', () => {
  it('replays the text deltas and ignores non-text parts', async () => {
    const stream = await bufferTextOrThrow(
      fakeFullStream([
        { type: 'step-start' },
        { type: 'text-delta', textDelta: 'You see ' },
        { type: 'text-delta', textDelta: 'a torch.' },
        { type: 'finish' },
      ])
    );
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks).toEqual(['You see ', 'a torch.']);
  });

  it('throws a rate-limit error when the stream carries a 429 error part', async () => {
    const pending = bufferTextOrThrow(
      fakeFullStream([{ type: 'error', error: fakeRetryError([fakeApiCallError(429)]) }])
    );
    await expect(pending).rejects.toSatisfy(isRateLimitError);
  });

  it('throws even if some text arrived before the error part', async () => {
    const pending = bufferTextOrThrow(
      fakeFullStream([
        { type: 'text-delta', textDelta: 'Partial' },
        { type: 'error', error: new Error('stream broke') },
      ])
    );
    await expect(pending).rejects.toThrow('stream broke');
  });

  it('throws when the stream ends with no text and no error part', async () => {
    await expect(bufferTextOrThrow(fakeFullStream([{ type: 'finish' }]))).rejects.toThrow(
      /empty response/
    );
  });
});

describe('isRateLimitError', () => {
  it('recognizes a 429 status error', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it('does not flag other errors as rate limits', () => {
    expect(isRateLimitError({ status: 500 })).toBe(false);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});

describe('generateNarration', () => {
  it('returns the primary model stream on success', async () => {
    const streamText = vi.fn().mockResolvedValue({ textStream: fakeStream(['Hello']) });
    const stream = await generateNarration('a prompt', {
      streamText,
      primaryModel: 'primary',
      fallbackModel: 'fallback',
    });

    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual(['Hello']);
    expect(streamText).toHaveBeenCalledWith({ model: 'primary', prompt: 'a prompt' });
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('retries against the fallback model when the primary is rate limited', async () => {
    const streamText = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ textStream: fakeStream(['Fallback narration']) });

    const stream = await generateNarration('a prompt', {
      streamText,
      primaryModel: 'primary',
      fallbackModel: 'fallback',
    });

    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual(['Fallback narration']);
    expect(streamText).toHaveBeenNthCalledWith(1, { model: 'primary', prompt: 'a prompt' });
    expect(streamText).toHaveBeenNthCalledWith(2, { model: 'fallback', prompt: 'a prompt' });
  });

  it('propagates non-rate-limit errors without retrying', async () => {
    const streamText = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      generateNarration('a prompt', {
        streamText,
        primaryModel: 'primary',
        fallbackModel: 'fallback',
      })
    ).rejects.toThrow('network down');
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});

describe('generateNarration fallback', () => {
  const deps = (streamText: ReturnType<typeof vi.fn>) => ({
    streamText,
    primaryModel: 'primary',
    fallbackModel: 'fallback',
  });

  it('falls back when the primary model times out', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const streamText = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({ textStream: fakeStream(['ok']) });

    await generateNarration('p', deps(streamText));

    expect(streamText).toHaveBeenLastCalledWith({ model: 'fallback', prompt: 'p' });
  });

  it('falls back when the primary model returns an empty response', async () => {
    const empty = await bufferTextOrThrow(fakeFullStream([])).catch((e) => e);
    const streamText = vi
      .fn()
      .mockRejectedValueOnce(empty)
      .mockResolvedValueOnce({ textStream: fakeStream(['ok']) });

    await generateNarration('p', deps(streamText));

    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on a non-transient error', async () => {
    const streamText = vi.fn().mockRejectedValue(new Error('bad api key'));
    await expect(generateNarration('p', deps(streamText))).rejects.toThrow('bad api key');
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});

describe('generateNarration model per purpose (R3)', () => {
  const premiumDeps = (streamText: ReturnType<typeof vi.fn>) => ({
    streamText,
    primaryModel: 'lite-1',
    fallbackModel: 'lite-2',
    premiumModel: 'big',
  });
  const ok = () => vi.fn().mockResolvedValue({ textStream: fakeStream(['x']) });
  const modelUsed = async (purpose: AiPurpose, quality: 'fast' | 'good') => {
    const streamText = ok();
    await generateNarration('p', premiumDeps(streamText), { purpose, quality });
    return streamText.mock.calls[0][0].model;
  };

  it.each(['narration', 'epilogue', 'sequel'] as const)('%s uses the big model in a good room', async (purpose) => {
    expect(await modelUsed(purpose, 'good')).toBe('big');
  });

  it.each(['plan', 'summary', 'ask'] as const)('%s stays on lite in a good room', async (purpose) => {
    expect(await modelUsed(purpose, 'good')).toBe('lite-1');
  });

  it.each(['plan', 'narration', 'summary', 'epilogue', 'sequel', 'ask'] as const)(
    '%s uses lite in a fast room',
    async (purpose) => {
      expect(await modelUsed(purpose, 'fast')).toBe('lite-1');
    }
  );

  it('uses lite when no purpose is given', async () => {
    const streamText = ok();
    await generateNarration('p', premiumDeps(streamText));
    expect(streamText.mock.calls[0][0].model).toBe('lite-1');
  });

  it('falls back from the big model to lite, then to the second lite model', async () => {
    const streamText = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }))
      .mockResolvedValueOnce({ textStream: fakeStream(['x']) });
    await generateNarration('p', premiumDeps(streamText), { purpose: 'narration', quality: 'good' });
    expect(streamText.mock.calls.map((c) => c[0].model)).toEqual(['big', 'lite-1', 'lite-2']);
  });

  it('keeps the lite chain at two models', async () => {
    const err = Object.assign(new Error('x'), { status: 429 });
    const streamText = vi.fn().mockRejectedValue(err);
    await expect(
      generateNarration('p', premiumDeps(streamText), { purpose: 'plan', quality: 'good' })
    ).rejects.toBe(err);
    expect(streamText).toHaveBeenCalledTimes(2);
  });
});

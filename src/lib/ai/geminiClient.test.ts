import { describe, it, expect, vi } from 'vitest';
import { generateNarration, isRateLimitError } from './geminiClient';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

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

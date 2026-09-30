import { describe, it, expect, vi } from 'vitest';
import { triggerRoundProcessing } from './triggerRoundProcessing';

function response(ok: boolean, status: number): Response {
  return { ok, status } as Response;
}

describe('triggerRoundProcessing', () => {
  it('does not retry when the first attempt succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(true, 200));

    await triggerRoundProcessing('round-1', { fetchImpl, retryDelayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/round/process',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ roundId: 'round-1' }) })
    );
  });

  it('treats 409 (already claimed or processed) as success and does not retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(false, 409));

    await triggerRoundProcessing('round-1', { fetchImpl, retryDelayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once after a server error, then stops even if the retry also fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(false, 500));

    await triggerRoundProcessing('round-1', { fetchImpl, retryDelayMs: 0, maxAttempts: 2 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries once after a network failure, and succeeds if the retry works', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(response(true, 200));

    await triggerRoundProcessing('round-1', { fetchImpl, retryDelayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('waits retryDelayMs before the retry', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(false, 500))
      .mockResolvedValueOnce(response(true, 200));

    const promise = triggerRoundProcessing('round-1', { fetchImpl, retryDelayMs: 1500 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

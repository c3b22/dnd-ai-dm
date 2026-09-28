import { describe, it, expect } from 'vitest';
import { claimRound } from './claimRound';

function createFakeSupabase(matchingRows: any[] | null, error: Error | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: any = {
    update: (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return builder;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: 'or', args });
      return builder;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return Promise.resolve({ data: matchingRows, error });
    },
  };
  return { client: { from: () => builder } as any, calls };
}

describe('claimRound', () => {
  it('returns true when it is the only caller to claim a pending round', async () => {
    const { client } = createFakeSupabase([{ id: 'round-1' }]);
    await expect(claimRound(client, 'round-1')).resolves.toBe(true);
  });

  it('returns false when the round was already claimed by another caller', async () => {
    const { client } = createFakeSupabase([]);
    await expect(claimRound(client, 'round-1')).resolves.toBe(false);
  });

  it('throws if the update fails', async () => {
    const { client } = createFakeSupabase(null, new Error('boom'));
    await expect(claimRound(client, 'round-1')).rejects.toThrow('boom');
  });

  it('includes a staleness clause so a round stuck in processing can be re-claimed', async () => {
    const { client, calls } = createFakeSupabase([{ id: 'round-1' }]);
    await claimRound(client, 'round-1', 30_000);
    const orCall = calls.find((c) => c.method === 'or');
    expect(orCall).toBeDefined();
    expect(orCall!.args[0]).toContain('status.eq.pending');
    expect(orCall!.args[0]).toContain('status.eq.processing');
  });
});

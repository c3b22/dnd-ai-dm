import { describe, it, expect } from 'vitest';
import { recordSeen } from './seen';

function fake(opts: { player?: any; playerError?: any; updateError?: any; roundId?: string | null }) {
  const updates: any[] = [];
  const client: any = {
    from(table: string) {
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.player ?? null, error: opts.playerError ?? null }) }) }),
          }),
          update: (patch: any) => {
            updates.push(patch);
            return { eq: async () => ({ error: opts.updateError ?? null }) };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_round_id: opts.roundId ?? null }, error: null }) }) }),
      };
    },
  };
  return { client, updates };
}

const now = new Date('2026-10-09T12:00:00Z');
const p = { campaignId: 'c1', userId: 'u1', now };

describe('recordSeen', () => {
  it('stamps time and current round', async () => {
    const { client, updates } = fake({ player: { id: 'p1', last_seen_at: null }, roundId: 'r9' });
    expect(await recordSeen(client, p)).toEqual({ recorded: true });
    expect(updates).toEqual([{ last_seen_at: now.toISOString(), last_seen_round_id: 'r9' }]);
  });

  it('throttles to once a minute', async () => {
    const recent = new Date(now.getTime() - 30_000).toISOString();
    const { client, updates } = fake({ player: { id: 'p1', last_seen_at: recent } });
    expect(await recordSeen(client, p)).toEqual({ recorded: false, reason: 'throttled' });
    expect(updates).toEqual([]);
  });

  it('records again after a minute', async () => {
    const old = new Date(now.getTime() - 61_000).toISOString();
    const { client } = fake({ player: { id: 'p1', last_seen_at: old } });
    expect(await recordSeen(client, p)).toEqual({ recorded: true });
  });

  it('reports non-members', async () => {
    const { client } = fake({ player: null });
    expect(await recordSeen(client, p)).toEqual({ recorded: false, reason: 'not-a-member' });
  });

  it('tolerates missing columns on read and write', async () => {
    expect(await recordSeen(fake({ playerError: { code: '42703' } }).client, p)).toEqual({ recorded: false, reason: 'unsupported' });
    expect(
      await recordSeen(fake({ player: { id: 'p1', last_seen_at: null }, updateError: { code: '42703' } }).client, p)
    ).toEqual({ recorded: false, reason: 'unsupported' });
  });

  it('rethrows other errors', async () => {
    await expect(recordSeen(fake({ playerError: { code: '500', message: 'x' } }).client, p)).rejects.toBeDefined();
  });
});

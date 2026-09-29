import { describe, it, expect } from 'vitest';
import { createSupabaseRoundRepository } from './roundRepository';

interface FakeRoundRow {
  campaign_id?: string;
  opened_at?: string;
}

function createFakeSupabase(options: {
  roundsById: Record<string, FakeRoundRow>;
  campaignSummary: { summary: string; covers_up_to_round: string | null } | null;
}) {
  const messagesCalls: { method: string; args: unknown[] }[] = [];

  const client: any = {
    from(table: string) {
      if (table === 'rounds') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: () =>
                Promise.resolve({ data: options.roundsById[id] ?? null, error: null }),
              maybeSingle: () =>
                Promise.resolve({ data: options.roundsById[id] ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { adventure_id: 'test-adventure' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'round_actions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'campaign_summary') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: options.campaignSummary, error: null }),
            }),
          }),
        };
      }
      if (table === 'messages') {
        const builder: any = {
          select: (...args: unknown[]) => {
            messagesCalls.push({ method: 'select', args });
            return builder;
          },
          eq: (...args: unknown[]) => {
            messagesCalls.push({ method: 'eq', args });
            return builder;
          },
          gt: (...args: unknown[]) => {
            messagesCalls.push({ method: 'gt', args });
            return builder;
          },
          order: (...args: unknown[]) => {
            messagesCalls.push({ method: 'order', args });
            return builder;
          },
          limit: (...args: unknown[]) => {
            messagesCalls.push({ method: 'limit', args });
            return Promise.resolve({ data: [], error: null });
          },
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, messagesCalls };
}

describe('createSupabaseRoundRepository.getRoundContext', () => {
  it('bounds the messages query to only history after the last summarized round', async () => {
    const { client, messagesCalls } = createFakeSupabase({
      roundsById: {
        'round-2': { campaign_id: 'camp-1' },
        'round-1': { opened_at: '2026-01-01T00:00:00.000Z' },
      },
      campaignSummary: { summary: 'Old summary.', covers_up_to_round: 'round-1' },
    });

    const repository = createSupabaseRoundRepository(client);
    await repository.getRoundContext('round-2');

    const gtCall = messagesCalls.find((c) => c.method === 'gt');
    expect(gtCall).toBeDefined();
    expect(gtCall!.args).toEqual(['created_at', '2026-01-01T00:00:00.000Z']);
  });

  it('does not bound the messages query when no summary has been recorded yet', async () => {
    const { client, messagesCalls } = createFakeSupabase({
      roundsById: {
        'round-1': { campaign_id: 'camp-1' },
      },
      campaignSummary: null,
    });

    const repository = createSupabaseRoundRepository(client);
    await repository.getRoundContext('round-1');

    const gtCall = messagesCalls.find((c) => c.method === 'gt');
    expect(gtCall).toBeUndefined();
  });
});

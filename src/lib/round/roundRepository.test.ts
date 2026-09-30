import { describe, it, expect } from 'vitest';
import { createSupabaseRoundRepository } from './roundRepository';

interface FakeRoundRow {
  campaign_id?: string;
  opened_at?: string;
}

function createFakeSupabase(options: {
  roundsById: Record<string, FakeRoundRow>;
  campaignSummary: { summary: string; covers_up_to_round: string | null } | null;
  players?: unknown[];
  pendingWipe?: boolean;
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
                Promise.resolve({
                  data: { adventure_id: 'test-adventure', pending_wipe: options.pendingWipe ?? false },
                  error: null,
                }),
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
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: options.players ?? [], error: null }),
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

describe('createSupabaseRoundRepository.insertRollSummary', () => {
  it('stores the rolls as structured data the UI can render per-roll', async () => {
    const inserted: unknown[] = [];
    const client: any = {
      from: (table: string) => {
        if (table !== 'messages') throw new Error(`Unexpected table: ${table}`);
        return {
          insert: (payload: unknown) => {
            inserted.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const repository = createSupabaseRoundRepository(client);
    await repository.insertRollSummary('camp-1', 'round-1', [
      { playerDisplayName: 'Prem', roll: 20 },
      { playerDisplayName: 'Nueng', roll: 8 },
    ]);

    expect(inserted).toEqual([
      {
        campaign_id: 'camp-1',
        round_id: 'round-1',
        role: 'system',
        content: JSON.stringify({
          type: 'rolls',
          rolls: [
            { playerDisplayName: 'Prem', roll: 20 },
            { playerDisplayName: 'Nueng', roll: 8 },
          ],
        }),
      },
    ]);
  });

  it('does not touch the database when there are no rolls', async () => {
    let called = false;
    const client: any = {
      from: () => ({
        insert: () => {
          called = true;
          return Promise.resolve({ error: null });
        },
      }),
    };

    const repository = createSupabaseRoundRepository(client);
    await repository.insertRollSummary('camp-1', 'round-1', []);

    expect(called).toBe(false);
  });
});

describe('createSupabaseRoundRepository character state', () => {
  it('reads the characters and the pending wipe flag into the round context', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      pendingWipe: true,
      players: [
        { id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 12, max_hp: 18, status: 'downed', revives_since_sanctuary: 1 },
      ],
    });

    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');

    expect(context.pendingWipe).toBe(true);
    expect(context.characters).toEqual([
      { id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 12, maxHp: 18, status: 'downed', revivesSinceSanctuary: 1 },
    ]);
  });

  it('saves every character row and the wipe flag', async () => {
    const updates: { table: string; payload: unknown; id: string }[] = [];
    const client: any = {
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ table, payload, id });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    await createSupabaseRoundRepository(client).saveCharacterState(
      'camp-1',
      [{ id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 }],
      true
    );

    expect(updates).toEqual([
      { table: 'players', payload: { hp: 5, max_hp: 18, status: 'active', revives_since_sanctuary: 1 }, id: 'p1' },
      { table: 'campaigns', payload: { pending_wipe: true }, id: 'camp-1' },
    ]);
  });

  it('posts the changes as a stats system message, and nothing when there are none', async () => {
    const inserted: unknown[] = [];
    const client: any = {
      from: () => ({
        insert: (payload: unknown) => {
          inserted.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    };
    const repository = createSupabaseRoundRepository(client);

    await repository.insertStatsSummary('camp-1', 'round-1', []);
    expect(inserted).toEqual([]);

    await repository.insertStatsSummary('camp-1', 'round-1', ['Prem −5 HP']);
    expect(inserted).toEqual([
      {
        campaign_id: 'camp-1',
        round_id: 'round-1',
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes: ['Prem −5 HP'] }),
      },
    ]);
  });
});

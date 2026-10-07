import { describe, it, expect } from 'vitest';
import { handleRestAction } from './restVoteService';
import { RestVoteError } from './restVote';

interface World {
  campaign: Record<string, unknown>;
  players: Record<string, unknown>[];
  /** columns that "do not exist" yet */
  missing: string[];
  updates: Record<string, unknown>[];
}

function fakeClient(world: World) {
  const mentionsMissing = (cols: string) => cols.split(',').map((c) => c.trim()).find((c) => world.missing.includes(c));
  return {
    from(table: string) {
      return {
        select(cols: string) {
          const bad = mentionsMissing(cols);
          const rows = table === 'campaigns' ? (world.campaign ? [world.campaign] : []) : world.players;
          const result = bad
            ? { data: null, error: { message: `column ${table}.${bad} does not exist` } }
            : { data: rows.map((r) => Object.fromEntries(cols.split(',').map((c) => [c.trim(), r[c.trim()]]))), error: null };
          const chain: any = {
            eq: () => chain,
            maybeSingle: async () => (bad ? result : { data: (result.data as unknown[])[0] ?? null, error: null }),
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: async () => {
              const bad = Object.keys(payload).find((k) => world.missing.includes(k));
              if (bad) return { error: { message: `column "${bad}" of relation "campaigns" does not exist` } };
              world.updates.push(payload);
              Object.assign(world.campaign, payload);
              return { error: null };
            },
          };
        },
      };
    },
  } as any;
}

const mk = (over: Partial<World> = {}): World => ({
  campaign: { id: 'c1', current_round_id: 'r1', current_encounter: null, rest_vote: null },
  players: [
    { id: 'p1', user_id: 'u1', status: 'active', created_at: '2026-01-01', short_rests_used: 0 },
    { id: 'p2', user_id: 'u2', status: 'active', created_at: '2026-01-02', short_rests_used: 0 },
    { id: 'p3', user_id: 'u3', status: 'down', created_at: '2026-01-03', short_rests_used: 0 },
  ],
  missing: [],
  updates: [],
  ...over,
});

const run = (w: World, userId: string, action: 'propose' | 'agree' | 'cancel', kind?: 'short' | 'long') =>
  handleRestAction(fakeClient(w), { campaignId: 'c1', userId, action, kind });

describe('handleRestAction', () => {
  it('propose, then agree passes with 2 of 2 active players (downed player does not count)', async () => {
    const w = mk();
    const proposed = await run(w, 'u1', 'propose', 'short');
    expect(proposed?.status).toBe('open');
    const agreed = await run(w, 'u2', 'agree');
    expect(agreed).toMatchObject({ status: 'passed', agree: ['p1', 'p2'], roundId: 'r1', kind: 'short' });
    expect(w.campaign.rest_vote).toEqual(agreed);
  });

  it('refuses to propose during an encounter', async () => {
    const w = mk();
    w.campaign.current_encounter = { enemies: [{ name: 'Goblin', tier: 'normal', pip: 2, maxPip: 2, fled: false }] };
    await expect(run(w, 'u1', 'propose', 'long')).rejects.toMatchObject({ code: 'in_encounter', status: 409 });
  });

  it('a vote from a previous round is expired, so a new one can be proposed', async () => {
    const w = mk();
    w.campaign.rest_vote = { kind: 'long', proposerId: 'p1', agree: ['p1', 'p2'], roundId: 'r0', status: 'passed' };
    const v = await run(w, 'u2', 'propose', 'short');
    expect(v).toMatchObject({ roundId: 'r1', proposerId: 'p2', kind: 'short' });
  });

  it('cancel clears the vote; only proposer or owner', async () => {
    const w = mk();
    await run(w, 'u2', 'propose', 'long');
    await expect(run(w, 'u3', 'cancel')).rejects.toMatchObject({ code: 'forbidden' });
    expect(await run(w, 'u1', 'cancel')).toBeNull(); // p1 is the owner (oldest)
    expect(w.campaign.rest_vote).toBeNull();
  });

  it('refuses a short rest when everyone active already used both', async () => {
    const w = mk();
    for (const p of w.players) p.short_rests_used = 2;
    await expect(run(w, 'u1', 'propose', 'short')).rejects.toMatchObject({ code: 'no_short_rests_left' });
    expect(await run(w, 'u1', 'propose', 'long')).toMatchObject({ kind: 'long' });
  });

  it('tolerates missing short_rests_used and reports 503 when rest_vote is missing on write', async () => {
    const w = mk({ missing: ['short_rests_used'] });
    expect(await run(w, 'u1', 'propose', 'short')).toMatchObject({ status: 'open' });
    const w2 = mk({ missing: ['rest_vote'] });
    await expect(run(w2, 'u1', 'propose', 'short')).rejects.toMatchObject({ code: 'unavailable', status: 503 });
  });

  it('404 for non-members and unknown campaigns', async () => {
    await expect(run(mk(), 'zz', 'propose', 'short')).rejects.toMatchObject({ status: 404 });
    const w = mk();
    w.campaign = undefined as any;
    await expect(run(w, 'u1', 'propose', 'short')).rejects.toBeInstanceOf(RestVoteError);
  });
});

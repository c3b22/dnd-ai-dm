import { describe, it, expect, vi } from 'vitest';
import {
  selectFacts,
  planFactWrites,
  persistFacts,
  loadFacts,
  MAX_KEY_LENGTH,
  MAX_VALUE_LENGTH,
  MAX_FACTS_PER_ROUND,
  MAX_FACTS_PER_KIND,
} from './facts';
import type { CharacterTag } from '@/lib/character/tags';

describe('selectFacts', () => {
  it('keeps only npc/quest/clue tags and ignores the rest', () => {
    const tags: CharacterTag[] = [
      { kind: 'npc', key: 'Elara', value: 'friendly' },
      { kind: 'quest', key: 'Find ring', value: 'open' },
      { kind: 'clue', key: null, value: 'Blood on the door' },
      { kind: 'combat_end' } as CharacterTag,
    ];
    expect(selectFacts(tags)).toEqual([
      { kind: 'npc', key: 'Elara', value: 'friendly' },
      { kind: 'quest', key: 'Find ring', value: 'open' },
      { kind: 'clue', key: null, value: 'Blood on the door' },
    ]);
  });

  it('clamps key and value lengths and collapses whitespace', () => {
    const [npc, clue] = selectFacts([
      { kind: 'npc', key: 'K'.repeat(500), value: 'v  \n  w' },
      { kind: 'clue', key: null, value: 'c'.repeat(1000) },
    ]);
    expect(npc.key).toHaveLength(MAX_KEY_LENGTH);
    expect(npc.value).toBe('v w');
    expect(clue.value).toHaveLength(MAX_VALUE_LENGTH);
  });

  it('drops facts with an empty key or value', () => {
    expect(
      selectFacts([
        { kind: 'npc', key: '   ', value: 'x' },
        { kind: 'npc', key: 'A', value: '  ' },
        { kind: 'clue', key: null, value: '' },
      ])
    ).toEqual([]);
  });

  it('lets the last npc/quest tag per key win within a round', () => {
    expect(
      selectFacts([
        { kind: 'quest', key: 'Q', value: 'open' },
        { kind: 'quest', key: 'Q', value: 'done' },
      ])
    ).toEqual([{ kind: 'quest', key: 'Q', value: 'done' }]);
  });

  it('caps the number of facts per round', () => {
    const tags: CharacterTag[] = Array.from({ length: 40 }, (_, i) => ({ kind: 'clue', key: null, value: `clue ${i}` }));
    const result = selectFacts(tags);
    expect(result).toHaveLength(MAX_FACTS_PER_ROUND);
    expect(result[0].value).toBe('clue 0');
  });
});

describe('planFactWrites', () => {
  it('upserts known keys even when the kind is full, but refuses new keys', () => {
    const existing = Array.from({ length: MAX_FACTS_PER_KIND }, (_, i) => ({ kind: 'npc' as const, key: `n${i}`, value: 'x' }));
    const plan = planFactWrites(existing, [
      { kind: 'npc', key: 'n3', value: 'hostile' },
      { kind: 'npc', key: 'brand-new', value: 'x' },
    ]);
    expect(plan.upserts).toEqual([{ kind: 'npc', key: 'n3', value: 'hostile' }]);
  });

  it('skips exact-duplicate clues and respects the clue cap', () => {
    const existing = [{ kind: 'clue' as const, key: null, value: 'old clue' }];
    const plan = planFactWrites(existing, [
      { kind: 'clue', key: null, value: 'old clue' },
      { kind: 'clue', key: null, value: 'new clue' },
      { kind: 'clue', key: null, value: 'new clue' },
    ]);
    expect(plan.clues).toEqual([{ kind: 'clue', key: null, value: 'new clue' }]);

    const full = Array.from({ length: MAX_FACTS_PER_KIND }, (_, i) => ({ kind: 'clue' as const, key: null, value: `c${i}` }));
    expect(planFactWrites(full, [{ kind: 'clue', key: null, value: 'one more' }]).clues).toEqual([]);
  });

  it('counts new keys against the cap within the same batch', () => {
    const existing = Array.from({ length: MAX_FACTS_PER_KIND - 1 }, (_, i) => ({ kind: 'quest' as const, key: `q${i}`, value: 'open' }));
    const plan = planFactWrites(existing, [
      { kind: 'quest', key: 'a', value: 'open' },
      { kind: 'quest', key: 'b', value: 'open' },
    ]);
    expect(plan.upserts.map((f) => f.key)).toEqual(['a']);
  });
});

function fakeSupabase(opts: { existing?: unknown[]; selectError?: unknown; upsertError?: unknown; insertError?: unknown; throwOnFrom?: boolean } = {}) {
  const calls: { op: string; payload?: unknown; options?: unknown; eq?: unknown[] }[] = [];
  const client: any = {
    from(table: string) {
      if (opts.throwOnFrom) throw new Error('boom');
      expect(table).toBe('campaign_facts');
      return {
        select: (cols: string) => ({
          eq: (col: string, id: string) => {
            calls.push({ op: 'select', payload: cols, eq: [col, id] });
            const result = Promise.resolve({ data: opts.existing ?? [], error: opts.selectError ?? null });
            return Object.assign(result, { order: () => result });
          },
        }),
        upsert: (payload: unknown, options: unknown) => {
          calls.push({ op: 'upsert', payload, options });
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        insert: (payload: unknown) => {
          calls.push({ op: 'insert', payload });
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
  };
  return { client, calls };
}

describe('persistFacts', () => {
  it('upserts npc/quest on (campaign_id,kind,key) and inserts new clues', async () => {
    const { client, calls } = fakeSupabase({ existing: [{ kind: 'clue', key: null, value: 'seen' }] });
    await persistFacts(client, 'c1', [
      { kind: 'npc', key: 'Elara', value: 'friendly' },
      { kind: 'clue', key: null, value: 'seen' },
      { kind: 'clue', key: null, value: 'fresh' },
    ]);
    const upsert = calls.find((c) => c.op === 'upsert')!;
    expect(upsert.options).toEqual({ onConflict: 'campaign_id,kind,key' });
    expect(upsert.payload).toEqual([expect.objectContaining({ campaign_id: 'c1', kind: 'npc', key: 'Elara', value: 'friendly' })]);
    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.payload).toEqual([expect.objectContaining({ campaign_id: 'c1', kind: 'clue', key: null, value: 'fresh' })]);
  });

  it('does nothing for an empty list', async () => {
    const { client, calls } = fakeSupabase();
    await persistFacts(client, 'c1', []);
    expect(calls).toEqual([]);
  });

  it('never throws when the table is missing or a write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fact = [{ kind: 'npc' as const, key: 'A', value: 'b' }];
    await expect(persistFacts(fakeSupabase({ selectError: { code: '42P01' } }).client, 'c1', fact)).resolves.toBeUndefined();
    await expect(persistFacts(fakeSupabase({ upsertError: { message: 'x' } }).client, 'c1', fact)).resolves.toBeUndefined();
    await expect(persistFacts(fakeSupabase({ throwOnFrom: true }).client, 'c1', fact)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('loadFacts', () => {
  it('maps rows to CampaignFact', async () => {
    const { client } = fakeSupabase({
      existing: [{ id: 'f1', campaign_id: 'c1', kind: 'npc', key: 'Elara', value: 'friendly', updated_at: '2026-01-01T00:00:00Z' }],
    });
    expect(await loadFacts(client, 'c1')).toEqual([
      { id: 'f1', campaignId: 'c1', kind: 'npc', key: 'Elara', value: 'friendly', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
  });

  it('returns [] when the table is missing or the client throws', async () => {
    expect(await loadFacts(fakeSupabase({ selectError: { code: '42P01' } }).client, 'c1')).toEqual([]);
    expect(await loadFacts(fakeSupabase({ throwOnFrom: true }).client, 'c1')).toEqual([]);
  });
});

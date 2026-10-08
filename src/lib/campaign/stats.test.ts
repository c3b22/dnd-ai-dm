import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Character } from '@/lib/character/types';
import type { Encounter } from '@/lib/combat/encounter';
import type { CharacterTag } from '@/lib/character/tags';
import { addStats, defeatedThisRound, countDefeated, countStatusChanges, emptyStats, goldEarned, normalizeStats, persistCampaignStats } from './stats';

const MAX_PIP = { minion: 1, normal: 2, strong: 3, boss: 5 };
const enemy = (name: string, tier: 'minion' | 'normal' | 'strong' | 'boss', pip: number, fled = false) => ({
  name, tier, pip, maxPip: MAX_PIP[tier], fled,
});
const ch = (id: string, status: Character['status']) => ({ id, status }) as Character;

describe('normalizeStats', () => {
  it('turns null and junk into zeros', () => {
    expect(normalizeStats(null)).toEqual(emptyStats());
    expect(normalizeStats([1])).toEqual(emptyStats());
    expect(normalizeStats({ rounds: -3, gold: 'x', defeated: 5 })).toEqual(emptyStats());
  });
  it('keeps valid counts', () => {
    const s = normalizeStats({ rounds: 4, gold: 10, defeated: { boss: 1, minion: 2 }, nat20: 3 });
    expect(s).toMatchObject({ rounds: 4, gold: 10, nat20: 3, defeated: { boss: 1, minion: 2, normal: 0, strong: 0 } });
  });
});

describe('addStats', () => {
  it('adds a delta and ignores negatives', () => {
    const s = addStats(emptyStats(), { rounds: 1, defeated: { minion: 2, normal: 0, strong: 0, boss: 1 }, gold: 30, magicItems: 1, downs: 1, deaths: 0, nat20: 2 });
    expect(s).toEqual({ rounds: 1, defeated: { minion: 2, normal: 0, strong: 0, boss: 1 }, gold: 30, magicItems: 1, downs: 1, deaths: 0, nat20: 2 });
    const t = addStats(s, { rounds: 1, defeated: { minion: 0, normal: 0, strong: 0, boss: 0 }, gold: -50, magicItems: 0, downs: 0, deaths: 1, nat20: 0 });
    expect(t.rounds).toBe(2);
    expect(t.gold).toBe(30);
    expect(t.deaths).toBe(1);
  });
});

describe('countDefeated', () => {
  it('counts enemies newly at 0 pips by tier, not ones already down or fled', () => {
    const before: Encounter = { enemies: [enemy('a', 'minion', 1), enemy('b', 'boss', 5), enemy('c', 'normal', 0), enemy('d', 'strong', 3)] };
    const after: Encounter = { enemies: [enemy('a', 'minion', 0), enemy('b', 'boss', 2), enemy('c', 'normal', 0), enemy('d', 'strong', 0, true), enemy('e', 'strong', 0)] };
    expect(countDefeated(before, after)).toEqual({ minion: 1, normal: 0, strong: 1, boss: 0 });
  });
  it('handles missing encounters', () => {
    expect(countDefeated(null, null)).toEqual({ minion: 0, normal: 0, strong: 0, boss: 0 });
    expect(countDefeated(null, { enemies: [enemy('a', 'boss', 0)] }).boss).toBe(1);
  });
});

describe('countStatusChanges', () => {
  it('counts new downs and deaths only', () => {
    const before = [ch('1', 'active'), ch('2', 'downed'), ch('3', 'downed'), ch('4', 'active')];
    const after = [ch('1', 'downed'), ch('2', 'downed'), ch('3', 'dead'), ch('4', 'active')];
    expect(countStatusChanges(before, after)).toEqual({ downs: 1, deaths: 1 });
  });
});

describe('goldEarned', () => {
  it('sums positive deltas only', () => {
    expect(goldEarned({ a: 10, b: -4, c: 5 })).toBe(15);
  });
});

describe('persistCampaignStats', () => {
  const delta = { rounds: 1, defeated: { minion: 1, normal: 0, strong: 0, boss: 0 }, gold: 5, magicItems: 0, downs: 0, deaths: 0, nat20: 1 };
  const client = (selectResult: unknown, updateResult: unknown = { error: null }) => {
    const eqUpdate = vi.fn().mockResolvedValue(updateResult);
    const update = vi.fn(() => ({ eq: eqUpdate }));
    const supabase = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve(selectResult) }) }), update })) } as unknown as SupabaseClient;
    return { supabase, update };
  };
  it('adds onto the stored stats', async () => {
    const { supabase, update } = client({ data: { stats: { rounds: 2, gold: 10 } }, error: null });
    await persistCampaignStats(supabase, 'c', delta);
    expect(update).toHaveBeenCalledWith({ stats: expect.objectContaining({ rounds: 3, gold: 15, nat20: 1, defeated: expect.objectContaining({ minion: 1 }) }) });
  });
  it('starts from zero when stats is null', async () => {
    const { supabase, update } = client({ data: { stats: null }, error: null });
    await persistCampaignStats(supabase, 'c', delta);
    expect(update).toHaveBeenCalledWith({ stats: expect.objectContaining({ rounds: 1, gold: 5 }) });
  });
  it('throws when the column is missing', async () => {
    const { supabase } = client({ data: null, error: { message: 'column stats does not exist' } });
    await expect(persistCampaignStats(supabase, 'c', delta)).rejects.toBeTruthy();
  });
});

describe('defeatedThisRound', () => {
  const wolf = enemy('หมาป่า', 'normal', 2);
  const hurt = (name: string, tier: 'light' | 'medium' | 'heavy') => ({ kind: 'enemy_hurt', name, tier }) as unknown as CharacterTag;
  it('counts the last enemy felled by a hurt tag even though the fight collapses', () => {
    expect(defeatedThisRound({ enemies: [wolf] }, { enemies: [wolf] }, [hurt('หมาป่า', 'heavy')])).toEqual({ minion: 0, normal: 1, strong: 0, boss: 0 });
  });
  it('counts a kill by attack and one by tag together, and a light hit as nothing', () => {
    const a = enemy('a', 'minion', 1);
    const b = enemy('b', 'boss', 5);
    const c = enemy('c', 'strong', 1);
    const mid = { enemies: [{ ...a, pip: 0 }, b, c] };
    expect(defeatedThisRound({ enemies: [a, b, c] }, mid, [hurt('b', 'light'), hurt('c', 'heavy')])).toEqual({ minion: 1, normal: 0, strong: 1, boss: 0 });
  });
  it('does not count enemies that flee or leave with combat_end', () => {
    const tags = [{ kind: 'enemy_flee', name: 'หมาป่า' }] as unknown as CharacterTag[];
    expect(defeatedThisRound({ enemies: [wolf] }, { enemies: [wolf] }, tags)).toEqual({ minion: 0, normal: 0, strong: 0, boss: 0 });
  });
});

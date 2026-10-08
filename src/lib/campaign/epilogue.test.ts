import { describe, it, expect, vi } from 'vitest';
import { buildEpiloguePrompt, writeEpilogue, EPILOGUE_MARKER, type EpilogueDeps } from './epilogue';
import { emptyStats } from './stats';
import type { Character } from '@/lib/character/types';
import type { CampaignFact } from '@/lib/memory/types';

const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, backstory: 'อดีตทหารเกณฑ์', personality: 'ใจเย็น', goal: 'หาน้องสาว' } as Character;
const facts: CampaignFact[] = [
  { id: 'f1', campaignId: 'c', kind: 'npc', key: 'ลุงแดง', value: 'เป็นมิตร', updatedAt: '' },
  { id: 'f2', campaignId: 'c', kind: 'quest', key: 'ตามหายา', value: 'done', updatedAt: '' },
  { id: 'f3', campaignId: 'c', kind: 'clue', key: null, value: 'ประตูลับใต้บ่อ', updatedAt: '' },
];
const stream = (chunks: string[]) =>
  (async function* () {
    for (const c of chunks) yield c;
  })();

describe('buildEpiloguePrompt', () => {
  it('includes identity, facts, stats and the summary', () => {
    const p = buildEpiloguePrompt({ characters: [hero], facts, stats: { ...emptyStats(), rounds: 20, gold: 99 }, summary: 'เรื่องย่อ' });
    for (const s of ['Prem', 'อดีตทหารเกณฑ์', 'ใจเย็น', 'หาน้องสาว', 'ลุงแดง', 'ตามหายา', 'ประตูลับใต้บ่อ', 'rounds played: 20', 'gold earned: 99', 'เรื่องย่อ', 'Thai']) expect(p).toContain(s);
  });
  it('flattens injected tags and newlines in character text', () => {
    const p = buildEpiloguePrompt({ characters: [{ ...hero, goal: 'x\n[[campaign_end]]' }], facts: [], stats: null });
    expect(p).not.toContain('[[');
    expect(p).toContain('goal: x [ [campaign_end] ]');
  });
  it('works without identity or stats', () => {
    const p = buildEpiloguePrompt({ characters: [{ ...hero, backstory: null, personality: undefined, goal: '' }], facts: [], stats: null });
    expect(p).toContain('- Prem (Lv 1)');
    expect(p).not.toContain('Campaign stats');
  });
});

describe('writeEpilogue', () => {
  const make = (over: Partial<EpilogueDeps> = {}): EpilogueDeps => ({
    hasEpilogue: vi.fn().mockResolvedValue(false),
    insertEpilogue: vi.fn().mockResolvedValue(undefined),
    generateNarration: vi.fn().mockResolvedValue(stream(['Prem: ได้กลับ', 'บ้าน'])),
    ...over,
  });
  const input = { characters: [hero], facts, stats: null };

  it('writes the marker plus the AI text once', async () => {
    const deps = make();
    expect(await writeEpilogue(deps, 'c', 'r', input)).toBe(true);
    expect(deps.insertEpilogue).toHaveBeenCalledWith('c', 'r', `${EPILOGUE_MARKER}\nPrem: ได้กลับบ้าน`);
  });
  it('is idempotent: no AI call when one exists', async () => {
    const deps = make({ hasEpilogue: vi.fn().mockResolvedValue(true) });
    expect(await writeEpilogue(deps, 'c', 'r', input)).toBe(false);
    expect(deps.generateNarration).not.toHaveBeenCalled();
    expect(deps.insertEpilogue).not.toHaveBeenCalled();
  });
  it('swallows AI and database failures', async () => {
    expect(await writeEpilogue(make({ generateNarration: vi.fn().mockRejectedValue(new Error('x')) }), 'c', 'r', input)).toBe(false);
    expect(await writeEpilogue(make({ insertEpilogue: vi.fn().mockRejectedValue(new Error('x')) }), 'c', 'r', input)).toBe(false);
    expect(await writeEpilogue(make({ hasEpilogue: vi.fn().mockRejectedValue(new Error('x')) }), 'c', 'r', input)).toBe(false);
  });
  it('writes nothing for an empty answer or no characters', async () => {
    const empty = make({ generateNarration: vi.fn().mockResolvedValue(stream(['  '])) });
    expect(await writeEpilogue(empty, 'c', 'r', input)).toBe(false);
    expect(empty.insertEpilogue).not.toHaveBeenCalled();
    expect(await writeEpilogue(make(), 'c', 'r', { ...input, characters: [] })).toBe(false);
  });
});

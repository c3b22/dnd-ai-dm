import { describe, it, expect } from 'vitest';
import { emptyStats } from './stats';
import { MIN_CHAPTER_ROUNDS, chapterRounds, isCampaignEnded, shouldEndCampaign } from './campaignEnd';

const end = [{ kind: 'campaign_end' as const }];
const wolf = { enemies: [{ name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false }] };

describe('chapterRounds', () => {
  it('subtracts the chapter base', () => {
    expect(chapterRounds({ ...emptyStats(), rounds: 20, chapterBase: 8 })).toBe(12);
    expect(chapterRounds({ ...emptyStats(), rounds: 5 })).toBe(5);
  });
});

describe('shouldEndCampaign', () => {
  const stats = (rounds: number) => ({ ...emptyStats(), rounds });
  it('needs the tag, no fight and enough rounds', () => {
    expect(shouldEndCampaign({ tags: end, encounter: null, stats: stats(MIN_CHAPTER_ROUNDS) })).toBe(true);
    expect(shouldEndCampaign({ tags: end, encounter: null, stats: stats(MIN_CHAPTER_ROUNDS - 1) })).toBe(false);
    expect(shouldEndCampaign({ tags: end, encounter: wolf, stats: stats(50) })).toBe(false);
    expect(shouldEndCampaign({ tags: [], encounter: null, stats: stats(50) })).toBe(false);
  });
  it('ignores the tag when the stats are unknown', () => {
    expect(shouldEndCampaign({ tags: end, encounter: null, stats: null })).toBe(false);
  });
});

describe('isCampaignEnded', () => {
  const client = (result: unknown) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as any;
  it('is true only for status ended', async () => {
    expect(await isCampaignEnded(client({ data: { status: 'ended' }, error: null }), 'c1')).toBe(true);
    expect(await isCampaignEnded(client({ data: { status: 'active' }, error: null }), 'c1')).toBe(false);
  });
  it('treats a missing column or a failure as not ended', async () => {
    expect(await isCampaignEnded(client({ data: null, error: { message: 'column status does not exist' } }), 'c1')).toBe(false);
    expect(await isCampaignEnded({ from: () => { throw new Error('boom'); } } as any, 'c1')).toBe(false);
  });
});

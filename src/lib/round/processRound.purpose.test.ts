import { describe, it, expect, vi } from 'vitest';
import { processRound } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';
import { emptyStats } from '@/lib/campaign/stats';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0, xp: 0 };

function repo(context: object, extra: Partial<RoundRepository> = {}): RoundRepository {
  return {
    getRoundContext: vi.fn().mockResolvedValue({
      campaignId: 'camp-1', campaignSummary: '', recentMessages: [], pendingWipe: false,
      characters: [hero], inventories: { p1: [] }, currentShop: null, facts: [], tagsApplied: false,
      actions: [{ playerDisplayName: 'Prem', actionText: 'ดูรอบๆ', playerId: 'p1', useItemId: null }],
      adventure: null, allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
      ...context,
    }),
    claimRoundTags: vi.fn().mockResolvedValue(true),
    insertPlayerActionMessages: vi.fn().mockResolvedValue(undefined),
    insertRollSummary: vi.fn().mockResolvedValue(undefined),
    saveCharacterState: vi.fn().mockResolvedValue(undefined),
    saveInventories: vi.fn().mockResolvedValue(undefined),
    applyGold: vi.fn().mockResolvedValue(undefined),
    setShop: vi.fn().mockResolvedValue(undefined),
    setEncounter: vi.fn().mockResolvedValue(undefined),
    saveFacts: vi.fn().mockResolvedValue(undefined),
    saveMagicGiven: vi.fn().mockResolvedValue(undefined),
    insertStatsSummary: vi.fn().mockResolvedValue(undefined),
    insertDmMessagePlaceholder: vi.fn().mockResolvedValue('msg-1'),
    appendToMessage: vi.fn().mockResolvedValue(undefined),
    updateCampaignSummary: vi.fn().mockResolvedValue(undefined),
    closeRoundAndOpenNext: vi.fn().mockResolvedValue('round-2'),
    setCurrentScene: vi.fn().mockResolvedValue(undefined),
    ...extra,
  };
}

const run = (repository: RoundRepository, replies: string[]) => {
  const generateNarration = vi.fn();
  for (const r of replies) generateNarration.mockResolvedValueOnce(fakeStream([r]));
  generateNarration.mockResolvedValue(fakeStream(['ต่อ']));
  return processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration, rollDie: () => 10, rollSides: () => 1 }, 'round-1').then(
    () => generateNarration.mock.calls.map((c) => c[1])
  );
};

describe.each(['fast', 'good'] as const)('processRound AI call purposes, room quality %s (R3)', (quality) => {
  const settings = { dmQuality: quality };

  it('a table without dice makes one narration call', async () => {
    expect(await run(repo({ settings: { ...settings, diceEnabled: false } }), ['เล่า'])).toEqual([{ purpose: 'narration', quality }]);
  });

  it('a dice table that plans a check makes a plan call then a narration call', async () => {
    const plan = '{"checks":[{"player":"Prem","skill":"stealth","dc":12,"advantage":"none"}]}';
    expect(await run(repo({ settings }), [plan, 'เล่า'])).toEqual([
      { purpose: 'plan', quality },
      { purpose: 'narration', quality },
    ]);
  });

  it('rotating the campaign summary makes a summary call', async () => {
    const long = { role: 'dm' as const, content: 'x'.repeat(9000) };
    expect(await run(repo({ settings: { ...settings, diceEnabled: false }, recentMessages: [long] }), ['เล่า', 'สรุป'])).toEqual([
      { purpose: 'narration', quality },
      { purpose: 'summary', quality },
    ]);
  });

  it('the epilogue after a campaign end makes an epilogue call', async () => {
    const repository = repo({ settings: { ...settings, diceEnabled: false } }, {
      addCampaignStats: vi.fn().mockResolvedValue({ ...emptyStats(), rounds: 15 }),
      endCampaign: vi.fn().mockResolvedValue(undefined),
      hasEpilogue: vi.fn().mockResolvedValue(false),
      insertEpilogue: vi.fn().mockResolvedValue(undefined),
    });
    expect(await run(repository, ['จบแล้ว\n[[campaign_end]]', 'Prem: สุขสบาย'])).toEqual([
      { purpose: 'narration', quality },
      { purpose: 'epilogue', quality },
    ]);
  });
});

describe('processRound AI call quality default (R3)', () => {
  it('a room with no saved quality is treated as good', async () => {
    expect(await run(repo({ settings: { diceEnabled: false } }), ['เล่า'])).toEqual([{ purpose: 'narration', quality: 'good' }]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { processRound, FALLBACK_NOTE } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0, xp: 0 };

function repo(): RoundRepository {
  return {
    getRoundContext: vi.fn().mockResolvedValue({
      campaignId: 'camp-1', campaignSummary: '', recentMessages: [], pendingWipe: false,
      characters: [hero], inventories: { p1: [] }, currentShop: null, facts: [], tagsApplied: false,
      actions: [{ playerDisplayName: 'Prem', actionText: 'ดูรอบๆ', playerId: 'p1', useItemId: null }],
      adventure: null, allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
      settings: { diceEnabled: false },
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
  };
}

const run = async (usedFallback?: () => boolean) => {
  const repository = repo();
  await processRound(
    {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi.fn().mockImplementation(async () => fakeStream(['เล่า'])),
      usedFallback,
      rollDie: () => 10,
      rollSides: () => 1,
    },
    'round-1'
  );
  return (repository.insertStatsSummary as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as string[];
};

describe('processRound fallback note (R5)', () => {
  it('notes the lite fallback in the stats summary', async () => {
    const changes = await run(() => true);
    expect(changes).toContain(FALLBACK_NOTE);
    expect(FALLBACK_NOTE).toBe('DM ตอบช้า ใช้โหมดเร็วแทนในรอบนี้');
  });

  it('adds nothing when the big model answered', async () => {
    expect(await run(() => false)).not.toContain(FALLBACK_NOTE);
  });

  it('adds nothing when no tracker is wired', async () => {
    expect(await run(undefined)).not.toContain(FALLBACK_NOTE);
  });
});

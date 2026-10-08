import { describe, it, expect, vi } from 'vitest';
import { processRound } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';

// K5: a subclass ability inside a processed round.
async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

function createFakeRepository(context: object): RoundRepository {
  return {
    getRoundContext: vi.fn().mockResolvedValue({
      campaignId: 'camp-1', campaignSummary: '', recentMessages: [], inventories: {}, pendingWipe: false,
      currentShop: null, facts: [], tagsApplied: false, adventure: null,
      allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
      ...context,
    }),
    claimRoundTags: vi.fn().mockResolvedValue(true),
    insertPlayerActionMessages: vi.fn().mockResolvedValue(undefined),
    insertRollSummary: vi.fn().mockResolvedValue(undefined),
    saveCharacterState: vi.fn().mockResolvedValue(undefined),
    saveSpellSlotsUsed: vi.fn().mockResolvedValue(undefined),
    saveAbilityCooldowns: vi.fn().mockResolvedValue(undefined),
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

// Prem: level 1 warrior, DEX +2, so AC 12 (10 while a berserk strike is on).
const prem = {
  id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0,
  classId: 'warrior', xp: 0, abilityCooldown: 0, abilities: { STR: 15, DEX: 14, CON: 14, INT: 8, WIS: 12, CHA: 10 },
};
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const plan = '{"checks":[],"attacks":[{"player":"Prem","target":"หมี","advantage":"none"}],"enemyAttacks":[{"enemy":"หมี","player":"Prem"}]}';

function setup(characterOver: object, action: object) {
  const repository = createFakeRepository({
    actions: [{ playerDisplayName: 'Prem', actionText: 'สู้', playerId: 'p1', ...action }],
    characters: [{ ...prem, ...characterOver }],
    currentEncounter: { enemies: [bear] },
  });
  const go = async (rolls: number[]) => {
    const generate = vi.fn();
    generate.mockResolvedValueOnce(fakeStream([plan]));
    generate.mockResolvedValueOnce(fakeStream(['จบ']));
    const queue = [...rolls];
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: generate, rollDie: () => queue.shift() ?? 10, rollSides: () => 3 }, 'round-1');
    return generate;
  };
  return { repository, go };
}

describe('processRound subclasses (K5)', () => {
  it('berserker: the strike attacks with advantage for 2 pips, lowers AC by 2, and starts its own cooldown', async () => {
    const { repository, go } = setup({ subclassId: 'warrior_berserker' }, { useAbility: true });
    // rollDie order: the action die, the two attack dice (advantage), the enemy d20
    await go([10, 15, 15, 12]);
    expect(vi.mocked(repository.setEncounter).mock.calls[0][1]!.enemies[0].pip).toBe(1);
    expect((vi.mocked(repository.insertStatsSummary).mock.calls[0][2] as string[]).join(' ')).toContain('เทียบ AC 10');
    const saved = vi.mocked(repository.saveCharacterState).mock.calls[0][1];
    expect(saved[0].abilityCooldowns).toEqual({ berserk_strike: 3 });
    expect(saved[0].abilityCooldown).toBe(0);
    expect(saved[0]).not.toHaveProperty('roundAcBonus');
    expect(repository.saveAbilityCooldowns).toHaveBeenCalled();
  });

  it('the same warrior without a subclass guards instead and attacks for 1 pip', async () => {
    const { repository, go } = setup({}, { useAbility: true, abilityTargetId: null });
    await go([10, 15, 12]);
    expect(vi.mocked(repository.setEncounter).mock.calls[0][1]!.enemies[0].pip).toBe(2);
    expect((vi.mocked(repository.insertStatsSummary).mock.calls[0][2] as string[]).join(' ')).toContain('เทียบ AC 12');
  });

  it('tells the DM about the subclass in the narration prompt', async () => {
    const { go } = setup({ subclassId: 'warrior_guardian' }, {});
    const generate = await go([10, 15, 12]);
    expect(generate.mock.calls[0][0] as string).toContain('ผู้พิทักษ์');
  });
});

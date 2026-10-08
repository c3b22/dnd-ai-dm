import { describe, it, expect, vi } from 'vitest';
import { processRound } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';

// K6: abilities picked at level 6 / 9 inside a processed round.
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

const prem = {
  id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0,
  classId: 'warrior', xp: 600, abilityCooldown: 0, abilities: { STR: 15, DEX: 14, CON: 14, INT: 8, WIS: 12, CHA: 10 },
};
const mira = {
  id: 'm1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0,
  classId: 'mage', xp: 1320, abilityCooldown: 0, abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
};
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const plan = (player: string, target: string) => `{"checks":[],"attacks":[{"player":"${player}","target":"${target}","advantage":"none"}],"enemyAttacks":[]}`;

function setup(character: object, action: object, attackPlan: string) {
  const repository = createFakeRepository({
    actions: [{ playerDisplayName: (character as { displayName: string }).displayName, actionText: 'สู้', playerId: (character as { id: string }).id, ...action }],
    characters: [character],
    currentEncounter: { enemies: [wolf, bear] },
  });
  const go = async (rolls: number[]) => {
    const generate = vi.fn();
    generate.mockResolvedValueOnce(fakeStream([attackPlan]));
    generate.mockResolvedValueOnce(fakeStream(['จบ']));
    const queue = [...rolls];
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: generate, rollDie: () => queue.shift() ?? 10, rollSides: () => 3 }, 'round-1');
    return generate;
  };
  return { repository, go };
}

describe('processRound level 6 / 9 abilities (K6)', () => {
  it('sweep: one attack plan becomes two swings, and the pick keeps its own cooldown in the map', async () => {
    const { repository, go } = setup({ ...prem, abilityPicks: { '9': 'warrior_sweep' } }, { useAbility: true, abilityId: 'warrior_sweep' }, plan('Prem', 'หมาป่า'));
    // rollDie order: the action die, then one die per swing
    await go([10, 15, 15]);
    expect(vi.mocked(repository.setEncounter).mock.calls[0][1]!.enemies.map((e) => e.pip)).toEqual([1, 2]);
    const saved = vi.mocked(repository.saveCharacterState).mock.calls[0][1];
    expect(saved[0].abilityCooldowns).toEqual({ warrior_sweep: 4 });
    expect(saved[0].abilityCooldown).toBe(0);
    expect(repository.saveAbilityCooldowns).toHaveBeenCalled();
  });

  it('a character that did not pick the sweep gets one plain swing and no cooldown', async () => {
    const { repository, go } = setup({ ...prem, abilityPicks: { '9': 'warrior_blood_rush' } }, { useAbility: true, abilityId: 'warrior_sweep' }, plan('Prem', 'หมาป่า'));
    await go([10, 15]);
    expect(vi.mocked(repository.setEncounter).mock.calls[0][1]!.enemies.map((e) => e.pip)).toEqual([1, 3]);
    expect(vi.mocked(repository.saveCharacterState).mock.calls[0][1][0].abilityCooldowns).toBeUndefined();
  });

  it('meteor: hits every enemy that fails its save, the mage does not also attack, and its cooldown is saved', async () => {
    const { repository, go } = setup({ ...mira, abilityPicks: { '9': 'mage_meteor' } }, { useAbility: true, abilityId: 'mage_meteor' }, plan('Mira', 'หมี'));
    await go([10, 15, 15]);
    // saves use rollSides (3) and fail; the planned wand attack on the bear is dropped
    expect(vi.mocked(repository.setEncounter).mock.calls[0][1]!.enemies.map((e) => e.pip)).toEqual([0, 1]);
    expect(vi.mocked(repository.saveCharacterState).mock.calls[0][1][0].abilityCooldowns).toEqual({ mage_meteor: 5 });
    expect((vi.mocked(repository.insertStatsSummary).mock.calls[0][2] as string[]).join(' ')).toContain('ดาวตกเวท');
  });

  it('tells the DM about the picked abilities in the narration prompt', async () => {
    const { go } = setup({ ...prem, abilityPicks: { '6': 'warrior_stone_skin' } }, {}, plan('Prem', 'หมาป่า'));
    const generate = await go([10, 15]);
    expect(generate.mock.calls[0][0] as string).toContain('ผิวหินผา');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { processRound } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';

// K4: the mage's spell casts inside a processed round.
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

// Mira: level 1 mage (INT +2, +2 proficiency = +4 to spells, DC 12, 2 slots). Prem: warrior, AC 10 + DEX 2 = 12.
const mira = {
  id: 'p1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0,
  classId: 'mage', xp: 0, abilityCooldown: 0, abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
};
const prem = {
  id: 'p2', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0,
  classId: 'warrior', xp: 0, abilityCooldown: 0, abilities: { STR: 15, DEX: 14, CON: 14, INT: 8, WIS: 12, CHA: 10 },
};
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 4, maxPip: 4, fled: false };
const strongWolf = { name: 'หมาป่า', tier: 'strong' as const, pip: 6, maxPip: 6, fled: false };

const attackPlan = '{"checks":[],"attacks":[{"player":"Mira","target":"หมาป่า","advantage":"none"}],"enemyAttacks":[{"enemy":"หมาป่า","player":"Prem"}]}';
const enemyOnlyPlan = '{"checks":[],"enemyAttacks":[{"enemy":"หมาป่า","player":"Prem"}]}';

function setup(cast: object, over: { mira?: object; prem?: object; enemies?: object[] } = {}) {
  const repository = createFakeRepository({
    actions: [{ playerDisplayName: 'Mira', actionText: 'ร่ายเวท', playerId: 'p1', ...cast }],
    characters: [{ ...mira, ...(over.mira ?? {}) }, { ...prem, ...(over.prem ?? {}) }],
    currentEncounter: { enemies: over.enemies ?? [wolf] },
  });
  const go = async (rolls: number[], ...texts: string[]) => {
    const generate = vi.fn();
    texts.forEach((t) => generate.mockResolvedValueOnce(fakeStream([t])));
    const queue = [...rolls];
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: generate, rollDie: () => queue.shift() ?? 10, rollSides: () => 3 }, 'round-1');
    return generate;
  };
  return { repository, go };
}
const savedState = (r: RoundRepository) => vi.mocked(r.saveCharacterState).mock.calls[0][1];
const stats = (r: RoundRepository) => vi.mocked(r.insertStatsSummary).mock.calls[0]?.[2] ?? [];
const rollLines = (r: RoundRepository) => vi.mocked(r.insertRollSummary).mock.calls[0][2];

describe('processRound spells (K4)', () => {
  // rollDie order: the spell's d20 (resolved first), then each action's own die, then the enemy attack d20s.
  it('frost lance: server rolls the attack, takes the pips, dazes the enemy, spends the slot and tells the DM before it narrates', async () => {
    const { repository, go } = setup({ spellId: 'frost_lance', itemTarget: 'หมาป่า' }, { enemies: [strongWolf] });
    const generate = await go([15, 5, 18, 4], enemyOnlyPlan, 'หมาป่ามึนงง');
    // the first call already carries the server note
    const first = generate.mock.calls[0][0] as string;
    expect(first).toContain('(server: ');
    expect(first).toContain('ร่ายหอกน้ำแข็ง');
    expect(first).toContain('Spells cast above are resolved by the server');
    // 15 + 4 = 19 vs AC 15: hit, 2 pips: 6 -> 4; the dazed strong wolf (+6) rolls two dice and keeps the 4
    expect(repository.setEncounter).toHaveBeenCalledWith('camp-1', { enemies: [{ ...strongWolf, pip: 4 }] });
    const second = generate.mock.calls[1][0] as string;
    expect(second).toContain('rolled with disadvantage, the enemy is dazed');
    expect(second).toContain('d20 4 + 6 = 10 vs armor class 12 (rolled with disadvantage, the enemy is dazed) -> MISS');
    expect(savedState(repository).find((c) => c.id === 'p1')).toMatchObject({ spellSlotsUsed: 1 });
    expect(savedState(repository).find((c) => c.id === 'p2')).toMatchObject({ hp: 20 });
    expect(vi.mocked(repository.saveSpellSlotsUsed!).mock.calls[0][0].map((c) => [c.id, c.spellSlotsUsed])).toEqual([['p1', 1]]);
    expect(stats(repository).join(' ')).toContain('ร่ายหอกน้ำแข็ง');
  });

  it('shows the spell dice in the roll summary instead of the caster\'s plain die, and drops the caster\'s planned weapon attack', async () => {
    const { repository, go } = setup({ spellId: 'frost_lance', itemTarget: 'หมาป่า' }, { enemies: [strongWolf] });
    await go([15, 5, 18, 4], attackPlan, 'x');
    const lines = rollLines(repository);
    expect(lines).toContainEqual({
      playerDisplayName: 'Mira', roll: 15,
      spell: { name: 'หอกน้ำแข็ง', target: 'หมาป่า', kind: 'attack', bonus: 4, total: 19, dc: 15, success: true, critical: null, pips: 2 },
    });
    expect(lines.filter((l) => l.playerDisplayName === 'Mira')).toHaveLength(1);
    expect(lines.some((l) => l.attack)).toBe(false);
    expect(lines.some((l) => l.enemyAttack)).toBe(true);
  });

  it('a spell save is shown as its own line (hold foe fails: 3 + 2 = 5 vs DC 12) and the stunned enemy does not attack', async () => {
    const { repository, go } = setup({ spellId: 'hold_foe', itemTarget: 'หมาป่า' });
    const generate = await go([3, 5, 18], enemyOnlyPlan, 'หมาป่าขยับไม่ได้');
    const lines = rollLines(repository);
    expect(lines).toContainEqual({
      playerDisplayName: 'Mira', roll: 3,
      spell: { name: 'ตรึงร่าง', target: 'หมาป่า', kind: 'save', bonus: 2, total: 5, dc: 12, success: false, critical: null, pips: 0 },
    });
    expect(lines.some((l) => l.enemyAttack)).toBe(false);
    expect(savedState(repository).find((c) => c.id === 'p2')).toMatchObject({ hp: 20 });
    // no enemy attack was rolled, so the plan did not need a second narration with attack results
    expect(generate.mock.calls[1][0]).not.toContain('attacks Prem');
  });

  it('the surge starts its cooldown only on a working cast and keeps the slot', async () => {
    const { repository, go } = setup({ spellId: 'frost_lance', itemTarget: 'หมาป่า', useAbility: true });
    await go([15, 5], '{"narration":"x"}');
    const mage = savedState(repository).find((c) => c.id === 'p1')!;
    expect(mage.abilityCooldown).toBe(4);
    expect(mage.spellSlotsUsed ?? 0).toBe(0);
    expect(repository.saveSpellSlotsUsed).not.toHaveBeenCalled();
  });

  it('a cast with no slots left is refused: nothing is spent, no cooldown, the note says so', async () => {
    const { repository, go } = setup({ spellId: 'fire_burst', itemTarget: null }, { mira: { spellSlotsUsed: 2 } });
    const generate = await go([15, 5], '{"narration":"x"}');
    const mage = savedState(repository).find((c) => c.id === 'p1')!;
    expect(mage.spellSlotsUsed).toBe(2);
    expect(mage.abilityCooldown).toBe(0);
    expect(repository.saveSpellSlotsUsed).not.toHaveBeenCalled();
    expect(repository.setEncounter).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][0]).toContain('but it failed (no_slots)');
  });

  it('arcane shield raises Prem\'s AC to 15 for the enemy attack that round (14 would hit AC 12)', async () => {
    const { repository, go } = setup({ spellId: 'arcane_shield', itemTarget: null, abilityTargetId: 'p2' });
    const generate = await go([5, 9], enemyOnlyPlan, 'โล่เวทกันไว้');
    expect(generate.mock.calls[1][0]).toContain('d20 9 + 5 = 14 vs armor class 15 -> MISS');
    expect(savedState(repository).find((c) => c.id === 'p2')).toMatchObject({ hp: 20 });
    // the bonus is for the round only: never part of the saved character
    expect(savedState(repository).find((c) => c.id === 'p2')).not.toHaveProperty('roundAcBonus', 3);
  });

  it('spell ward lowers the first hit on Prem (1d8+2 with rollSides 3 = 5, ward 3 -> 2 damage)', async () => {
    const { repository, go } = setup({ spellId: 'spell_ward', itemTarget: null, abilityTargetId: 'p2' });
    await go([5, 15], enemyOnlyPlan, 'x');
    expect(savedState(repository).find((c) => c.id === 'p2')).toMatchObject({ hp: 18 });
  });

  it('quicken rhythm takes 2 off the friend\'s cooldown at the end of the round', async () => {
    const { repository, go } = setup({ spellId: 'quicken_rhythm', itemTarget: null, abilityTargetId: 'p2' }, { prem: { abilityCooldown: 3 } });
    await go([5], 'x');
    expect(savedState(repository).find((c) => c.id === 'p2')).toMatchObject({ abilityCooldown: 1 });
    expect(savedState(repository).find((c) => c.id === 'p1')!.spellSlotsUsed).toBe(1);
  });

  it('spells still resolve and are shown at a table with dice rolls turned off', async () => {
    const { repository, go } = setup({ spellId: 'frost_lance', itemTarget: 'หมาป่า' }, { enemies: [{ ...wolf, pip: 2 }] });
    vi.mocked(repository.getRoundContext).mockResolvedValue({
      ...(await repository.getRoundContext('round-1')),
      settings: { diceEnabled: false } as never,
    });
    const generate = await go([15, 5], 'เวทพุ่งไป');
    expect(generate).toHaveBeenCalledTimes(1);
    // the lance took the last 2 pips of the wolf, so the fight is over
    expect(repository.setEncounter).toHaveBeenCalledWith('camp-1', null);
    expect(vi.mocked(repository.insertRollSummary).mock.calls[0][2]).toHaveLength(1);
  });

  it('a stale retry (tags already applied) never casts a spell again', async () => {
    const { repository, go } = setup({ spellId: 'frost_lance', itemTarget: 'หมาป่า' });
    vi.mocked(repository.getRoundContext).mockResolvedValue({ ...(await repository.getRoundContext('round-1')), tagsApplied: true });
    await go([15]);
    expect(repository.saveSpellSlotsUsed).not.toHaveBeenCalled();
    expect(repository.setEncounter).not.toHaveBeenCalled();
  });
});

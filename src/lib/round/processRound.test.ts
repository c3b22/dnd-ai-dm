import { describe, it, expect, vi } from 'vitest';
import { processRound, ProcessRoundDeps } from './processRound';
import type { RoundRepository } from './roundRepository';
import { allowedScenes } from '@/lib/scenes/scenes';

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

function createFakeRepository(overrides: Partial<RoundRepository> = {}): RoundRepository {
  return {
    getRoundContext: vi.fn().mockResolvedValue({
      campaignId: 'camp-1',
      campaignSummary: '',
      recentMessages: [],
      actions: [{ playerDisplayName: 'Prem', actionText: 'Look around' }],
      characters: [],
      inventories: {},
      pendingWipe: false,
      currentShop: null,
      facts: [],
      tagsApplied: false,
      adventure: null,
      allowedSceneIds: allowedScenes(undefined).map((s) => s.id),
      sceneInstructionText: '',
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
    ...overrides,
  };
}

describe('processRound', () => {
  it('does nothing if the round was already claimed by another request', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(false),
      repository,
      generateNarration: vi.fn(),
    };

    const result = await processRound(deps, 'round-1');

    expect(result).toEqual({ processed: false });
    expect(repository.getRoundContext).not.toHaveBeenCalled();
    expect(deps.generateNarration).not.toHaveBeenCalled();
  });

  it('assembles the prompt, streams the narration into a message, and opens the next round', async () => {
    const repository = createFakeRepository();
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['You see ', 'a torch.']));
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration,
    };

    const result = await processRound(deps, 'round-1');

    expect(result).toEqual({ processed: true, messageId: 'msg-1', nextRoundId: 'round-2' });
    expect(repository.insertDmMessagePlaceholder).toHaveBeenCalledWith('camp-1', 'round-1');
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'You see a torch.');
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalledWith('camp-1', 'round-1');
    expect(repository.updateCampaignSummary).not.toHaveBeenCalled();
  });

  it('persists the round actions as player messages before the DM narration message', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi.fn().mockResolvedValue(fakeStream(['Narration.'])),
    };

    await processRound(deps, 'round-1');

    expect(repository.insertPlayerActionMessages).toHaveBeenCalledWith('camp-1', 'round-1', [
      { playerDisplayName: 'Prem', actionText: 'Look around' },
    ]);
    const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0];
    expect(order(repository.getRoundContext)).toBeLessThan(
      order(repository.insertPlayerActionMessages)
    );
    expect(order(repository.insertPlayerActionMessages)).toBeLessThan(
      order(repository.insertDmMessagePlaceholder)
    );
  });

  it('writes nothing and leaves the round open if narration generation fails', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi.fn().mockRejectedValue(new Error('Gemini down')),
    };

    await expect(processRound(deps, 'round-1')).rejects.toThrow('Gemini down');

    expect(repository.insertPlayerActionMessages).not.toHaveBeenCalled();
    expect(repository.insertDmMessagePlaceholder).not.toHaveBeenCalled();
    expect(repository.closeRoundAndOpenNext).not.toHaveBeenCalled();
  });

  it('rotates the campaign summary when recent history has grown past the threshold', async () => {
    const longMessage = { role: 'dm' as const, content: 'x'.repeat(9000) };
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: 'Old summary.',
        recentMessages: [longMessage],
        actions: [{ playerDisplayName: 'Prem', actionText: 'Continue' }],
        characters: [],
        pendingWipe: false,
      }),
    });
    const generateNarration = vi
      .fn()
      .mockResolvedValueOnce(fakeStream(['Narration.']))
      .mockResolvedValueOnce(fakeStream(['New summary.']));
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration,
    };

    await processRound(deps, 'round-1');

    expect(generateNarration).toHaveBeenCalledTimes(2);
    expect(repository.updateCampaignSummary).toHaveBeenCalledWith(
      'camp-1',
      'New summary.',
      'round-1'
    );
  });

  describe('when history is long enough to rotate the summary', () => {
    function longHistoryRepository() {
      return createFakeRepository({
        getRoundContext: vi.fn().mockResolvedValue({
          campaignId: 'camp-1',
          campaignSummary: 'Old summary.',
          recentMessages: [{ role: 'dm' as const, content: 'x'.repeat(9000) }],
          actions: [{ playerDisplayName: 'Prem', actionText: 'Continue' }],
          characters: [],
          pendingWipe: false,
        }),
      });
    }

    it('still closes the round if the summary call fails', async () => {
      const repository = longHistoryRepository();
      const deps: ProcessRoundDeps = {
        claimRound: vi.fn().mockResolvedValue(true),
        repository,
        generateNarration: vi
          .fn()
          .mockResolvedValueOnce(fakeStream(['Narration.']))
          .mockRejectedValueOnce(new Error('Gemini timed out')),
      };

      const result = await processRound(deps, 'round-1');

      expect(result).toEqual({ processed: true, messageId: 'msg-1', nextRoundId: 'round-2' });
      expect(repository.closeRoundAndOpenNext).toHaveBeenCalled();
      expect(repository.updateCampaignSummary).not.toHaveBeenCalled();
    });

    it('closes the round before spending time on the summary call', async () => {
      const repository = longHistoryRepository();
      const deps: ProcessRoundDeps = {
        claimRound: vi.fn().mockResolvedValue(true),
        repository,
        generateNarration: vi
          .fn()
          .mockResolvedValueOnce(fakeStream(['Narration.']))
          .mockResolvedValueOnce(fakeStream(['New summary.'])),
      };

      await processRound(deps, 'round-1');

      const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0];
      expect(order(repository.closeRoundAndOpenNext)).toBeLessThan(
        order(repository.updateCampaignSummary)
      );
    });
  });

  it('saves the narration with one write, not one read+update per streamed chunk', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi.fn().mockResolvedValue(fakeStream(['a', 'b', 'c', 'd', 'e'])),
    };

    await processRound(deps, 'round-1');

    expect(repository.appendToMessage).toHaveBeenCalledTimes(1);
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'abcde');
  });

  it('strips the scene tag from the message and moves the scene banner', async () => {
    const repository = createFakeRepository();
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi
        .fn()
        .mockResolvedValue(fakeStream(['You enter the inn.', '\n[[sce', 'ne: tavern-interior]]'])),
    };

    await processRound(deps, 'round-1');

    const appended = vi.mocked(repository.appendToMessage).mock.calls.map((c) => c[1]).join('');
    expect(appended).toBe('You enter the inn.');
    expect(repository.setCurrentScene).toHaveBeenCalledWith('camp-1', 'tavern-interior');
  });

  it('ignores a scene id the DM invented and never fails the round over it', async () => {
    const repository = createFakeRepository({
      setCurrentScene: vi.fn().mockRejectedValue(new Error('column missing')),
    });
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi
        .fn()
        .mockResolvedValueOnce(fakeStream(['Text.\n[[scene: not-a-real-place]]']))
        .mockResolvedValueOnce(fakeStream(['Text.\n[[scene: crypt]]'])),
    };

    await processRound(deps, 'round-1');
    expect(repository.setCurrentScene).not.toHaveBeenCalled();

    const second = await processRound(deps, 'round-1');
    expect(repository.setCurrentScene).toHaveBeenCalledWith('camp-1', 'crypt');
    expect(second.processed).toBe(true);
  });

  it('rolls a d20 per action on the server, tells the DM, and posts the results to the table', async () => {
    const repository = createFakeRepository();
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['Narration.']));
    const rollDie = vi.fn().mockReturnValueOnce(14);
    const deps: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration,
      rollDie,
    };

    await processRound(deps, 'round-1');

    expect(generateNarration.mock.calls[0][0]).toContain('Prem (rolled 14 on a d20): Look around');
    expect(repository.insertRollSummary).toHaveBeenCalledWith('camp-1', 'round-1', [
      { playerDisplayName: 'Prem', roll: 14 },
    ]);
  });
});

describe('processRound character status', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };

  function repoWith(characters: unknown[], extra: Record<string, unknown> = {}) {
    return createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: '',
        recentMessages: [],
        actions: [{ playerDisplayName: 'Prem', actionText: 'Attack' }],
        characters,
        pendingWipe: false,
        adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id),
        sceneInstructionText: '',
        ...extra,
      }),
    });
  }
  const deps = (repository: RoundRepository, narration: string[], extra: Partial<ProcessRoundDeps> = {}): ProcessRoundDeps => ({
    claimRound: vi.fn().mockResolvedValue(true),
    repository,
    generateNarration: vi.fn().mockResolvedValue(fakeStream(narration)),
    rollDie: () => 14,
    rollSides: () => 4,
    ...extra,
  });

  it('rolls the acting weapon damage and tells the DM', async () => {
    const repository = repoWith([prem]);
    const d = deps(repository, ['Narration.']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).toContain(
      'Prem (rolled 14 on a d20, shortsword damage roll 4): Attack'
    );
  });

  it('strips the tags from the posted narration, applies them and posts the stats line', async () => {
    const repository = repoWith([prem]);

    await processRound(deps(repository, ['Goblin hits.\n[[hurt: Prem | heavy]]\n[[scene: crypt]]']), 'round-1');

    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'Goblin hits.');
    expect(repository.saveCharacterState).toHaveBeenCalledWith(
      'camp-1',
      [expect.objectContaining({ id: 'p1', hp: 12 })],
      false
    );
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −8 HP']);
  });

  it('records a party wipe so the next round narrates the aftermath', async () => {
    const repository = repoWith([{ ...prem, hp: 5 }]);

    await processRound(deps(repository, ['Down.\n[[hurt: Prem | heavy]]']), 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ status: 'active', maxHp: 16, hp: 8 })], true);
  });

  it('clears the wipe flag and posts no stats when nothing happened', async () => {
    const repository = repoWith([prem], { pendingWipe: true });

    await processRound(deps(repository, ['A quiet round.']), 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ hp: 20 })], false);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', []);
  });

  it('puts the aftermath instruction in the prompt while a wipe is pending', async () => {
    const repository = repoWith([prem], { pendingWipe: true });
    const d = deps(repository, ['ok']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).toContain('defeated last round');
  });

  it('still applies tags when dice are disabled, but rolls no weapon damage', async () => {
    const repository = repoWith([prem], { settings: { diceEnabled: false } });
    const d = deps(repository, ['Hit.\n[[hurt: Prem | light]]']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).not.toContain('damage roll');
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ hp: 16 })], false);
  });

  it('still closes the round when saving character state fails', async () => {
    const repository = repoWith([prem]);
    (repository.saveCharacterState as any).mockRejectedValue(new Error('db down'));

    const result = await processRound(deps(repository, ['Hit.\n[[hurt: Prem | light]]']), 'round-1');

    expect(result.processed).toBe(true);
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalled();
  });

  it('does nothing about characters when the campaign has none', async () => {
    const repository = repoWith([]);

    await processRound(deps(repository, ['Plain.']), 'round-1');

    expect(repository.saveCharacterState).not.toHaveBeenCalled();
    expect(repository.insertStatsSummary).not.toHaveBeenCalled();
  });

  it('claims the right to apply tags before saving anything, so a losing claim skips tag effects entirely', async () => {
    const repository = repoWith([prem]);
    (repository.claimRoundTags as any).mockResolvedValue(false);

    await processRound(deps(repository, ['Hit.\n[[hurt: Prem | light]]']), 'round-1');

    expect(repository.saveCharacterState).not.toHaveBeenCalled();
    expect(repository.insertStatsSummary).not.toHaveBeenCalled();
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalledWith('camp-1', 'round-1');
  });

  it('skips narration and re-rolling entirely when an earlier attempt already applied this round\'s tags, and just closes it', async () => {
    const repository = repoWith([prem], { tagsApplied: true });
    const generateNarration = vi.fn();

    const result = await processRound(deps(repository, [], { generateNarration }), 'round-1');

    expect(generateNarration).not.toHaveBeenCalled();
    expect(repository.insertPlayerActionMessages).not.toHaveBeenCalled();
    expect(repository.saveCharacterState).not.toHaveBeenCalled();
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalledWith('camp-1', 'round-1');
    expect(result).toEqual({ processed: true, nextRoundId: 'round-2' });
  });
});

const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 10, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };
const potion = { itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false };
const contextWith = (over: object) => ({
  campaignId: 'camp-1', campaignSummary: '', recentMessages: [], pendingWipe: false,
  characters: [prem], inventories: { p1: [potion] }, currentShop: null,
  actions: [{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', useItemId: 'potion_minor' }],
  adventure: null, allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
  ...over,
});
const claim = () => vi.fn().mockResolvedValue(true);

describe('processRound inventory', () => {
  it('resolves a potion before narration: prompt shows the healed HP and note, item is consumed, log line posted', async () => {
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(contextWith({})) });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['เล่าเรื่อง']));
    await processRound({ claimRound: claim(), repository, generateNarration, rollDie: () => 7, rollSides: () => 4 }, 'round-1');

    const prompt = generateNarration.mock.calls[0][0] as string;
    expect(prompt).toContain('HP 15/20');
    expect(prompt).toContain('(server: drank ยาฟื้นฟูเล็ก and recovered 5 HP)');
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [{ playerId: 'p1', items: [], baseItems: [potion] }]);
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ id: 'p1', hp: 15 })], false);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ดื่ม ยาฟื้นฟูเล็ก (+5 HP)']);
  });

  it('ignores a potion the player does not own and still runs the round', async () => {
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(contextWith({ inventories: { p1: [] } })) });
    const result = await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollSides: () => 4 }, 'round-1');
    expect(result.processed).toBe(true);
    expect(repository.saveInventories).not.toHaveBeenCalled();
  });

  it('applies give and take tags, strips them from the narration, and lists them after the HP lines', async () => {
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({ actions: [{ playerDisplayName: 'Prem', actionText: 'สำรวจ', playerId: 'p1', useItemId: null }] })),
    });
    const narration = ['เจอของ', '[[hurt: Prem | light]]', '[[give: Prem | story: Rusty Key]]', '[[take: Prem | potion_minor]]'].join('\n');
    await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 4 }, 'round-1');

    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'เจอของ');
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [
      {
        playerId: 'p1',
        items: [{ itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false }],
        baseItems: [potion],
      },
    ]);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −4 HP', 'Prem ได้รับ Rusty Key', 'Prem เสียไป ยาฟื้นฟูเล็ก']);
  });

  it('applies armor to hurt tags using the character armorReduction', async () => {
    const armored = { ...prem, hp: 20, armorReduction: 2 };
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [armored], inventories: {}, actions: [{ playerDisplayName: 'Prem', actionText: 'สู้', playerId: 'p1', useItemId: null }] })),
    });
    await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['[[hurt: Prem | medium]]'])), rollSides: () => 4 }, 'round-1');
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −3 HP (เกราะกัน 2)']);
  });

  it('still closes the round when saving inventories fails', async () => {
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({})),
      saveInventories: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const result = await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollSides: () => 4 }, 'round-1');
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
  });

  it('still posts the stats line when saving inventories fails', async () => {
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({})),
      saveInventories: vi.fn().mockRejectedValue(new Error('unique violation')),
    });
    await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollSides: () => 4 }, 'round-1');
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ดื่ม ยาฟื้นฟูเล็ก (+5 HP)']);
  });
});

describe('processRound economy', () => {
  const gold = { ...prem, gold: 10 };
  const one = (over: object = {}) => createFakeRepository({
    getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [gold], inventories: {}, actions: [{ playerDisplayName: 'Prem', actionText: 'ค้นศพ', playerId: 'p1', useItemId: null }], ...over })),
  });
  const run = (repository: RoundRepository, narration: string) =>
    processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 1 }, 'round-1');

  it('awards and deducts gold with the server roll, applies it atomically, strips the tags and logs after the other lines', async () => {
    const repository = one();
    await run(repository, ['เจอเหรียญ', '[[gold: Prem | small]]', '[[pay: Prem | medium]]'].join('\n'));
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'เจอเหรียญ');
    expect(repository.applyGold).toHaveBeenCalledWith([{ playerId: 'p1', delta: -4 }]); // +4 then -8, net -4
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ได้รับ 4 ทอง', 'Prem เสียไป 8 ทอง']);
  });

  it('opens a shop, and closes it on a shop_close tag', async () => {
    const open = one();
    await run(open, '[[shop: Old Mara | potion_minor, lightsaber]]');
    expect(open.setShop).toHaveBeenCalledWith('camp-1', { name: 'Old Mara', itemIds: ['potion_minor'] });

    const close = one({ currentShop: { name: 'Old Mara', itemIds: ['staff'] } });
    await run(close, '[[shop_close]]');
    expect(close.setShop).toHaveBeenCalledWith('camp-1', null);
  });

  it('closes the open shop when the scene actually changes, but not when the same scene is repeated', async () => {
    const shop = { name: 'Old Mara', itemIds: ['staff'] };
    const moved = one({ currentShop: shop, currentSceneId: 'crypt' });
    await run(moved, ['ออกมาแล้ว', '[[scene: tavern-interior]]'].join('\n'));
    expect(moved.setShop).toHaveBeenCalledWith('camp-1', null);

    const same = one({ currentShop: shop, currentSceneId: 'tavern-interior' });
    await run(same, ['ยังอยู่ที่เดิม', '[[scene: tavern-interior]]'].join('\n'));
    expect(same.setShop).not.toHaveBeenCalled();
  });

  it('shows the open shop in the prompt', async () => {
    const repository = one({ currentShop: { name: 'Old Mara', itemIds: ['staff'] } });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['ok']));
    await processRound({ claimRound: claim(), repository, generateNarration, rollSides: () => 1 }, 'round-1');
    expect(generateNarration.mock.calls[0][0]).toContain('Old Mara');
  });

  it('still posts the stats line and closes the round when gold or shop persistence fails', async () => {
    const repository = one({});
    vi.mocked(repository.applyGold).mockRejectedValue(new Error('db down'));
    vi.mocked(repository.setShop).mockRejectedValue(new Error('db down'));
    const result = await run(repository, ['[[gold: Prem | small]]', '[[shop: Mara | staff]]'].join('\n'));
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ได้รับ 4 ทอง']);
  });
});

describe('processRound leveling', () => {
  const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };

  function repoWith(characters: unknown[], extra: Record<string, unknown> = {}) {
    return createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: '',
        recentMessages: [],
        actions: [{ playerDisplayName: 'Prem', actionText: 'Attack' }],
        characters,
        pendingWipe: false,
        adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id),
        sceneInstructionText: '',
        ...extra,
      }),
    });
  }
  const deps = (repository: RoundRepository, narration: string[], extra: Partial<ProcessRoundDeps> = {}): ProcessRoundDeps => ({
    claimRound: vi.fn().mockResolvedValue(true),
    repository,
    generateNarration: vi.fn().mockResolvedValue(fakeStream(narration)),
    rollDie: () => 14,
    rollSides: () => 4,
    ...extra,
  });

  it('pays xp to active players, saves it with their state and posts the xp line', async () => {
    const repository = repoWith([hero]);

    await processRound(deps(repository, ['Well done.\n[[xp: medium]]']), 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ id: 'p1', xp: 25 })], false);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['ทุกคนได้ +25 XP']);
  });

  it('adds the level damage bonus to the weapon roll the DM sees', async () => {
    const repository = repoWith([{ ...hero, xp: 150, maxHp: 30 }]);
    const d = deps(repository, ['Narration.']);

    await processRound(d, 'round-1');

    // level 3 = +1 damage on top of the rolled 4
    expect((d.generateNarration as any).mock.calls[0][0]).toContain('shortsword damage roll 5');
  });

  it('gives a downed player no xp while an active teammate still gets it', async () => {
    const downed = { ...hero, hp: 0, status: 'downed' as const };
    const suki = { ...hero, id: 'p2', displayName: 'Suki' };
    const repository = repoWith([downed, suki]);

    await processRound(deps(repository, ['Well done.\n[[xp: large]]']), 'round-1');

    const saved = (repository.saveCharacterState as any).mock.calls[0][1];
    expect(saved[0]).toMatchObject({ id: 'p1', status: 'downed' });
    expect(saved[0].xp ?? 0).toBe(0);
    expect(saved[1].xp).toBe(50);
  });

  it('pays no xp in a round where the whole party was wiped', async () => {
    const repository = repoWith([{ ...hero, hp: 5 }]);

    await processRound(deps(repository, ['Down.\n[[hurt: Prem | heavy]]\n[[xp: large]]']), 'round-1');

    const saved = (repository.saveCharacterState as any).mock.calls[0][1][0];
    expect(saved.status).toBe('active');
    expect(saved.xp ?? 0).toBe(0);
    const lines = (repository.insertStatsSummary as any).mock.calls[0][2] as string[];
    expect(lines.some((line) => line.includes('XP'))).toBe(false);
  });

  it('does not add xp again when a retry finds the round\'s tags already applied', async () => {
    const repository = repoWith([hero], { tagsApplied: true });

    await processRound(deps(repository, ['Well done.\n[[xp: large]]']), 'round-1');

    expect(repository.saveCharacterState).not.toHaveBeenCalled();
  });
});

describe('processRound abilities', () => {
  const base = { hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };
  const archer = { ...base, id: 'p1', displayName: 'Prem', weaponId: 'shortbow', classId: 'archer', abilityCooldown: 0 };
  const warrior = { ...base, id: 'p1', displayName: 'Prem', weaponId: 'shortsword', classId: 'warrior', abilityCooldown: 0 };
  const suki = { ...base, id: 'p2', displayName: 'Suki', weaponId: 'staff', classId: 'cleric', abilityCooldown: 0 };
  const useAbility = (target: string | null = null) => ({ playerDisplayName: 'Prem', actionText: 'ใช้ความสามารถ', playerId: 'p1', useAbility: true, abilityTargetId: target });

  function repoWith(characters: unknown[], actions: unknown[], extra: Record<string, unknown> = {}) {
    return createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: '',
        recentMessages: [],
        actions,
        characters,
        pendingWipe: false,
        adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id),
        sceneInstructionText: '',
        ...extra,
      }),
    });
  }
  const deps = (repository: RoundRepository, narration: string[]): ProcessRoundDeps => ({
    claimRound: vi.fn().mockResolvedValue(true),
    repository,
    generateNarration: vi.fn().mockResolvedValue(fakeStream(narration)),
    rollDie: () => 14,
    rollSides: () => 4,
  });
  const saved = (repository: RoundRepository) => (repository.saveCharacterState as any).mock.calls[0][1] as any[];

  it('replaces the action damage with the ability roll and tells the DM', async () => {
    const repository = repoWith([archer], [useAbility()]);
    const d = deps(repository, ['Narration.']);
    await processRound(d, 'round-1');
    const prompt = (d.generateNarration as any).mock.calls[0][0] as string;
    expect(prompt).toContain('shortbow damage roll 8');
    expect(prompt).toContain('used ยิงแม่นยำ: damage roll 8');
  });

  it('tells the DM when the ability was not ready', async () => {
    const repository = repoWith([{ ...archer, abilityCooldown: 2 }], [useAbility()]);
    const d = deps(repository, ['Narration.']);
    await processRound(d, 'round-1');
    expect((d.generateNarration as any).mock.calls[0][0]).toContain('tried to use ยิงแม่นยำ but it was not ready');
  });

  it("moves a guarded ally's hurt to the warrior", async () => {
    const repository = repoWith([warrior, suki], [useAbility('p2')]);
    await processRound(deps(repository, ['Ow.\n[[hurt: Suki | medium]]']), 'round-1');
    const [w, s] = saved(repository);
    expect(w.hp).toBe(17); // ceil(5 / 2) = 3
    expect(s.hp).toBe(20);
  });

  it('applies a cleric heal before narration so the saved HP includes it', async () => {
    const cleric = { ...suki, id: 'p1', displayName: 'Prem', classId: 'cleric' };
    const hurt = { ...base, id: 'p2', displayName: 'Suki', weaponId: 'staff', hp: 10, classId: null };
    const repository = repoWith([cleric, hurt], [useAbility('p2')]);
    await processRound(deps(repository, ['Narration.']), 'round-1');
    expect(saved(repository)[1].hp).toBe(15);
  });

  it('ticks cooldowns only on eventful rounds', async () => {
    const eventful = repoWith([{ ...archer, abilityCooldown: 2 }], []);
    await processRound(deps(eventful, ['Well done.\n[[xp: small]]']), 'round-1');
    expect(saved(eventful)[0].abilityCooldown).toBe(1);

    const sceneOnly = repoWith([{ ...archer, abilityCooldown: 2 }], []);
    await processRound(deps(sceneOnly, ['Quiet.\n[[scene: crypt]]']), 'round-1');
    expect(saved(sceneOnly)[0].abilityCooldown).toBe(2);

    const silent = repoWith([{ ...archer, abilityCooldown: 2 }], []);
    await processRound(deps(silent, ['Nothing happens.']), 'round-1');
    expect(saved(silent)[0].abilityCooldown).toBe(2);
  });

  it('does not tick on tags that changed nothing (unknown name, unknown item, a sanctuary alone)', async () => {
    for (const narration of [
      'Hm.\n[[hurt: Nobody | light]]',
      'Hm.\n[[give: Prem | not_an_item]]',
      'Safe.\n[[sanctuary]]',
    ]) {
      const repository = repoWith([{ ...archer, abilityCooldown: 2 }], []);
      await processRound(deps(repository, [narration]), 'round-1');
      expect(saved(repository)[0].abilityCooldown, narration).toBe(2);
    }
  });

  it('starts the full cooldown for the player who used it, even on an eventful round', async () => {
    const repository = repoWith([archer], [useAbility()]);
    await processRound(deps(repository, ['Hit!\n[[xp: small]]']), 'round-1');
    expect(saved(repository)[0].abilityCooldown).toBe(3);
  });

  it('does not tick or set a cooldown when a retry finds the tags already applied', async () => {
    const repository = repoWith([archer], [useAbility()], { tagsApplied: true });
    await processRound(deps(repository, ['Hit!\n[[xp: small]]']), 'round-1');
    expect(repository.saveCharacterState).not.toHaveBeenCalled();
  });

  it('logs the ability use in the stats line', async () => {
    const repository = repoWith([archer], [useAbility()]);
    await processRound(deps(repository, ['Hit.']), 'round-1');
    expect((repository.insertStatsSummary as any).mock.calls[0][2]).toContain('Prem ใช้ยิงแม่นยำ');
  });
});

describe('processRound encounter', () => {
  const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0, xp: 0 };
  const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
  const one = (over: object = {}) => createFakeRepository({
    getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [hero], inventories: {}, actions: [{ playerDisplayName: 'Prem', actionText: 'สู้', playerId: 'p1', useItemId: null }], ...over })),
  });
  const run = (repository: RoundRepository, narration: string) =>
    processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 1 }, 'round-1');

  it('shows the current enemies in the prompt', async () => {
    const repository = one({ currentEncounter: { enemies: [wolf] } });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['ok']));
    await processRound({ claimRound: claim(), repository, generateNarration, rollSides: () => 1 }, 'round-1');
    expect(generateNarration.mock.calls[0][0]).toContain('- หมาป่า (normal): 2/2 pips');
  });

  it('starts an encounter from an enemy tag and strips the tag', async () => {
    const repository = one();
    await run(repository, ['หมาป่าโผล่มา', '[[enemy: หมาป่า | normal]]'].join('\n'));
    expect(repository.setEncounter).toHaveBeenCalledWith('camp-1', { enemies: [wolf] });
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'หมาป่าโผล่มา');
  });

  it('updates the stored encounter on a hurt tag and ends it when the last enemy falls', async () => {
    const hurt = one({ currentEncounter: { enemies: [wolf] } });
    await run(hurt, '[[enemy_hurt: หมาป่า | light]]');
    expect(hurt.setEncounter).toHaveBeenCalledWith('camp-1', { enemies: [{ ...wolf, pip: 1 }] });

    const dead = one({ currentEncounter: { enemies: [wolf] } });
    await run(dead, '[[enemy_hurt: หมาป่า | heavy]]');
    expect(dead.setEncounter).toHaveBeenCalledWith('camp-1', null);
  });

  it('does not write when nothing changed', async () => {
    const quiet = one({ currentEncounter: { enemies: [wolf] } });
    await run(quiet, 'เงียบสงบ');
    expect(quiet.setEncounter).not.toHaveBeenCalled();
    const none = one();
    await run(none, 'เงียบสงบ');
    expect(none.setEncounter).not.toHaveBeenCalled();
  });

  it('ends the fight when the scene changes, but not when the same scene repeats', async () => {
    const moved = one({ currentEncounter: { enemies: [wolf] }, currentSceneId: 'crypt' });
    await run(moved, ['หนีออกมา', '[[scene: tavern-interior]]'].join('\n'));
    expect(moved.setEncounter).toHaveBeenCalledWith('camp-1', null);

    const same = one({ currentEncounter: { enemies: [wolf] }, currentSceneId: 'tavern-interior' });
    await run(same, ['ยังสู้อยู่', '[[scene: tavern-interior]]'].join('\n'));
    expect(same.setEncounter).not.toHaveBeenCalled();
  });

  it('gives no automatic xp or gold when enemies fall', async () => {
    const repository = one({ currentEncounter: { enemies: [wolf] } });
    await run(repository, '[[enemy_hurt: หมาป่า | heavy]]');
    expect(repository.applyGold).not.toHaveBeenCalled();
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', []);
    const saved = vi.mocked(repository.saveCharacterState).mock.calls[0][1];
    expect(saved[0].xp).toBe(0);
  });

  it('still closes the round when saving the encounter fails', async () => {
    const repository = one();
    vi.mocked(repository.setEncounter).mockRejectedValue(new Error('no column'));
    const result = await run(repository, '[[enemy: หมาป่า | normal]]');
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
  });
});

const NL = String.fromCharCode(10);
describe('processRound magic items (F5f)', () => {
  const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0, xp: 0 };
  const one = (magicGiven?: string[] | null) => createFakeRepository({
    getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [hero], inventories: {}, magicGiven, actions: [{ playerDisplayName: 'Prem', actionText: 'open chest', playerId: 'p1', useItemId: null }] })),
  });
  const run = (repository: RoundRepository, narration: string) =>
    processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 1 }, 'round-1');

  it('hands out a server-picked item, saves it, records it as given and reports its name in the system message', async () => {
    const repository = one([]);
    await run(repository, 'Chest!'+NL+'[[magic: Prem | rare | scroll]]');
    const saved = vi.mocked(repository.saveInventories).mock.calls[0][1][0];
    const itemId = saved.items[0].itemId;
    expect(repository.saveMagicGiven).toHaveBeenCalledWith('camp-1', [itemId]);
    const changes = vi.mocked(repository.insertStatsSummary).mock.calls[0][2];
    expect(changes[0]).toMatch(/^Prem ได้รับไอเท็มวิเศษ .+ \(หายาก\)$/);
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'Chest!');
  });

  it('ignores [[magic]] when the given-table is unavailable (null or absent)', async () => {
    for (const given of [null, undefined]) {
      const repository = one(given);
      await run(repository, '[[magic: Prem | rare]]');
      expect(repository.saveMagicGiven).not.toHaveBeenCalled();
      expect(repository.saveInventories).not.toHaveBeenCalled();
    }
  });

  it('still closes the round when recording the given item fails', async () => {
    const repository = one([]);
    vi.mocked(repository.saveMagicGiven!).mockRejectedValue(new Error('no table'));
    const result = await run(repository, '[[magic: Prem | uncommon]]');
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
  });
});

describe('processRound world memory', () => {
  const hero = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0, xp: 0 };
  const one = () => createFakeRepository({
    getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [hero], inventories: {}, actions: [{ playerDisplayName: 'Prem', actionText: 'talk', playerId: 'p1', useItemId: null }] })),
  });
  const run = (repository: RoundRepository, narration: string) =>
    processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 1 }, 'round-1');

  it('saves npc, quest and clue tags and strips them from the message', async () => {
    const repository = one();
    await run(repository, ['Elara smiles', '[[npc: Elara | friendly]]', '[[quest: Find ring | open]]', '[[clue: Blood on the door]]'].join('\n'));
    expect(repository.saveFacts).toHaveBeenCalledWith('camp-1', [
      { kind: 'npc', key: 'Elara', value: 'friendly' },
      { kind: 'quest', key: 'Find ring', value: 'open' },
      { kind: 'clue', key: null, value: 'Blood on the door' },
    ]);
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'Elara smiles');
  });

  it('does not write when there are no memory tags', async () => {
    const repository = one();
    await run(repository, 'quiet');
    expect(repository.saveFacts).not.toHaveBeenCalled();
  });

  it('still closes the round and posts stats when saving facts fails', async () => {
    const repository = one();
    vi.mocked(repository.saveFacts).mockRejectedValue(new Error('no table'));
    const result = await run(repository, '[[clue: something]]');
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
    expect(repository.insertStatsSummary).toHaveBeenCalled();
  });
});

describe('processRound memory prompt', () => {
  it('puts known facts into the narration prompt', async () => {
    const facts = [
      { id: 'f1', campaignId: 'camp-1', kind: 'npc' as const, key: 'Elara', value: 'friendly', updatedAt: 't' },
      { id: 'f2', campaignId: 'camp-1', kind: 'clue' as const, key: null, value: 'Blood on the door', updatedAt: 't' },
    ];
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(contextWith({ facts })) });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['ok']));
    await processRound({ claimRound: claim(), repository, generateNarration, rollSides: () => 1 }, 'round-1');
    const prompt = generateNarration.mock.calls[0][0] as string;
    expect(prompt).toContain('- Elara: friendly');
    expect(prompt).toContain('- Blood on the door');
  });
});

describe('processRound skill checks (two-call dice flow)', () => {
  const prem = {
    id: 'p1', displayName: 'Prem', weaponId: 'dagger', hp: 20, maxHp: 20, status: 'active' as const,
    revivesSinceSanctuary: 0, classId: 'rogue', xp: 0, abilities: { STR: 8, DEX: 16, CON: 13, INT: 12, WIS: 10, CHA: 14 },
  };
  const repo = () =>
    createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1', campaignSummary: '', recentMessages: [], inventories: {}, pendingWipe: false,
        currentShop: null, facts: [], tagsApplied: false, adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
        actions: [{ playerDisplayName: 'Prem', actionText: 'ย่องผ่านทหารยาม' }],
        characters: [prem],
      }),
    });
  const streams = (...texts: string[]) => {
    const fn = vi.fn();
    texts.forEach((t) => fn.mockResolvedValueOnce(fakeStream([t])));
    return fn;
  };
  const deps = (repository: RoundRepository, generateNarration: ReturnType<typeof vi.fn>, rolls: number[] = [14]): ProcessRoundDeps => {
    const queue = [...rolls];
    return { claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration, rollDie: () => queue.shift() ?? 10, rollSides: () => 4 };
  };

  it('no check: one call, the narration inside the JSON is used and tags still apply', async () => {
    const repository = repo();
    const generate = streams(JSON.stringify({ narration: 'ล้มลง [[hurt: Prem | light]]' }));
    await processRound(deps(repository, generate), 'round-1');
    expect(generate).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(repository.appendToMessage).mock.calls[0][1];
    expect(saved).toContain('ล้มลง');
    expect(saved).not.toContain('[[hurt');
    expect(repository.saveCharacterState).toHaveBeenCalled();
    expect(vi.mocked(repository.insertRollSummary).mock.calls[0][2]).toEqual([{ playerDisplayName: 'Prem', roll: 14 }]);
  });

  it('with a check: rolls on the server, calls the DM twice, tells the DM the result and posts it', async () => {
    const repository = repo();
    const generate = streams(
      '{"checks":[{"player":"Prem","skill":"stealth","dc":16,"advantage":"none"}]}',
      'ย่องผ่านสำเร็จ'
    );
    await processRound(deps(repository, generate, [14, 12]), 'round-1');
    expect(generate).toHaveBeenCalledTimes(2);
    const second = generate.mock.calls[1][0] as string;
    expect(second).toContain('stealth check DC 16');
    expect(second).toContain('d20 12 + 5 = 17');
    expect(second).toContain('SUCCESS');
    expect(second).not.toContain('FORMAT OF YOUR ANSWER');
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'ย่องผ่านสำเร็จ');
    const posted = vi.mocked(repository.insertRollSummary).mock.calls[0][2];
    expect(posted[0]).toMatchObject({ playerDisplayName: 'Prem', roll: 12, check: { skill: 'stealth', dc: 16, total: 17, success: true, modifier: 3, proficiency: 2 } });
  });

  it('rolls two dice for advantage', async () => {
    const generate = streams('{"checks":[{"player":"Prem","skill":"stealth","dc":20,"advantage":"advantage"}]}', 'ok');
    await processRound(deps(repo(), generate, [14, 3, 17]), 'round-1');
    expect(generate.mock.calls[1][0]).toContain('rolled 3 and 17');
    expect(generate.mock.calls[1][0]).toContain('d20 17 + 5 = 22');
  });

  it('broken JSON: falls back to a plain narration call without checks, tags still work', async () => {
    const repository = repo();
    const generate = streams('{"checks":[{"player":', 'เล่าปกติ [[hurt: Prem | light]]');
    await processRound(deps(repository, generate), 'round-1');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).not.toContain('FORMAT OF YOUR ANSWER');
    expect(generate.mock.calls[1][0]).not.toContain('check DC');
    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'เล่าปกติ');
    expect(repository.saveCharacterState).toHaveBeenCalled();
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalled();
  });

  it('asks for the JSON format only when dice are on and the table has characters', async () => {
    const generate = streams('{"narration":"x"}');
    await processRound(deps(repo(), generate), 'round-1');
    expect(generate.mock.calls[0][0]).toContain('FORMAT OF YOUR ANSWER');
    expect(generate.mock.calls[0][0]).toContain('ONLY for actions whose result is truly uncertain');
  });
});

describe('processRound C8 attacks on enemies and from enemies', () => {
  const prem = {
    id: 'p1', displayName: 'Prem', weaponId: 'dagger', hp: 20, maxHp: 20, status: 'active' as const,
    revivesSinceSanctuary: 0, classId: 'rogue', xp: 0, abilities: { STR: 8, DEX: 16, CON: 13, INT: 12, WIS: 10, CHA: 14 }, armorReduction: 1,
  };
  const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
  const repo = () =>
    createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1', campaignSummary: '', recentMessages: [], inventories: {}, pendingWipe: false,
        currentShop: null, facts: [], tagsApplied: false, adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '',
        actions: [{ playerDisplayName: 'Prem', actionText: 'แทงหมาป่า' }],
        characters: [prem], currentEncounter: { enemies: [wolf] },
      }),
    });
  const go = async (repository: RoundRepository, rolls: number[], ...texts: string[]) => {
    const generate = vi.fn();
    texts.forEach((t) => generate.mockResolvedValueOnce(fakeStream([t])));
    const queue = [...rolls];
    await processRound({ claimRound: claim(), repository, generateNarration: generate, rollDie: () => queue.shift() ?? 10, rollSides: () => 4 }, 'round-1');
    return generate;
  };
  const attackPlan = '{"attacks":[{"player":"Prem","target":"หมาป่า","advantage":"none"}]}';

  it('a hit (d20 9 vs 9, dagger 4 of max 4 = heavy) removes 2 pips and ends the fight; the DM is told', async () => {
    const repository = repo();
    const generate = await go(repository, [5, 9], attackPlan, 'หมาป่าล้มลง');
    const second = generate.mock.calls[1][0] as string;
    expect(second).toContain('attack on หมาป่า: d20 9 vs 9 -> HEAVY HIT');
    expect(repository.setEncounter).toHaveBeenCalledWith('camp-1', null);
    expect(vi.mocked(repository.insertRollSummary).mock.calls[0][2]).toEqual([{ playerDisplayName: 'Prem', roll: 9 }]);
  });

  it('a miss (d20 8 vs 9) leaves the enemy untouched and the encounter is not rewritten', async () => {
    const repository = repo();
    const generate = await go(repository, [5, 8], attackPlan, 'พลาด');
    expect(generate.mock.calls[1][0]).toContain('MISS');
    expect(repository.setEncounter).not.toHaveBeenCalled();
  });

  it('an enemy_attack tag hurts the player by the tier damage minus armor (4 - 1 = 3)', async () => {
    const repository = repo();
    await go(repository, [5, 8], attackPlan, 'หมาป่ากัด\n[[enemy_attack: หมาป่า | Prem]]');
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ id: 'p1', hp: 17 })], false);
  });
});

describe('processRound scrolls (F5e)', () => {
  const scrollItem = { itemId: 'scroll_flame', customName: '', quantity: 1, slot: null, equipped: false };
  const wolf = { name: 'หมาป่า', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
  const scrollContext = (over: object = {}) =>
    contextWith({
      inventories: { p1: [scrollItem] },
      currentEncounter: { enemies: [wolf] },
      actions: [{ playerDisplayName: 'Prem', actionText: 'อ่านม้วน', playerId: 'p1', useItemId: 'scroll_flame', itemTarget: 'หมาป่า' }],
      ...over,
    });

  it('cuts pips off the target before narration, consumes the scroll and saves the encounter', async () => {
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(scrollContext()) });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['เล่าเรื่อง']));
    await processRound({ claimRound: claim(), repository, generateNarration, rollDie: () => 7, rollSides: () => 4 }, 'round-1');

    const prompt = generateNarration.mock.calls[0][0] as string;
    expect(prompt).toContain('read ม้วนคัมภีร์เปลวไฟ at หมาป่า');
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [{ playerId: 'p1', items: [], baseItems: [scrollItem] }]);
    expect(repository.setEncounter).toHaveBeenCalledWith('camp-1', { enemies: [{ ...wolf, pip: 1 }] });
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ใช้ ม้วนคัมภีร์เปลวไฟ ใส่ หมาป่า (-2 pip)']);
  });

  it('keeps the scroll when there is no fight or the target is wrong', async () => {
    for (const over of [{ currentEncounter: null }, { actions: [{ playerDisplayName: 'Prem', actionText: 'x', playerId: 'p1', useItemId: 'scroll_flame', itemTarget: 'มังกร' }] }]) {
      const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(scrollContext(over)) });
      await processRound({ claimRound: claim(), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollDie: () => 7, rollSides: () => 4 }, 'round-1');
      expect(repository.saveInventories).not.toHaveBeenCalled();
      expect(repository.setEncounter).not.toHaveBeenCalled();
    }
  });
});

describe('processRound death saves (H1)', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };
  const aria = { id: 'p2', displayName: 'Aria', weaponId: null, hp: 0, maxHp: 10, status: 'downed' as const, revivesSinceSanctuary: 0 };

  function setup(characters: unknown[], die: number, extra: Record<string, unknown> = {}, saveDeathSaves = vi.fn().mockResolvedValue(undefined)) {
    const repository = createFakeRepository({
      saveDeathSaves,
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1', campaignSummary: '', recentMessages: [], actions: [{ playerDisplayName: 'Prem', actionText: 'Guard Aria' }],
        characters, pendingWipe: false, adventure: null, allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '', ...extra,
      }),
    });
    const d: ProcessRoundDeps = {
      claimRound: vi.fn().mockResolvedValue(true),
      repository,
      generateNarration: vi.fn().mockImplementation(async () => fakeStream(['Quiet.'])),
      rollDie: () => die,
      rollSides: () => 4,
    };
    return { repository, d };
  }

  it('rolls a death save for a downed character, shows it in the roll summary and saves the tally', async () => {
    const { repository, d } = setup([prem, aria], 12);
    await processRound(d, 'round-1');

    const posted = vi.mocked(repository.insertRollSummary).mock.calls[0][2];
    expect(posted).toContainEqual(expect.objectContaining({ playerDisplayName: 'Aria', roll: 12, check: expect.objectContaining({ skill: 'death_save', dc: 10, total: 12, success: true }) }));
    expect(repository.saveDeathSaves).toHaveBeenCalledWith([expect.objectContaining({ id: 'p2', deathSaves: expect.objectContaining({ successes: 1 }) })]);
    const stats = vi.mocked(repository.insertStatsSummary).mock.calls[0][2];
    expect(stats.some((l) => l.includes('Aria'))).toBe(true);
  });

  it('nat 20 brings the character back with 1 HP and clears the tally', async () => {
    const { repository, d } = setup([prem, { ...aria, deathSaves: { successes: 1, failures: 2, stable: false, dead: false } }], 20);
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', hp: 1, status: 'active' })]), false);
    expect(repository.saveDeathSaves).toHaveBeenCalledWith([expect.objectContaining({ id: 'p2', deathSaves: null })]);
  });

  it('a third failure leaves the character downed so revive still works', async () => {
    const { repository, d } = setup([prem, { ...aria, deathSaves: { successes: 0, failures: 2, stable: false, dead: false } }], 3);
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'downed', hp: 0 })]), false);
    expect(repository.saveDeathSaves).toHaveBeenCalledWith([expect.objectContaining({ id: 'p2', deathSaves: expect.objectContaining({ dead: true, failures: 3 }) })]);
  });

  it('a revive tag clears the saved tally', async () => {
    const { repository, d } = setup([prem, { ...aria, deathSaves: { successes: 1, failures: 1, stable: false, dead: false } }], 12);
    (d.generateNarration as any).mockImplementation(async () => fakeStream(['Light.\n[[revive: Aria]]']));
    await processRound(d, 'round-1');

    expect(repository.saveDeathSaves).toHaveBeenCalledWith([expect.objectContaining({ id: 'p2', deathSaves: null })]);
  });

  it('F5g: a worn revive charm brings the character back on the third failure and is removed from the pack', async () => {
    const charmRow = { itemId: 'charm_revive', customName: '', quantity: 1, slot: 'accessory', equipped: true };
    const worn = { ...aria, deathSaves: { successes: 0, failures: 2, stable: false, dead: false }, reviveCharm: { itemId: 'charm_revive', reviveHp: 1 } };
    const { repository, d } = setup([prem, worn], 3, { inventories: { p2: [charmRow] } });
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'active', hp: 1 })]), false);
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [{ playerId: 'p2', items: [], baseItems: [charmRow] }]);
    expect(repository.saveDeathSaves).toHaveBeenCalledWith([expect.objectContaining({ id: 'p2', deathSaves: null })]);
    const stats = vi.mocked(repository.insertStatsSummary).mock.calls[0][2];
    expect(stats.some((l) => l.includes('เครื่องราง'))).toBe(true);
  });

  it('F5g: without a charm the third failure still leaves the pack untouched', async () => {
    const { repository, d } = setup([prem, { ...aria, deathSaves: { successes: 0, failures: 2, stable: false, dead: false } }], 3, { inventories: { p2: [] } });
    await processRound(d, 'round-1');
    expect(repository.saveInventories).not.toHaveBeenCalled();
  });

  it('does not roll when dice are off, and a missing saveDeathSaves or failing write never breaks the round', async () => {
    const off = setup([prem, aria], 12, { settings: { diceEnabled: false } });
    await processRound(off.d, 'round-1');
    expect(off.repository.saveDeathSaves).not.toHaveBeenCalled();

    const failing = setup([prem, aria], 12, {}, vi.fn().mockRejectedValue(new Error('no column')));
    await expect(processRound(failing.d, 'round-1')).resolves.toMatchObject({ processed: true });

    const old = setup([prem, aria], 12);
    delete (old.repository as any).saveDeathSaves;
    await expect(processRound(old.d, 'round-1')).resolves.toMatchObject({ processed: true });
  });
});

describe('processRound permanent death (H3a)', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };
  const dying = { id: 'p2', displayName: 'Aria', weaponId: null, hp: 0, maxHp: 10, status: 'downed' as const, revivesSinceSanctuary: 0, gold: 35, deathSaves: { successes: 0, failures: 2, stable: false, dead: false } };
  const sword = { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true };

  function setup(characters: unknown[], permadeath: boolean, extra: Record<string, unknown> = {}, actions: unknown[] = [{ playerDisplayName: 'Prem', playerId: 'p1', actionText: 'Guard Aria' }]) {
    const repository = createFakeRepository({
      saveDeathSaves: vi.fn().mockResolvedValue(undefined),
      saveCorpses: vi.fn().mockResolvedValue(undefined),
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1', campaignSummary: '', recentMessages: [], actions, characters,
        inventories: { p1: [], p2: [sword] }, settings: { permadeath }, pendingWipe: false, adventure: null,
        allowedSceneIds: allowedScenes(undefined).map((s) => s.id), sceneInstructionText: '', ...extra,
      }),
    });
    const generateNarration = vi.fn().mockImplementation(async () => fakeStream(['Quiet.']));
    const d: ProcessRoundDeps = { claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration, rollDie: () => 3, rollSides: () => 4 };
    return { repository, d, generateNarration };
  }

  it('permadeath on: the third failure makes the character dead and moves pack and gold to a corpse', async () => {
    const { repository, d } = setup([prem, dying], true);
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'dead', hp: 0 })]), false);
    expect(repository.saveCorpses).toHaveBeenCalledWith('camp-1', [{ playerId: 'p2', name: 'Aria', items: [sword], gold: 35 }]);
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [{ playerId: 'p2', items: [], baseItems: [sword] }]);
    expect(repository.applyGold).toHaveBeenCalledWith([{ playerId: 'p2', delta: -35 }]);
    const stats = vi.mocked(repository.insertStatsSummary).mock.calls[0][2];
    expect(stats.some((l) => l.includes('ตายถาวร'))).toBe(true);
  });

  it('permadeath off: same situation leaves the character downed, no corpse, pack and gold untouched', async () => {
    const { repository, d } = setup([prem, dying], false);
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'downed' })]), false);
    expect(repository.saveCorpses).not.toHaveBeenCalled();
    expect(repository.saveInventories).not.toHaveBeenCalled();
    expect(repository.applyGold).not.toHaveBeenCalled();
  });

  it('permadeath on: a worn revive charm still saves the character from dying', async () => {
    const charm = { itemId: 'charm_revive', customName: '', quantity: 1, slot: 'accessory', equipped: true };
    const { repository, d } = setup([prem, { ...dying, reviveCharm: { itemId: 'charm_revive', reviveHp: 1 } }], true, { inventories: { p1: [], p2: [charm] } });
    await processRound(d, 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'active', hp: 1 })]), false);
    expect(repository.saveCorpses).not.toHaveBeenCalled();
  });

  it('permadeath on: if the corpse cannot be saved the pack and gold stay with the character', async () => {
    const { repository, d } = setup([prem, dying], true);
    vi.mocked(repository.saveCorpses!).mockRejectedValue(new Error('no table'));
    await expect(processRound(d, 'round-1')).resolves.toMatchObject({ processed: true });
    expect(repository.saveInventories).not.toHaveBeenCalled();
    expect(repository.applyGold).not.toHaveBeenCalled();
  });

  it('a [[revive]] aimed at a dead character is ignored without failing the round', async () => {
    const dead = { ...dying, status: 'dead' as const, deathSaves: { successes: 0, failures: 3, stable: false, dead: true } };
    const { repository, d } = setup([prem, dead], true);
    (d.generateNarration as any).mockImplementation(async () => fakeStream(['Light.\n[[revive: Aria]]']));
    await expect(processRound(d, 'round-1')).resolves.toMatchObject({ processed: true });
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', expect.arrayContaining([expect.objectContaining({ id: 'p2', status: 'dead' })]), false);
  });

  it('actions from a dead character never reach the AI or the message log', async () => {
    const dead = { ...dying, status: 'dead' as const, deathSaves: { successes: 0, failures: 3, stable: false, dead: true } };
    const actions = [
      { playerDisplayName: 'Prem', playerId: 'p1', actionText: 'Look around' },
      { playerDisplayName: 'Aria', playerId: 'p2', actionText: 'ZOMBIE-ACTION' },
    ];
    const { repository, d, generateNarration } = setup([prem, dead], true, {}, actions);
    await processRound(d, 'round-1');

    expect(vi.mocked(generateNarration).mock.calls.every(([prompt]) => !String(prompt).includes('ZOMBIE-ACTION'))).toBe(true);
    expect(vi.mocked(repository.insertPlayerActionMessages).mock.calls[0][2]).toEqual([expect.objectContaining({ playerId: 'p1' })]);
  });

  it('the AI is told a permanently dead character is gone', async () => {
    const dead = { ...dying, status: 'dead' as const };
    const { d, generateNarration } = setup([prem, dead], true);
    await processRound(d, 'round-1');
    expect(String(vi.mocked(generateNarration).mock.calls[0][0])).toMatch(/Aria.*DEAD/);
  });
});

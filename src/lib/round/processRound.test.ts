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

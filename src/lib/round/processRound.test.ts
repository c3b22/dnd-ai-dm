import { describe, it, expect, vi } from 'vitest';
import { processRound, ProcessRoundDeps } from './processRound';
import type { RoundRepository } from './roundRepository';

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
      pendingWipe: false,
    }),
    insertPlayerActionMessages: vi.fn().mockResolvedValue(undefined),
    insertRollSummary: vi.fn().mockResolvedValue(undefined),
    saveCharacterState: vi.fn().mockResolvedValue(undefined),
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
});

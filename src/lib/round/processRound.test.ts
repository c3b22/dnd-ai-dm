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
    }),
    insertPlayerActionMessages: vi.fn().mockResolvedValue(undefined),
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
    expect(repository.appendToMessage).toHaveBeenNthCalledWith(1, 'msg-1', 'You see ');
    expect(repository.appendToMessage).toHaveBeenNthCalledWith(2, 'msg-1', 'a torch.');
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
});

import { describe, it, expect } from 'vitest';
import { assemblePrompt, shouldRotateSummary, StoredMessage } from './assemblePrompt';

describe('assemblePrompt', () => {
  it('includes the campaign summary, recent messages, and this round actions', () => {
    const prompt = assemblePrompt(
      'The party entered the cave.',
      [{ role: 'dm', content: 'You see a torch flickering.' }],
      [{ playerDisplayName: 'Prem', actionText: 'I light the torch' }]
    );

    expect(prompt).toContain('The party entered the cave.');
    expect(prompt).toContain('You see a torch flickering.');
    expect(prompt).toContain('Prem: I light the torch');
  });

  it('labels an empty summary as a fresh campaign', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'Look around' },
    ]);
    expect(prompt).toContain('(campaign just started)');
  });
});

describe('shouldRotateSummary', () => {
  it('returns false when recent history is short', () => {
    const messages: StoredMessage[] = [{ role: 'dm', content: 'Short message.' }];
    expect(shouldRotateSummary(messages)).toBe(false);
  });

  it('returns true when recent history exceeds the rotation threshold', () => {
    const longMessage: StoredMessage = { role: 'dm', content: 'x'.repeat(9000) };
    expect(shouldRotateSummary([longMessage])).toBe(true);
  });

  it('includes the chosen adventure outline as the story backbone', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], 'sunken-bell-of-marrowmere');
    expect(prompt).toContain('The Sunken Bell of Marrowmere');
    expect(prompt).toContain('Hidden truth');
  });

  it('omits adventure text when none is set', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt).not.toContain('Adventure:');
  });
});

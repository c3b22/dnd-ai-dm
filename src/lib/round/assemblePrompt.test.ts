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

describe('assemblePrompt action order', () => {
  it('numbers several actions and tells the DM to resolve them in that order', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'open the door' },
      { playerDisplayName: 'Mila', actionText: 'sneak inside' },
    ]);

    expect(prompt.indexOf('1. Prem: open the door')).toBeLessThan(prompt.indexOf('2. Mila: sneak inside'));
    expect(prompt).toContain('one at a time in exactly this order');
  });

  it('keeps a single action unnumbered without ordering instructions', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'look' }]);

    expect(prompt).toContain('Prem: look');
    expect(prompt).not.toContain('1. Prem');
    expect(prompt).not.toContain('exactly this order');
  });
});
describe('assemblePrompt dice', () => {
  it('shows each roll and tells the DM the results are final', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'open the door', roll: 3 },
      { playerDisplayName: 'Mila', actionText: 'sneak inside', roll: 19 },
    ]);

    expect(prompt).toContain('1. Prem (rolled 3 on a d20): open the door');
    expect(prompt).toContain('2. Mila (rolled 19 on a d20): sneak inside');
    expect(prompt).toContain('dice results above are final');
  });

  it('adds no dice text when nothing was rolled', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'look' }]);
    expect(prompt).not.toContain('rolled');
  });
});

describe('assemblePrompt with characters', () => {
  const characters = [
    { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 },
  ];

  it('includes the party status block when characters are given', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Attack' }], 'sunken-bell-of-marrowmere', null, undefined, {
      characters,
      pendingWipe: false,
    });
    expect(prompt).toContain('Prem: HP 20/20, shortsword (1d8), standing');
    expect(prompt).toContain("Brother Tolliver's empty chapel");
  });

  it('shows the weapon damage roll next to the d20 when one was rolled', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'Attack', roll: 14, weaponLabel: 'shortsword', damage: 5 },
    ]);
    expect(prompt).toContain('Prem (rolled 14 on a d20, shortsword damage roll 5): Attack');
  });

  it('keeps the old action format when there is no weapon damage', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look', roll: 9 }]);
    expect(prompt).toContain('Prem (rolled 9 on a d20): Look');
  });

  it('adds no party block when no character state is passed', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt).not.toContain('Party status');
  });
});

// E1 audit (docs/audit-chat-history-e1.md): ooc (team chat), ask and ask_answer (player <-> DM Q&A)
// messages must NEVER reach the AI prompt. The query in roundRepository filters them before the
// 40-row limit; assemblePrompt filters again defensively (tested below).
import { describe, it, expect } from 'vitest';
import { assemblePrompt, shouldRotateSummary, StoredMessage } from './assemblePrompt';
import { getAdventure } from '@/lib/adventures/adventures';
import { sceneInstruction } from '@/lib/scenes/scenes';

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

describe('assemblePrompt role filtering', () => {
  it('never includes ooc, ask or ask_answer messages in the prompt', () => {
    const prompt = assemblePrompt(
      '',
      [
        { role: 'dm', content: 'The door creaks open.' },
        { role: 'ooc', content: 'SECRET-OOC-CHAT' },
        { role: 'ask', content: 'SECRET-ASK-QUESTION' },
        { role: 'ask_answer', content: 'SECRET-ASK-ANSWER' },
        { role: 'player', content: 'I step inside.' },
      ],
      [{ playerDisplayName: 'Prem', actionText: 'Look around' }]
    );
    expect(prompt).toContain('The door creaks open.');
    expect(prompt).toContain('I step inside.');
    expect(prompt).not.toContain('SECRET-OOC-CHAT');
    expect(prompt).not.toContain('SECRET-ASK-QUESTION');
    expect(prompt).not.toContain('SECRET-ASK-ANSWER');
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
    const adventure = getAdventure('sunken-bell-of-marrowmere')!;
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], adventure, sceneInstruction(adventure.id, null));
    expect(prompt).toContain('The Sunken Bell of Marrowmere');
    expect(prompt).toContain('Hidden truth');
  });

  it('omits adventure text when none is set', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], null, '');
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
    const adventure = getAdventure('sunken-bell-of-marrowmere')!;
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Attack' }], adventure, sceneInstruction(adventure.id, null), undefined, {
      characters,
      pendingWipe: false,
    });
    expect(prompt).toContain('Prem (Lv 1): HP 20/20, shortsword (1d8), standing');
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

describe('assemblePrompt inventory', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };

  it('includes the inventory block and the server note on a potion action', () => {
    const prompt = assemblePrompt(
      '', [],
      [{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', note: 'drank ยาฟื้นฟูเล็ก and recovered 5 HP' }],
      null, '', undefined,
      { characters: [prem], pendingWipe: false, inventories: { p1: [] } }
    );
    expect(prompt).toContain('Prem: nothing; weight 0/10');
    expect(prompt).toContain('Prem: ดื่มยา (server: drank ยาฟื้นฟูเล็ก and recovered 5 HP)');
  });

  it('adds no inventory block when there is no character state', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt).not.toContain('weight');
  });
});

describe('assemblePrompt scope guard', () => {
  it('always tells the DM to stay in the fiction, even with no adventure and no characters', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt.toLowerCase()).toContain('stay strictly inside');
  });
});

describe('assemblePrompt economy', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: null, hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 14 };
  it('includes the economy block with the open shop', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }], null, '', undefined,
      { characters: [prem], pendingWipe: false, inventories: {}, shop: { name: 'Old Mara', itemIds: ['staff'] } });
    expect(prompt).toContain('Prem: 14 gold');
    expect(prompt).toContain('Old Mara');
  });
});

describe('assemblePrompt combat', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: null, hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, gold: 0 };
  const act = [{ playerDisplayName: 'Prem', actionText: 'Look' }];
  it('includes the combat tags and the current enemies', () => {
    const prompt = assemblePrompt('', [], act, null, '', undefined,
      { characters: [prem], pendingWipe: false, inventories: {}, encounter: { enemies: [{ name: 'หมาป่า', tier: 'normal', pip: 1, maxPip: 2, fled: false }] } });
    expect(prompt).toContain('[[enemy_hurt:');
    expect(prompt).toContain('- หมาป่า (normal): 1/2 pips');
  });
  it('says no fight is in progress without an encounter', () => {
    const prompt = assemblePrompt('', [], act, null, '', undefined, { characters: [prem], pendingWipe: false });
    expect(prompt).toContain('No fight is in progress');
  });
});

import { describe, it, expect } from 'vitest';
import { combatPrompt } from './prompt';

const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 1, maxPip: 2, fled: false };

describe('combatPrompt', () => {
  it('explains the enemy tags and says no fight is going on when there is no encounter', () => {
    const text = combatPrompt(null).join('\n');
    expect(text).toContain('[[enemy: Name | minion/normal/strong/boss');
    expect(text).toContain('[[enemy_hurt: Name | light/medium/heavy]]');
    expect(text).toContain('[[enemy_flee: Name]]');
    expect(text).toContain('[[combat_end]]');
    expect(text).toContain('No fight is in progress');
  });

  it('with server attacks it drops enemy_hurt and sends enemy attacks through the JSON enemyAttacks list', () => {
    const text = combatPrompt(null, true).join('\n');
    expect(text).not.toContain('[[enemy_hurt:');
    expect(text).not.toContain('[[enemy_attack:');
    expect(text).toContain('"enemyAttacks"');
    expect(combatPrompt(null).join('\n')).toContain('[[enemy_attack:');
  });

  it('lists each enemy with its pips and state', () => {
    const text = combatPrompt({
      enemies: [
        wolf,
        { name: 'หมาป่า 2', tier: 'boss', pip: 0, maxPip: 5, fled: false },
        { name: 'โจร', tier: 'minion', pip: 1, maxPip: 1, fled: true },
      ],
    }).join('\n');
    expect(text).toContain('- หมาป่า (normal): 1/2 pips');
    expect(text).toContain('- หมาป่า 2 (boss): down');
    expect(text).toContain('- โจร (minion): fled');
    expect(text).not.toContain('No fight is in progress');
  });
});

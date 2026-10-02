import { diceLabel, weaponFor } from './constants';
import type { Character } from './types';

export function characterPrompt(
  characters: Character[],
  pendingWipe: boolean,
  sanctuary: string | undefined
): string[] {
  if (characters.length === 0) return [];

  const lines = [
    'Party status (managed by the game server; never state or invent HP numbers yourself):',
    ...characters.map((c) => {
      const weapon = weaponFor(c.weaponId);
      const state =
        c.status === 'downed'
          ? "DOWNED (cannot act; only a teammate's action can get them back up)"
          : 'standing';
      return `- ${c.displayName}: HP ${c.hp}/${c.maxHp}, ${weapon.id} (${diceLabel(weapon.dice)}), ${state}`;
    }),
    '',
    'Announce mechanical outcomes with tags, each on its own line after your narration. The server rolls the numbers:',
    '  [[hurt: PlayerName | light]] - that player was hurt (use light, medium or heavy by how bad the hit is)',
    '  [[heal: PlayerName | medium]] - that player recovered health (light, medium or heavy)',
    '  [[revive: PlayerName]] - a downed player was helped back up by a teammate',
    ...(sanctuary
      ? [`  [[sanctuary]] only when the party is at: ${sanctuary}. Never use it anywhere else.`]
      : []),
    'Use the exact player name. Do not tag actions that had no mechanical effect.',
    "Only use [[hurt: ...]] when the action was genuinely risky — combat, a fall, fire, poison, or knowingly confronting danger. A mundane, safe action (resting, sleeping, talking, searching a calm room, tidying up) must never cause harm, no matter what the d20 rolled. When an action is risky, match severity to the roll: a roll that merely falls short is at most light; medium needs a clearly bad roll; heavy needs a near-worst roll in real danger. A single ordinary roll on a harmless action must never down or endanger a player.",
  ];

  if (pendingWipe) {
    lines.push(
      '',
      'The whole party was defeated last round. Narrate how they survived and impose exactly one concrete story consequence (captured, lost something valuable, or the antagonist advances).'
    );
  }
  return lines;
}

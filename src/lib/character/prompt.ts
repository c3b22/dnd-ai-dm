import { diceLabel, weaponFor } from './constants';
import { classOf } from './classes';
import { levelForXp } from './leveling';
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
      const cls = classOf(c.classId);
      return `- ${c.displayName} (Lv ${levelForXp(c.xp ?? 0)}${cls ? `, ${cls.nameTh}` : ''}): HP ${c.hp}/${c.maxHp}, ${weapon.id} (${diceLabel(weapon.dice)}), ${state}`;
    }),
    '',
    'Announce mechanical outcomes with tags, each on its own line after your narration. The server rolls the numbers:',
    '  [[hurt: PlayerName | light]] - that player was hurt (use light, medium or heavy by how bad the hit is)',
    '  [[heal: PlayerName | medium]] - that player recovered health (light, medium or heavy for a partial heal from a potion, spell, or short rest; full to restore them completely with no roll, for a dedicated paid treatment such as a clinic, temple or healer)',
    '  [[revive: PlayerName]] - a downed player was helped back up by a teammate',
    '  [[xp: small]] (or medium, large) - the whole party earned experience. Award it only when the party overcame an obstacle, solved a problem, or genuinely advanced the story, not every round: small for a minor step, medium for a notable one, large for a major one. At most one per round.',
    '  [[milestone]] - the party closed a major event or scene of the story. Rare; at most one per round. Never state XP or level numbers in your narration.',
    ...(sanctuary
      ? [`  [[sanctuary]] only when the party is at: ${sanctuary}. Never use it anywhere else.`]
      : []),
    'Use the exact player name. Do not tag actions that had no mechanical effect.',
    'A player action may carry a server note such as a class ability they used (a shield, a heal, a strong shot). Narrate that outcome faithfully; never invent or change its numbers, and never hurt or heal anyone for it yourself.',
    "Only use [[hurt: ...]] when the action itself was genuinely dangerous — combat, a fall, fire, poison, or knowingly confronting danger. Routine activity is never dangerous by itself: walking, resting, sleeping, talking, searching a calm room, tidying up or putting away belongings, cooking, shopping, or any other ordinary task must NEVER cause harm, no matter what any die rolled. If the player's described action carries no real danger, do not even call for a roll on it, and never emit [[hurt: ...]] for it — a bad roll on a harmless action means nothing happens, not an injury. When an action is genuinely risky, match severity to the roll: a roll that merely falls short is at most light; medium needs a clearly bad roll; heavy needs a near-worst roll in real danger.",
  ];

  if (pendingWipe) {
    lines.push(
      '',
      'The whole party was defeated last round. Narrate how they survived and impose exactly one concrete story consequence (captured, lost something valuable, or the antagonist advances).'
    );
  }
  return lines;
}

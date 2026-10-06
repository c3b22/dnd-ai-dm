import type { Encounter } from './encounter';

export function combatPrompt(encounter: Encounter | null): string[] {
  const state = encounter
    ? [
        'Enemies in the current fight (the server tracks their health in pips; never state pip numbers yourself):',
        ...encounter.enemies.map((e) => {
          const status = e.fled ? 'fled' : e.pip <= 0 ? 'down' : `${e.pip}/${e.maxPip} pips`;
          return `- ${e.name} (${e.tier}): ${status}`;
        }),
      ]
    : ['No fight is in progress right now.'];
  return [
    'Track combat with tags, each on its own line after your narration. The server keeps the enemies and their health:',
    '  [[enemy: Name | minion/normal/strong/boss]] - an enemy joins the fight (minion 1 pip, normal 2, strong 3, boss 5); use a distinct name for each enemy',
    '  [[enemy_hurt: Name | light/medium/heavy]] - the enemy was hurt this round (light or medium costs 1 pip, heavy costs 2); a boss cannot be killed by a single blow from full health',
    '  [[enemy_flee: Name]] - the enemy runs away',
    '  [[combat_end]] - the fight is over (surrender, truce, or everyone escaped)',
    ...state,
    'The fight ends by itself once every enemy is down or has fled, and when the party moves to another scene. Use the exact enemy names listed above in tags. These tags give no rewards on their own; award XP and gold only with their own tags.',
  ];
}

import type { Encounter } from './encounter';

/**
 * `serverAttacks` (C8): the server rolls player attacks and removes enemy health itself, so the
 * [[enemy_hurt]] tag is left out of the prompt (it still parses). Enemy attacks on players are
 * always declared with [[enemy_attack]] and the server computes the damage.
 */
export function combatPrompt(encounter: Encounter | null, serverAttacks = false): string[] {
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
    ...(serverAttacks
      ? ['  Do not use an enemy_hurt tag: the server rolls the attacks of the players and removes the health of the enemies itself; just narrate the attack results you are given.']
      : ['  [[enemy_hurt: Name | light/medium/heavy]] - the enemy was hurt this round (light or medium costs 1 pip, heavy costs 2); a boss cannot be killed by a single blow from full health']),
    '  [[enemy_attack: EnemyName | PlayerName]] - an enemy attacks a player and hits; the server deals fixed damage by the enemy tier (minion 2, normal 4, strong 6, boss 8) minus the armor, so use this INSTEAD of a hurt tag for enemy attacks during a fight (hurt stays for traps, falls and the like). Use it at most once per enemy per round',
    '  [[enemy_flee: Name]] - the enemy runs away',
    '  [[combat_end]] - the fight is over (surrender, truce, or everyone escaped)',
    ...state,
    'The fight ends by itself once every enemy is down or has fled, and when the party moves to another scene. Use the exact enemy names listed above in tags. These tags give no rewards on their own; award XP and gold only with their own tags.',
  ];
}

import { resolveCheck, type Advantage } from '@/lib/character/check';
import { weaponFor } from '@/lib/character/constants';
import { findByDisplayName } from '@/lib/character/names';
import type { PlannedAttack } from '@/lib/character/checkPlan';
import type { CharacterTag, EnemyTier } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { ENEMY_DAMAGE, HEAVY_DAMAGE_RATIO, HEAVY_PIPS, HIT_PIPS, HIT_THRESHOLD, MIN_ENEMY_DAMAGE } from './constants';
import { damageEnemy, findActiveEnemy, type Encounter } from './encounter';

export interface AttackOutcome {
  playerId: string;
  playerDisplayName: string;
  /** Name of the enemy as it is in the encounter (resolved, so `หมาป่า` may become `หมาป่า 2`). */
  target: string;
  tier: EnemyTier;
  dc: number;
  advantage: Advantage;
  dice: number[];
  die: number;
  hit: boolean;
  critical: 'success' | 'failure' | null;
  /** Pips this attack removes: 0 on a miss. */
  pips: number;
  /** True when this hit takes the enemy's last pip (after earlier attacks of the same round). */
  defeated: boolean;
  damage: number;
  maxDamage: number;
}

/**
 * Pure resolution of one player attack. Interpretation: the attack roll is the bare d20 (no ability
 * modifier or proficiency, the threshold is already tuned per enemy tier); resolveCheck supplies the
 * advantage and natural 1 / 20 rules. A heavy blow is nat 20 or damage >= 75% of the weapon's maximum.
 */
export function resolveAttack(input: {
  d20s: readonly number[];
  advantage?: Advantage;
  tier: EnemyTier;
  damage: number;
  maxDamage: number;
}): { dc: number; die: number; hit: boolean; critical: 'success' | 'failure' | null; pips: number } {
  const advantage = input.advantage ?? 'none';
  const dc = HIT_THRESHOLD[input.tier];
  const result = resolveCheck({ d20s: input.d20s, ability: 10, proficient: false, level: 1, dc, advantage });
  const used = advantage === 'none' ? input.d20s.slice(0, 1) : input.d20s.slice(0, 2);
  const die = advantage === 'advantage' ? Math.max(...used) : advantage === 'disadvantage' ? Math.min(...used) : used[0];
  if (!result.success) return { dc, die, hit: false, critical: result.critical, pips: 0 };
  const heavy = result.critical === 'success' || input.damage >= input.maxDamage * HEAVY_DAMAGE_RATIO;
  return { dc, die, hit: true, critical: result.critical, pips: heavy ? HEAVY_PIPS : HIT_PIPS };
}

const maxDamageOf = (character: Character): number => {
  const { count, sides, bonus } = weaponFor(character.weaponId).dice;
  return count * sides + bonus;
}

/**
 * Rolls every planned attack. One attack per active player; the target must be a live enemy of the
 * current encounter, anything else is ignored. `damageOf` gives the damage already rolled this round.
 */
export function runAttacks(
  planned: PlannedAttack[],
  characters: Character[],
  encounter: Encounter | null,
  damageOf: (character: Character) => number | undefined,
  rollDie: () => number
): AttackOutcome[] {
  if (!encounter) return [];
  const seen = new Set<string>();
  const out: AttackOutcome[] = [];
  // Simulated copy so a later attack in the same round sees the pips earlier hits already took.
  const enemies = encounter.enemies.map((e) => ({ ...e }));
  for (const attack of planned) {
    const character = findByDisplayName(characters, attack.player);
    const target = findActiveEnemy(enemies, attack.target);
    if (!character || !target || character.status !== 'active' || seen.has(character.id)) continue;
    seen.add(character.id);
    const dice = attack.advantage === 'none' ? [rollDie()] : [rollDie(), rollDie()];
    const damage = damageOf(character) ?? 0;
    const maxDamage = maxDamageOf(character);
    const r = resolveAttack({ d20s: dice, advantage: attack.advantage, tier: target.tier, damage, maxDamage });
    if (r.hit) damageEnemy(target, r.pips);
    out.push({
      playerId: character.id,
      playerDisplayName: character.displayName,
      target: target.name,
      tier: target.tier,
      dc: r.dc,
      advantage: attack.advantage,
      dice,
      die: r.die,
      hit: r.hit,
      critical: r.critical,
      pips: r.pips,
      defeated: r.hit && target.pip === 0,
      damage,
      maxDamage,
    });
  }
  return out;
}

/** Pure: applies each hit's pip loss in order. Does not drop a finished encounter; applyEnemyTags does. */
export function applyAttackOutcomes(encounter: Encounter | null, outcomes: AttackOutcome[]): Encounter | null {
  if (!encounter) return null;
  const enemies = encounter.enemies.map((e) => ({ ...e }));
  for (const o of outcomes) {
    if (!o.hit) continue;
    const target = findActiveEnemy(enemies, o.target);
    if (target) damageEnemy(target, o.pips);
  }
  return { enemies };
}

/**
 * Pure: resolves [[enemy_attack]] tags. Damage is fixed by the enemy's tier, minus the target's armor,
 * at least 1, and there is no roll. The warrior's guard ability is not applied to these hits.
 */
export function applyEnemyAttacks(
  characters: Character[],
  encounter: Encounter | null,
  tags: CharacterTag[]
): { characters: Character[]; changes: string[] } {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];
  if (!encounter) return { characters: next, changes };
  for (const tag of tags) {
    if (tag.kind !== 'enemy_attack') continue;
    const enemy = findActiveEnemy(encounter.enemies, tag.enemy);
    const target = findByDisplayName(next, tag.player);
    if (!enemy || !target || target.status !== 'active') continue;
    const reduction = target.armorReduction ?? 0;
    const damage = Math.max(MIN_ENEMY_DAMAGE, ENEMY_DAMAGE[enemy.tier] - reduction);
    const absorbed = ENEMY_DAMAGE[enemy.tier] - damage;
    target.hp = Math.max(0, target.hp - damage);
    changes.push(`${target.displayName} −${damage} HP จาก ${enemy.name}${absorbed > 0 ? ` (เกราะกัน ${absorbed})` : ''}`);
    if (target.hp === 0) {
      target.status = 'downed';
      changes.push(`${target.displayName} ล้มลง`);
    }
  }
  return { characters: next, changes };
}


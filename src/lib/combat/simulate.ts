// I5: pure combat balance simulation. It plays whole fights with the real combat modules (armor class, attacks,
// enemy attacks, traits, encounter bookkeeping, class abilities) and a simple fixed tactic for both sides.
// Nothing here changes a constant; docs/combat-balance.md is where the results and tuning proposals live.
import { applyAbilityActions, tickCooldowns, type AbilityAction } from '@/lib/character/applyAbilities';
import { BASE_MAX_HP, LEVEL_XP_THRESHOLDS, weaponFor } from '@/lib/character/constants';
import type { AbilityKey } from '@/lib/character/constants';
import type { PlannedAttack } from '@/lib/character/checkPlan';
import { CLASSES, CLASS_IDS, startingAbilities, type ClassId } from '@/lib/character/classes';
import { rollDice } from '@/lib/character/dice';
import { applyAbilityChoice, levelDamageBonus, levelForXp, levelHpBonus } from '@/lib/character/leveling';
import type { CharacterTag, EnemyTier } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { applyAttackOutcomes, applyEnemyAttackOutcomes, applyVenom, runAttacks, runEnemyAttacks } from './attack';
import { BOSS_SIGNATURE_EVERY, type EnemyTrait } from './constants';
import { advanceEncounter, applyEnemyTags, hasTrait, type Encounter, type EncounterEnemy } from './encounter';

/** A fight that is still going after this many rounds counts as lost (a stalemate). */
export const MAX_ROUNDS = 30;

export type Rng = () => number;

/** Small seedable generator (mulberry32) so a simulation is reproducible. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EnemySpec {
  name: string;
  tier: EnemyTier;
  traits?: EnemyTrait[];
}

const many = (name: string, tier: EnemyTier, n: number, traits?: EnemyTrait[]): EnemySpec[] =>
  Array.from({ length: n }, () => ({ name, tier, ...(traits ? { traits } : {}) }));

/** The standard enemy groups the balance report runs (names get numbered by applyEnemyTags). */
export const STANDARD_FIGHTS = {
  minion4: many('Minion', 'minion', 4),
  normal2: many('Normal', 'normal', 2),
  strongNormal: [...many('Strong', 'strong', 1), ...many('Normal', 'normal', 1)],
  boss: many('Boss', 'boss', 1),
  /** Trait variants: a pack/brute pair and a boss with armored + boss_signature. */
  normal2PackBrute: many('Normal', 'normal', 2, ['pack', 'brute']),
  bossTraits: many('Boss', 'boss', 1, ['armored', 'boss_signature']),
} satisfies Record<string, EnemySpec[]>;

export type ArmorProfile = 'none' | 'class';

/** Armor a class wears in the `class` profile (stats of armor_light / armor_medium / armor_heavy in inventory/catalog.ts). */
const CLASS_ARMOR: Record<ClassId, { reduction: number; weight: number }> = {
  warrior: { reduction: 3, weight: 3 },
  archer: { reduction: 1, weight: 1 },
  cleric: { reduction: 2, weight: 2 },
  rogue: { reduction: 1, weight: 1 },
};
/** The ability a player spends their ability score improvements on. */
const PRIMARY_ABILITY: Record<ClassId, AbilityKey> = { warrior: 'STR', archer: 'DEX', cleric: 'WIS', rogue: 'DEX' };

/**
 * One character per class at `level`: xp from the level table, HP like effectiveMaxHp, the class's starting
 * weapon and abilities, each improvement (levels 4 and 8) put as +2 into the primary ability, and either no
 * armor (starting kit) or the class's typical armor. No magic items.
 */
export function buildParty(level: number, armor: ArmorProfile): Character[] {
  const xp = LEVEL_XP_THRESHOLDS[level - 1] ?? 0;
  const lvl = levelForXp(xp);
  const maxHp = BASE_MAX_HP + levelHpBonus(lvl);
  return CLASS_IDS.map((classId) => {
    let abilities = startingAbilities(classId);
    const improvements = [4, 8].filter((l) => lvl >= l).length;
    for (let i = 0; i < improvements; i++) {
      const r = applyAbilityChoice(abilities, { kind: 'double', ability: PRIMARY_ABILITY[classId] });
      if (r.ok) abilities = r.abilities;
    }
    const worn = armor === 'class' ? CLASS_ARMOR[classId] : null;
    const c: Character = {
      id: classId,
      displayName: CLASSES[classId].nameTh,
      weaponId: CLASSES[classId].weaponId,
      hp: maxHp,
      maxHp,
      status: 'active',
      revivesSinceSanctuary: 0,
      xp,
      classId,
      abilityCooldown: 0,
      abilities,
      gold: 0,
      ...(worn ? { armorReduction: worn.reduction, armorWeight: worn.weight } : {}),
    };
    return c;
  });
}

export interface FightResult {
  won: boolean;
  rounds: number;
  /** Party HP left at the end as a share of the party's max HP (0 to 1). */
  hpFraction: number;
  /** Players at 0 HP when the fight ended (no death saves or revives are simulated, so a downed player stays down). */
  downed: number;
}

const live = (e: EncounterEnemy) => e.pip > 0 && !e.fled;
const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

function buildEncounter(specs: EnemySpec[]): Encounter | null {
  const tags: CharacterTag[] = specs.map((s) => ({ kind: 'enemy', name: s.name, tier: s.tier, ...(s.traits ? { traits: s.traits } : {}) }));
  return applyEnemyTags(null, tags);
}

/** Does this character use its class ability now? Warrior guards, cleric heals the neediest, archer and rogue strike. */
function abilityAction(c: Character, chars: Character[]): AbilityAction | null {
  if (c.status !== 'active' || (c.abilityCooldown ?? 0) > 0) return null;
  const active = chars.filter((x) => x.status === 'active');
  const neediest = (list: Character[]) => [...list].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (c.classId === 'warrior') {
    const ally = neediest(active.filter((x) => x.id !== c.id));
    return ally ? { playerId: c.id, useAbility: true, abilityTargetId: ally.id } : null;
  }
  if (c.classId === 'cleric') {
    const hurt = neediest(active.filter((x) => x.maxHp - x.hp >= 5));
    return hurt ? { playerId: c.id, useAbility: true, abilityTargetId: hurt.id } : null;
  }
  return { playerId: c.id, useAbility: true, abilityTargetId: null };
}

/**
 * Simulates one fight until the enemies are all down (win), the party is all down (loss) or MAX_ROUNDS pass.
 *
 * Tactics (assumptions, see docs/combat-balance.md): every active player attacks the enemy with the fewest pips
 * left, except a warrior or cleric who spends the ability that round (guard / heal), which replaces their attack;
 * players act first, enemies that survive the round then each attack one random active player (a boss with
 * boss_signature attacks two every third round); no potions, flee, death saves or revives.
 */
export function simulateFight(party: Character[], enemies: EnemySpec[], rng: Rng): FightResult {
  const rollSides = (sides: number) => 1 + Math.floor(rng() * sides);
  const rollDie = () => rollSides(20);
  let chars: Character[] = party.map((c) => ({ ...c }));
  let encounter = buildEncounter(enemies);
  let rounds = 0;
  let won = encounter === null;

  while (encounter && rounds < MAX_ROUNDS && chars.some((c) => c.status === 'active')) {
    rounds++;
    const before: Encounter = encounter;
    if (before.poisoned?.length) chars = applyVenom(chars, before.poisoned).characters;

    const actions = chars.flatMap((c) => abilityAction(c, chars) ?? []);
    const abilities = applyAbilityActions(chars, actions, rollSides);
    chars = abilities.characters;

    const target = before.enemies.filter(live).sort((a, b) => a.pip - b.pip)[0];
    const spent = new Set(
      abilities.used.filter((id) => {
        const cls = chars.find((c) => c.id === id)?.classId;
        return cls === 'warrior' || cls === 'cleric';
      })
    );
    const planned: PlannedAttack[] = chars
      .filter((c) => c.status === 'active' && !spent.has(c.id))
      .map((c) => ({ player: c.displayName, target: target.name, advantage: 'none' }));
    const damage = new Map(chars.map((c) => [c.id, abilities.damage[c.id] ?? rollDice(weaponFor(c.weaponId).dice, rollSides) + levelDamageBonus(levelForXp(c.xp ?? 0))]));
    const outcomes = runAttacks(planned, chars, before, (c) => damage.get(c.id), rollDie);
    const after = applyAttackOutcomes(before, outcomes) as Encounter;

    const survivors = after.enemies.filter(live);
    let poisoned: string[] = [];
    if (survivors.length > 0) {
      const signature = (before.round ?? 1) % BOSS_SIGNATURE_EVERY === 0;
      const attacks: { enemy: string; player: string }[] = [];
      for (const e of survivors) {
        const open = chars.filter((c) => c.status === 'active');
        if (open.length === 0) break;
        const first = pick(open, rng);
        attacks.push({ enemy: e.name, player: first.displayName });
        const rest = open.filter((c) => c.id !== first.id);
        if (signature && e.tier === 'boss' && hasTrait(e, 'boss_signature') && rest.length > 0) attacks.push({ enemy: e.name, player: pick(rest, rng).displayName });
      }
      const enemyOutcomes = runEnemyAttacks(attacks, chars, before, rollDie, rollSides, after);
      chars = applyEnemyAttackOutcomes(chars, enemyOutcomes, new Set(), abilities.guards).characters;
      poisoned = enemyOutcomes.filter((o) => o.venomous).map((o) => o.playerId);
    }
    chars = tickCooldowns(chars, true, abilities.used);

    if (survivors.length === 0) {
      won = true;
      encounter = null;
    } else {
      encounter = advanceEncounter(before, after, poisoned);
    }
  }

  const maxTotal = chars.reduce((n, c) => n + c.maxHp, 0);
  return {
    won,
    rounds,
    hpFraction: chars.reduce((n, c) => n + Math.max(0, c.hp), 0) / maxTotal,
    downed: chars.filter((c) => c.status !== 'active').length,
  };
}

export interface SimSummary {
  fights: number;
  winRate: number;
  /** Mean rounds over every fight (a lost or stalled fight counts the rounds it lasted). */
  avgRounds: number;
  /** Mean rounds over the won fights only (0 when none was won). */
  avgRoundsWon: number;
  /** Mean share of party HP left at the end, over every fight. */
  avgHpFraction: number;
  /** Mean number of players downed at the end, over every fight. */
  avgDowned: number;
}

/** Runs `fights` fights; fight i uses mulberry32(seed + i), so the whole run is reproducible. */
export function simulateMany(party: Character[], enemies: EnemySpec[], fights: number, seed: number): SimSummary {
  let wins = 0;
  let rounds = 0;
  let roundsWon = 0;
  let hp = 0;
  let downed = 0;
  for (let i = 0; i < fights; i++) {
    const r = simulateFight(party, enemies, mulberry32(seed + i));
    rounds += r.rounds;
    hp += r.hpFraction;
    downed += r.downed;
    if (r.won) {
      wins++;
      roundsWon += r.rounds;
    }
  }
  return {
    fights,
    winRate: wins / fights,
    avgRounds: rounds / fights,
    avgRoundsWon: wins ? roundsWon / wins : 0,
    avgHpFraction: hp / fights,
    avgDowned: downed / fights,
  };
}

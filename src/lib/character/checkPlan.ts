import { SKILL_ABILITIES, SKILL_IDS, classOf, proficiencyBonus, type SkillId } from './classes';
import { abilityModifier, normalizeAbilities } from './constants';
import { resolveCheck, type Advantage } from './check';
import { levelForXp } from './leveling';
import type { Character } from './types';

export interface PlannedCheck {
  player: string;
  skill: SkillId;
  dc: number;
  advantage: Advantage;
}

/** C8: a player attack on an enemy; the server rolls it against the enemy tier's hit threshold. */
export interface PlannedAttack {
  player: string;
  target: string;
  advantage: Advantage;
}

/** I2: an enemy attack on a player; the server rolls it against the player's armor class. */
export interface PlannedEnemyAttack {
  enemy: string;
  player: string;
}

/** J3: the DM's verdict on the team's rest vote; absent = no rest (also when the model left the field out). */
export type RestAnswer = 'ok' | 'interrupted';

export type CheckPlan =
  | { kind: 'checks'; checks: PlannedCheck[]; attacks: PlannedAttack[]; enemyAttacks: PlannedEnemyAttack[]; rest?: RestAnswer }
  | { kind: 'narration'; text: string; rest?: RestAnswer }
  /** The model ignored the JSON format and just narrated: use it as the narration. */
  | { kind: 'plain'; text: string }
  /** Looked like JSON but unusable: the caller falls back to an ordinary narration call. */
  | { kind: 'invalid' };

export interface CheckOutcome {
  playerDisplayName: string;
  skill: SkillId;
  dc: number;
  advantage: Advantage;
  /** Every d20 rolled (two for advantage/disadvantage). */
  dice: number[];
  /** The die that counted. */
  die: number;
  modifier: number;
  proficiency: number;
  /** Bonus from a worn accessory matching the skill (F5d) plus the complete-set bonus (X9, once, any skill); 0 when none. */
  itemBonus: number;
  total: number;
  success: boolean;
  critical: 'success' | 'failure' | null;
}

const MIN_DC = 1;
const MAX_DC = 30;

function isSkill(value: unknown): value is SkillId {
  return typeof value === 'string' && (SKILL_IDS as string[]).includes(value);
}

/** undefined = not JSON-looking, null = looked like JSON but did not parse. */
function parseObject(raw: string): unknown {
  let text = raw.trim();
  const fence = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{')) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseCheckPlan(raw: string): CheckPlan {
  const text = raw.trim();
  const parsed = parseObject(text);
  if (parsed === undefined) return { kind: 'plain', text };
  if (!parsed || typeof parsed !== 'object') return { kind: 'invalid' };
  const obj = parsed as { checks?: unknown; attacks?: unknown; enemyAttacks?: unknown; narration?: unknown; rest?: unknown };
  const rest: { rest?: RestAnswer } = obj.rest === 'ok' || obj.rest === 'interrupted' ? { rest: obj.rest } : {};

  const attacks: PlannedAttack[] = [];
  if (Array.isArray(obj.attacks)) {
    for (const a of obj.attacks) {
      if (!a || typeof a !== 'object') continue;
      const { player, target, advantage } = a as Record<string, unknown>;
      if (typeof player !== 'string' || !player.trim() || typeof target !== 'string' || !target.trim()) continue;
      attacks.push({
        player: player.trim(),
        target: target.trim(),
        advantage: advantage === 'advantage' || advantage === 'disadvantage' ? advantage : 'none',
      });
    }
  }
  const enemyAttacks: PlannedEnemyAttack[] = [];
  if (Array.isArray(obj.enemyAttacks)) {
    for (const a of obj.enemyAttacks) {
      if (!a || typeof a !== 'object') continue;
      const { enemy, player } = a as Record<string, unknown>;
      if (typeof enemy !== 'string' || !enemy.trim() || typeof player !== 'string' || !player.trim()) continue;
      enemyAttacks.push({ enemy: enemy.trim(), player: player.trim() });
    }
  }
  if (Array.isArray(obj.checks) || attacks.length > 0 || enemyAttacks.length > 0 || rest.rest) {
    const checks: PlannedCheck[] = [];
    for (const c of Array.isArray(obj.checks) ? obj.checks : []) {
      if (!c || typeof c !== 'object') continue;
      const { player, skill, dc, advantage } = c as Record<string, unknown>;
      if (typeof player !== 'string' || !player.trim() || !isSkill(skill)) continue;
      const dcNum = typeof dc === 'number' && Number.isFinite(dc) ? Math.round(dc) : 12;
      checks.push({
        player: player.trim(),
        skill,
        dc: Math.min(MAX_DC, Math.max(MIN_DC, dcNum)),
        advantage: advantage === 'advantage' || advantage === 'disadvantage' ? advantage : 'none',
      });
    }
    if (checks.length > 0 || attacks.length > 0 || enemyAttacks.length > 0 || (rest.rest && !(typeof obj.narration === 'string' && obj.narration.trim()))) return { kind: 'checks', checks, attacks, enemyAttacks, ...rest };
  }
  if (typeof obj.narration === 'string' && obj.narration.trim()) {
    return { kind: 'narration', text: obj.narration.trim(), ...rest };
  }
  return { kind: 'invalid' };
}

/** Rolls and resolves each planned check on the server. One check per known player; others are ignored. */
export function runChecks(planned: PlannedCheck[], characters: Character[], rollDie: () => number): CheckOutcome[] {
  const byName = new Map(characters.map((c) => [c.displayName.toLowerCase(), c]));
  const seen = new Set<string>();
  const out: CheckOutcome[] = [];
  for (const check of planned) {
    const character = byName.get(check.player.toLowerCase());
    if (!character || seen.has(character.id)) continue;
    seen.add(character.id);
    const abilities = normalizeAbilities(character.abilities);
    const level = levelForXp(character.xp ?? 0);
    const proficient = classOf(character.classId)?.skills.includes(check.skill) ?? false;
    const ability = abilities[SKILL_ABILITIES[check.skill]];
    const itemBonus = (character.skillBonuses?.[check.skill] ?? 0) + (character.itemEffects?.setSkillBonus ?? 0);
    const dice = check.advantage === 'none' ? [rollDie()] : [rollDie(), rollDie()];
    const result = resolveCheck({ d20s: dice, ability, proficient, level, dc: check.dc, advantage: check.advantage, bonus: itemBonus });
    const die = check.advantage === 'advantage' ? Math.max(...dice) : check.advantage === 'disadvantage' ? Math.min(...dice) : dice[0];
    out.push({
      playerDisplayName: character.displayName,
      skill: check.skill,
      dc: check.dc,
      advantage: check.advantage,
      dice,
      die,
      modifier: abilityModifier(ability),
      proficiency: proficient ? proficiencyBonus(level) : 0,
      itemBonus,
      total: result.total,
      success: result.success,
      critical: result.critical,
    });
  }
  return out;
}

/** Extra prompt section for the first call: answer with a check plan or the narration itself. */
export function checkPlanInstructions(fighting = false): string[] {
  return [
    'FORMAT OF YOUR ANSWER THIS TIME: reply with one JSON object and nothing else, in one of two shapes.',
    '1) {"checks":[{"player":"PlayerName","skill":"stealth","dc":14,"advantage":"none"}]} when at least one player action has a genuinely UNCERTAIN outcome where failure would be interesting (sneaking past a guard, forcing a lock, persuading a suspicious noble, climbing a slick wall). Do not narrate yet; the server will roll and then ask you to narrate.',
    `   skill must be one of: ${SKILL_IDS.join(', ')}. dc is 5 (easy) to 25 (very hard); use the ability modifiers above to keep it fair. advantage is "none", "advantage" or "disadvantage". At most one check per player.`,
    '2) {"narration":"..."} when no action has an uncertain outcome (routine actions, talking, travelling, anything that simply works, or combat handled by the dice above). Put the full narration, including any [[tags]], inside the narration string.',
    ...(fighting
      ? [
          'A fight is in progress. When a player ATTACKS a listed enemy, do not use a skill check: add them to an "attacks" list instead, e.g. {"attacks":[{"player":"PlayerName","target":"EnemyName","advantage":"none"}],"checks":[]} (attacks and checks may be combined; a player gets either one attack or one check). The server rolls the hit and the damage and removes the enemy health itself, so never decide yourself whether an attack lands.',
          'When an ENEMY attacks a player this round, you MUST answer in shape 1 (never shape 2), listing each attack in "enemyAttacks", e.g. {"checks":[],"enemyAttacks":[{"enemy":"EnemyName","player":"PlayerName"}]} (at most one attack per enemy, except a boss with boss_signature, which may list 2 different players in every 3rd round of the fight; it may be combined with checks and attacks). Use the exact enemy names listed above. The server rolls the d20 against the armor class and the damage dice, then asks you to narrate the real result (hit, miss or critical), so do NOT narrate the enemy attack yourself and do not use an enemy_attack tag.',
        ]
      : []),
    'Set a check ONLY for actions whose result is truly uncertain, not for every action. Most rounds with routine actions should use shape 2.',
  ];
}

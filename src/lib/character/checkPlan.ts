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

export type CheckPlan =
  | { kind: 'checks'; checks: PlannedCheck[]; attacks: PlannedAttack[] }
  | { kind: 'narration'; text: string }
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
  const obj = parsed as { checks?: unknown; attacks?: unknown; narration?: unknown };

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
  if (Array.isArray(obj.checks) || attacks.length > 0) {
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
    if (checks.length > 0 || attacks.length > 0) return { kind: 'checks', checks, attacks };
  }
  if (typeof obj.narration === 'string' && obj.narration.trim()) {
    return { kind: 'narration', text: obj.narration.trim() };
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
        ]
      : []),
    'Set a check ONLY for actions whose result is truly uncertain, not for every action. Most rounds with routine actions should use shape 2.',
  ];
}

/**
 * K7: what the UI shows about a player's subclass and picked abilities: the choices still open, the abilities
 * that can be pressed (each with its own cooldown) and the subclass name for the player card. Pure; reads only
 * the fields RoundPlayer carries. `undefined` fields mean "the column is not readable yet" -> nothing is offered.
 */
import { classOf } from './classes';
import { levelForXp } from './leveling';
import { PICK_ABILITIES, PICK_ABILITY_IDS, picksFor, type PickAbilityDef } from './abilityPicks';
import { PICK_LEVELS } from './abilityPickConstants';
import { SUBCLASS_LEVEL } from './subclassConstants';
import { isSubclassId, REPLACEMENT_ABILITIES, replacementOf, subclassesFor, subclassOf } from './subclasses';

export interface OptionsHolder {
  classId?: string | null;
  xp?: number;
  subclassId?: string | null;
  abilityPicks?: Record<string, string>;
  abilityCooldown?: number;
  abilityCooldowns?: Record<string, number>;
}

export interface PendingChoice {
  kind: 'subclass' | 'pick';
  /** Level that unlocked the choice (3, 6 or 9). */
  level: number;
  options: { id: string; nameTh: string; descTh: string }[];
}

/** The choices this character can make now: the subclass first, then the picks by level. */
export function pendingChoices(p: OptionsHolder): PendingChoice[] {
  if (!p.classId || !classOf(p.classId)) return [];
  const level = levelForXp(p.xp ?? 0);
  const out: PendingChoice[] = [];
  if (p.subclassId !== undefined && level >= SUBCLASS_LEVEL && !isSubclassId(p.subclassId)) {
    const options = subclassesFor(p.classId);
    if (options.length) out.push({ kind: 'subclass', level: SUBCLASS_LEVEL, options: options.map(({ id, nameTh, descTh }) => ({ id, nameTh, descTh })) });
  }
  if (p.abilityPicks !== undefined) {
    for (const lv of PICK_LEVELS) {
      if (level < lv) continue;
      const stored = p.abilityPicks[String(lv)];
      if (stored && (PICK_ABILITY_IDS as readonly string[]).includes(stored)) continue;
      const options = picksFor(p.classId, lv);
      if (options.length) out.push({ kind: 'pick', level: lv, options: options.map(({ id, nameTh, descTh }) => ({ id, nameTh, descTh })) });
    }
  }
  return out;
}

export interface PressableAbility {
  id: string;
  nameTh: string;
  descTh: string;
  /** Eventful rounds left; 0 = ready. */
  cooldown: number;
  target: 'enemy' | null;
}

function cooldownFor(p: OptionsHolder, abilityId: string): number {
  const mapped = p.abilityCooldowns?.[abilityId];
  if (mapped !== undefined) return mapped;
  return abilityId === p.classId ? (p.abilityCooldown ?? 0) : 0;
}

/** The subclass's replacement for the main ability (its own button), or null when the class keeps its own. */
export function replacementAbility(p: OptionsHolder): PressableAbility | null {
  const r = replacementOf({ classId: p.classId, subclassId: p.subclassId });
  if (!r) return null;
  return { id: r.id, nameTh: r.nameTh, descTh: REPLACEMENT_ABILITIES[r.id].descTh, cooldown: cooldownFor(p, r.id), target: r.target };
}

/** Picked abilities of kind 'active' (the passive ones work by themselves). */
export function activePickAbilities(p: OptionsHolder): PressableAbility[] {
  return PICK_LEVELS.flatMap((lv) => {
    const id = p.abilityPicks?.[String(lv)];
    const def: PickAbilityDef | undefined = id ? (PICK_ABILITIES as Record<string, PickAbilityDef>)[id] : undefined;
    if (!def || def.classId !== p.classId || def.level !== lv || def.kind !== 'active') return [];
    return [{ id: def.id, nameTh: def.nameTh, descTh: def.descTh, cooldown: cooldownFor(p, def.id), target: def.target }];
  });
}

/** Everything beyond the plain class ability that can be pressed in the action box. */
export function extraAbilities(p: OptionsHolder): PressableAbility[] {
  const rep = replacementAbility(p);
  return [...(rep ? [rep] : []), ...activePickAbilities(p)];
}

export function subclassLabel(p: OptionsHolder): string | null {
  return subclassOf({ classId: p.classId, subclassId: p.subclassId })?.nameTh ?? null;
}

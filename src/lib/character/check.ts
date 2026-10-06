/**
 * Pure ability/skill check resolver (no I/O, no randomness: caller supplies the d20 rolls).
 *
 * - `ability` is the ability SCORE (e.g. 14), not the modifier; the modifier is derived
 *   with `abilityModifier` (floor((score - 10) / 2)).
 * - `proficient` adds `proficiencyBonus(level)`.
 * - `advantage`: 'advantage' takes the higher of two d20s, 'disadvantage' the lower
 *   (needs d20s.length >= 2); 'none'/undefined uses the first die only.
 * - Natural 1/20 rule (skill-check variant, differs from RAW where nat 20 is not auto-success):
 *   the chosen die being 20 = success with critical 'success', 1 = failure with critical
 *   'failure', regardless of total vs dc. Otherwise success = total >= dc and critical = null.
 */
import { abilityModifier } from './constants';
import { proficiencyBonus } from './classes';

export type Advantage = 'none' | 'advantage' | 'disadvantage';

export interface CheckInput {
  d20s: readonly number[];
  ability: number;
  proficient: boolean;
  level: number;
  dc: number;
  advantage?: Advantage;
}

export interface CheckResult {
  total: number;
  success: boolean;
  critical: 'success' | 'failure' | null;
}

export function resolveCheck(input: CheckInput): CheckResult {
  const { d20s, ability, proficient, level, dc, advantage = 'none' } = input;
  const needed = advantage === 'none' ? 1 : 2;
  if (d20s.length < needed) throw new Error(`resolveCheck needs ${needed} d20 roll(s)`);
  const used = d20s.slice(0, needed);
  for (const d of used) {
    if (!Number.isInteger(d) || d < 1 || d > 20) throw new Error(`invalid d20 roll: ${d}`);
  }
  const die = advantage === 'advantage' ? Math.max(...used) : advantage === 'disadvantage' ? Math.min(...used) : used[0];
  const total = die + abilityModifier(ability) + (proficient ? proficiencyBonus(level) : 0);
  if (die === 20) return { total, success: true, critical: 'success' };
  if (die === 1) return { total, success: false, critical: 'failure' };
  return { total, success: total >= dc, critical: null };
}

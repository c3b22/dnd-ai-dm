/**
 * J1 rest module (pure; the caller supplies the dice).
 *
 * Short rest: heal d8 per 2 levels (min 1 die) + CON mod, ability cooldown to 0, one spell slot back
 * (when the character has `spellSlots`; K3 plugs in later), at most 2 between long rests.
 * Long rest: full HP, cooldown 0, full spell slots, short-rest count and death saves reset; only where
 * the AI confirmed it is safe (or a sanctuary). Downed/dead characters get nothing (revive first).
 */
import { abilityModifier, normalizeAbilities } from './constants';
import { levelForXp } from './leveling';
import {
  SHORT_REST_DIE_SIDES,
  SHORT_REST_LEVELS_PER_DIE,
  SHORT_REST_MAX_PER_LONG_REST,
  SHORT_REST_SPELL_SLOTS_RESTORED,
} from './restConstants';
import type { Character } from './types';

export interface SpellSlots {
  current: number;
  max: number;
}

/** Character plus the rest-related fields that arrive with J2 (short rests used) and K3 (spell slots). */
export type RestCharacter = Character & {
  shortRestsUsed?: number;
  spellSlots?: SpellSlots | null;
};

export type RestRefusal = 'not_active' | 'no_short_rests_left' | 'not_safe';

export interface RestResult {
  ok: boolean;
  reason?: RestRefusal;
  character: RestCharacter;
  healed: number;
  /** Individual hit die results (short rest only). */
  dice: number[];
  changes: string[];
}

export function shortRestDiceCount(level: number): number {
  return Math.max(1, Math.floor(level / SHORT_REST_LEVELS_PER_DIE));
}

const refuse = (character: RestCharacter, reason: RestRefusal, line: string): RestResult => ({
  ok: false, reason, character, healed: 0, dice: [], changes: [line],
});

export function shortRest(c: RestCharacter, rollDie: (sides: number) => number): RestResult {
  if (c.status !== 'active') {
    return refuse(c, 'not_active', `${c.displayName} พักไม่ได้ในสภาพนี้ (ต้องฟื้นขึ้นมาก่อน)`);
  }
  const used = c.shortRestsUsed ?? 0;
  if (used >= SHORT_REST_MAX_PER_LONG_REST) {
    return refuse(c, 'no_short_rests_left', `${c.displayName} พักสั้นครบ ${SHORT_REST_MAX_PER_LONG_REST} ครั้งแล้ว ต้องพักยาวก่อน`);
  }
  const level = levelForXp(c.xp ?? 0);
  const dice = Array.from({ length: shortRestDiceCount(level) }, () => rollDie(SHORT_REST_DIE_SIDES));
  const con = abilityModifier(normalizeAbilities(c.abilities).CON);
  const amount = Math.max(0, dice.reduce((a, b) => a + b, 0) + con);
  const hp = Math.min(c.maxHp, c.hp + amount);
  const next: RestCharacter = { ...c, hp, abilityCooldown: 0, shortRestsUsed: used + 1 };
  if (c.spellSlots) {
    next.spellSlots = { max: c.spellSlots.max, current: Math.min(c.spellSlots.max, c.spellSlots.current + SHORT_REST_SPELL_SLOTS_RESTORED) };
  }
  const healed = hp - c.hp;
  return { ok: true, character: next, healed, dice, changes: [`${c.displayName} พักสั้น ฟื้น ${healed} HP`] };
}

export function longRest(c: RestCharacter, opts: { safe: boolean; sanctuary?: boolean }): RestResult {
  if (c.status !== 'active') {
    return refuse(c, 'not_active', `${c.displayName} พักไม่ได้ในสภาพนี้ (ต้องฟื้นขึ้นมาก่อน)`);
  }
  if (!opts.safe && !opts.sanctuary) {
    return refuse(c, 'not_safe', 'ที่นี่ไม่ปลอดภัยพอที่จะพักยาว');
  }
  const next: RestCharacter = { ...c, hp: c.maxHp, abilityCooldown: 0, shortRestsUsed: 0, deathSaves: null };
  if (c.spellSlots) next.spellSlots = { max: c.spellSlots.max, current: c.spellSlots.max };
  return { ok: true, character: next, healed: c.maxHp - c.hp, dice: [], changes: [`${c.displayName} พักยาว ฟื้น HP เต็มและพลังกลับมาครบ`] };
}

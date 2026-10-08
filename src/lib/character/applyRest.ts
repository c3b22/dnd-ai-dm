/**
 * J3: applies a passed team rest vote to the characters once the DM said "ok". Pure; uses the J1 rest module,
 * which only ever helps characters who are `active` (downed/dead ones are refused and left untouched).
 */
import { longRest, shortRest, type RestCharacter } from './rest';
import { spellSlotsOf, withSpellSlots } from './spells';
import type { Character } from './types';

export interface TeamRestResult {
  characters: Character[];
  changes: string[];
  /** Characters whose short-rest count changed and must be persisted (`players.short_rests_used`). */
  shortRestChanged: Character[];
  /** K3: mages whose spent spell slots changed and must be persisted (`players.spell_slots_used`). */
  spellSlotsChanged: Character[];
}

export function applyTeamRest(
  characters: Character[],
  kind: 'short' | 'long',
  rollDie: (sides: number) => number
): TeamRestResult {
  const changes: string[] = [];
  const shortRestChanged: Character[] = [];
  const spellSlotsChanged: Character[] = [];
  const next = characters.map((c) => {
    // K3: a mage's slots are stored as "used"; hand rest.ts a { current, max } view and convert the result back.
    const slots = spellSlotsOf(c);
    const input: RestCharacter = slots ? { ...c, spellSlots: slots } : c;
    const result = kind === 'short' ? shortRest(input, rollDie) : longRest(input, { safe: true });
    changes.push(...result.changes);
    if (!result.ok) return c;
    let out = result.character as Character;
    if (slots && result.character.spellSlots) {
      const { spellSlots, ...rest } = result.character;
      out = withSpellSlots(rest as Character, spellSlots!);
      if ((out.spellSlotsUsed ?? 0) !== (c.spellSlotsUsed ?? 0)) spellSlotsChanged.push(out);
    }
    if ((out.shortRestsUsed ?? 0) !== (c.shortRestsUsed ?? 0)) shortRestChanged.push(out);
    return out;
  });
  return { characters: next, changes, shortRestChanged, spellSlotsChanged };
}

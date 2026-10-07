/**
 * J3: applies a passed team rest vote to the characters once the DM said "ok". Pure; uses the J1 rest module,
 * which only ever helps characters who are `active` (downed/dead ones are refused and left untouched).
 */
import { longRest, shortRest, type RestCharacter } from './rest';
import type { Character } from './types';

export interface TeamRestResult {
  characters: Character[];
  changes: string[];
  /** Characters whose short-rest count changed and must be persisted (`players.short_rests_used`). */
  shortRestChanged: Character[];
}

export function applyTeamRest(
  characters: Character[],
  kind: 'short' | 'long',
  rollDie: (sides: number) => number
): TeamRestResult {
  const changes: string[] = [];
  const shortRestChanged: Character[] = [];
  const next = characters.map((c) => {
    const result = kind === 'short' ? shortRest(c as RestCharacter, rollDie) : longRest(c as RestCharacter, { safe: true });
    changes.push(...result.changes);
    if (!result.ok) return c;
    if ((result.character.shortRestsUsed ?? 0) !== (c.shortRestsUsed ?? 0)) shortRestChanged.push(result.character);
    return result.character as Character;
  });
  return { characters: next, changes, shortRestChanged };
}

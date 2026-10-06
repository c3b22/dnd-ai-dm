import type { AbilityScores } from './constants';
import type { SkillId } from './classes';

export type CharacterStatus = 'active' | 'downed';

export interface Character {
  id: string;
  displayName: string;
  weaponId: string | null;
  hp: number;
  maxHp: number;
  status: CharacterStatus;
  revivesSinceSanctuary: number;
  /** Flat damage the equipped armor absorbs from each hit; absent means none. */
  armorReduction?: number;
  /** Check bonus per skill from the worn accessory (see equippedSkillBonuses); absent means none. */
  skillBonuses?: Partial<Record<SkillId, number>>;
  /** Personal gold; absent means 0. */
  gold?: number;
  /** Experience points; absent means 0. Level is always derived from this. */
  xp?: number;
  /** Class id (see classes.ts); null or absent means classless. */
  classId?: string | null;
  /** Eventful rounds left before the class ability is ready; absent means 0. */
  abilityCooldown?: number;
  /** Six ability scores; absent means 10 for every score (see normalizeAbilities). */
  abilities?: AbilityScores;
  /** Identity text (max 500 chars each, see identity.ts); null or absent means not set. */
  backstory?: string | null;
  personality?: string | null;
  goal?: string | null;
}

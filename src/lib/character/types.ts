import type { AbilityScores } from './constants';
import type { SkillId } from './classes';
import type { ItemEffects } from '@/lib/inventory/effects';
import type { DeathSaves } from './deathSaves';

/** `dead` = permanent death (H3a, rooms with permadeath only). */
export type CharacterStatus = 'active' | 'downed' | 'dead';

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
  /** Weight of the equipped armor (caps the DEX bonus of armor class, see combat/armorClass.ts); absent means no armor. */
  armorWeight?: number;
  /** Check bonus per skill from the worn accessory (see equippedSkillBonuses); absent means none. */
  skillBonuses?: Partial<Record<SkillId, number>>;
  /** Combined special effects of the worn items (F5j0); absent means none. */
  itemEffects?: ItemEffects;
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
  /** F5g: the revive charm worn in the accessory slot (see equippedReviveCharm); null/absent = none. */
  reviveCharm?: { itemId: string; reviveHp: number } | null;
  /** H1 death save tally while downed; null/absent = none. */
  deathSaves?: DeathSaves | null;
  /** J2/J3: short rests taken since the last long rest; absent = 0. */
  shortRestsUsed?: number;
}

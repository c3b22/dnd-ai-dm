import { abilityModifier, normalizeAbilities } from '@/lib/character/constants';
import type { AbilityScores } from '@/lib/character/constants';
import { hasPick } from '@/lib/character/abilityPicks';
import { STONE_SKIN_AC } from '@/lib/character/abilityPickConstants';
import {
  AC_PER_REDUCTION,
  BASE_AC,
  LIGHT_ARMOR_MAX_WEIGHT,
  MEDIUM_ARMOR_DEX_CAP,
  MEDIUM_ARMOR_MAX_WEIGHT,
} from './constants';

export interface ArmorClassInput {
  abilities?: AbilityScores;
  /** Reduction of the worn armor; absent means no armor. */
  armorReduction?: number;
  /** Weight of the worn armor (decides the DEX cap); absent means no armor. */
  armorWeight?: number;
  /** K4: AC bonus a spell gives for this round only (Character.roundAcBonus). */
  roundAcBonus?: number;
  /** K6: warrior_stone_skin gives AC +1 for good; needs the class and the level 6 / 9 picks. */
  classId?: string | null;
  abilityPicks?: Record<string, string> | null;
}

/** DEX bonus allowed by the worn armor: none/light uncapped, medium at most +2, heavy never positive. */
function dexBonus(dexMod: number, armorWeight: number | undefined): number {
  if (!armorWeight || armorWeight <= LIGHT_ARMOR_MAX_WEIGHT) return dexMod;
  if (armorWeight <= MEDIUM_ARMOR_MAX_WEIGHT) return Math.min(dexMod, MEDIUM_ARMOR_DEX_CAP);
  return Math.min(dexMod, 0);
}

export function armorClass(c: ArmorClassInput): number {
  const dexMod = abilityModifier(normalizeAbilities(c.abilities).DEX);
  return BASE_AC + dexBonus(dexMod, c.armorWeight) + AC_PER_REDUCTION * (c.armorReduction ?? 0) + (c.roundAcBonus ?? 0) + (hasPick(c, 'warrior_stone_skin') ? STONE_SKIN_AC : 0);
}

import { rollDice } from '@/lib/character/dice';
import type { DiceSpec } from '@/lib/character/constants';

export const STARTING_GOLD = 20;

export const GOLD_TIERS = {
  small: { count: 2, sides: 4, bonus: 2 },
  medium: { count: 3, sides: 6, bonus: 5 },
  large: { count: 6, sides: 6, bonus: 10 },
} as const satisfies Record<string, DiceSpec>;
export type GoldTier = keyof typeof GOLD_TIERS;

export const rollGold = (tier: GoldTier, rollDie: (sides: number) => number): number =>
  rollDice(GOLD_TIERS[tier], rollDie);

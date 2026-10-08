/** K6: every number of the level 6 / level 9 abilities lives here so it can be tuned in one place (starting values, never playtested). */

/** Levels at which a character picks one of two abilities. */
export const PICK_LEVELS = [6, 9] as const;

// warrior
export const STONE_SKIN_AC = 1;
export const WAR_CRY_COOLDOWN = 4;
export const BLOOD_RUSH_HEAL = 2;
export const SWEEP_COOLDOWN = 4;
export const SWEEP_TARGETS = 2;

// archer
export const HAWK_EYE_BONUS = 1;
export const SNARE_COOLDOWN = 4;
export const PIERCING_COOLDOWN = 3;
export const PIERCING_MIN_PIPS = 2;
export const PIERCING_CRIT_PIPS = 3;
export const CHAIN_SHOT_PIPS = 1;

// cleric
export const WARD_PRAYER_COOLDOWN = 4;
export const WARD_PRAYER_AC = 2;
/** Twin spark: the second friend heals the rolled amount divided by this (rounded down, at least 1). */
export const TWIN_SPARK_DIVISOR = 2;
export const MASS_HEAL_COOLDOWN = 5;
export const SMITE_COOLDOWN = 3;
export const SMITE_MIN_PIPS = 2;
export const SMITE_CRIT_PIPS = 3;

// rogue
export const SMOKE_VEIL_COOLDOWN = 5;
export const WOUND_READER_BONUS = 2;
export const SHADOW_STEP_COOLDOWN = 5;

// mage
export const DEEP_RESERVE_LEVEL = 6;
export const DEEP_RESERVE_SLOTS = 1;
export const RECOVER_COOLDOWN = 6;
export const RECOVER_SLOTS = 2;
export const METEOR_COOLDOWN = 5;
export const METEOR_PIPS = 2;
/** frequent_surge: the arcane surge cooldown becomes this. */
export const FREQUENT_SURGE_COOLDOWN = 2;

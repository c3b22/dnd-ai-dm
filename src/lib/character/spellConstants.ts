/** K3: every number of the mage's spells lives here so it can be tuned in one place (starting values, never playtested). */
import type { SkillId } from './classes';

/** Spell slots by mage level; one slot level only, every non-cantrip spell costs 1. */
export const MAGE_SPELL_SLOTS: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6 };
/** Save DC = this + proficiency bonus + INT modifier. */
export const SPELL_SAVE_DC_BASE = 8;
/** Cantrips grow at these levels: arcane_bolt +1 bolt, scatter_spark +1 target each. */
export const CANTRIP_SCALE_LEVELS: readonly number[] = [5, 9];
/** From this level frost_lance, fire_burst and spell_ward are stronger. */
export const SPELL_HIGH_LEVEL = 7;

export const ARCANE_BOLT_PIPS = 1;
export const FROST_LANCE_PIPS = 2;
export const FROST_LANCE_PIPS_HI = 3;
export const SCATTER_SPARK_PIPS = 1;
export const SCATTER_SPARK_BASE_TARGETS = 2;
export const FIRE_BURST_PIPS = 1;
export const FIRE_BURST_PIPS_HI = 2;
/** A natural 20 on a spell attack removes one pip more than normal. */
export const SPELL_CRIT_EXTRA_PIPS = 1;

export const ARCANE_SHIELD_AC = 3;
export const ARCANE_SHIELD_AC_HI = 4;
/** arcane_shield is stronger from this level. */
export const ARCANE_SHIELD_HI_LEVEL = 9;
export const SPELL_WARD = 3;
export const SPELL_WARD_HI = 4;
export const QUICKEN_COOLDOWN_CUT = 2;
/** Area spells touch at most this many enemies (list order). */
export const SPELL_AOE_MAX_TARGETS = 6;
/** The arcane_surge ability (level 5+): the spell is cast free and its attack roll / save DC gets this much more. */
export const SURGE_UPGRADE_BONUS = 2;

export const ARCANE_SIGHT_SKILLS: readonly SkillId[] = ['perception', 'investigation', 'arcana', 'history', 'religion'];
export const ALL_TONGUES_SKILLS: readonly SkillId[] = ['persuasion', 'deception', 'intimidation', 'performance'];

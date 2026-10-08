/** K5: every number of the subclasses lives here so it can be tuned in one place (starting values, never playtested). */
import type { SkillId } from './classes';

/** The level at which a character may pick a subclass. */
export const SUBCLASS_LEVEL = 3;

// warrior
export const GUARDIAN_COOLDOWN = 2;
export const GUARDIAN_AC_BONUS = 2;
export const BERSERK_COOLDOWN = 3;
/** ฟันคลั่ง: a hit removes at least this many pips, a natural 20 this many. */
export const BERSERK_MIN_PIPS = 2;
export const BERSERK_CRIT_PIPS = 3;
export const BERSERK_AC_PENALTY = 2;
/** From ABILITY_UPGRADE_LEVEL a berserk strike that defeats an enemy heals this much. */
export const BERSERK_HEAL_ON_DEFEAT = 2;

// archer
export const HUNTER_AC_REDUCTION = 2;
export const HUNTER_EXTRA_PIPS = 1;
export const VOLLEY_COOLDOWN = 3;
export const VOLLEY_SHOTS = 2;
export const VOLLEY_SHOTS_HI = 3;

// cleric
export const LIFE_COOLDOWN = 2;
export const LIFE_HEAL_BONUS = 2;

// rogue
export const ASSASSIN_EXTRA_PIPS_IF_FULL = 1;
export const FEINT_COOLDOWN = 3;
export const FEINT_AC_BONUS = 2;
export const TRICKSTER_EXPERTISE_SKILLS: readonly SkillId[] = ['stealth', 'deception', 'sleight_of_hand'];

// mage
export const EVOKER_DC_BONUS = 1;
export const EVOKER_EXTRA_PIPS = 1;
export const WARDER_ARCANE_SHIELD_AC = 4;
export const WARDER_ARCANE_SHIELD_AC_HI = 5;
export const WARDER_SPELL_WARD = 5;
export const WARDER_SPELL_WARD_HI = 6;
export const WARDER_CONTROL_DC_BONUS = 2;
export const WARDER_CONTROL_SPELLS: readonly string[] = ['hold_foe', 'illusion_fog'];
/** Spells a warder casts on themselves without spending a slot (once per round). */
export const WARDER_FREE_SELF_SPELLS: readonly string[] = ['arcane_shield', 'spell_ward', 'valor_blessing'];

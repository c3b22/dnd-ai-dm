// C8: every number of the automatic combat formula lives here so it can be tuned in one place.
// These are starting values that have not been play-tested yet.
import type { DiceSpec } from '@/lib/character/constants';
import type { AbilityKey } from '@/lib/character/constants';
import type { EnemyTier } from '@/lib/character/tags';

/** I3: an enemy's armor class. A player's attack hits when d20 + ability mod + proficiency + magic bonus is at least this (nat 1 always misses, nat 20 always hits). */
export const HIT_THRESHOLD: Record<EnemyTier, number> = { minion: 11, normal: 13, strong: 15, boss: 17 };

/** I3: the ability(ies) a base weapon attacks with; when two are listed the higher modifier is used. Magic weapons follow their base weapon. */
export const WEAPON_ATTACK_ABILITIES: Record<string, readonly AbilityKey[]> = {
  shortsword: ['STR', 'DEX'],
  dagger: ['STR', 'DEX'],
  shortbow: ['DEX'],
  staff: ['WIS'],
  fists: ['STR'],
};

/** Pips a normal hit removes. */
export const HIT_PIPS = 1;
/** Pips a heavy blow (big damage roll or natural 20) removes. */
export const HEAVY_PIPS = 2;
/** Extra pips a natural 20 removes for a wearer of a crit_surge item. */
export const CRIT_SURGE_EXTRA_PIPS = 1;
/** HP a lifesteal wearer heals when a hit removes a pip (once per round per wearer). */
export const LIFESTEAL_HEAL = 1;
/** A damage roll at or above this share of the weapon's maximum dice damage is a heavy blow. */
export const HEAVY_DAMAGE_RATIO = 0.75;

/** I2: an enemy's attack roll is d20 + this bonus against the player's armor class (nat 1 always misses, nat 20 always hits). */
export const ENEMY_ATTACK_BONUS: Record<EnemyTier, number> = { minion: 3, normal: 4, strong: 5, boss: 7 };
/** I2: damage dice an enemy rolls on a hit (a natural 20 doubles the dice, not the flat bonus). Armor already counted in AC, so it no longer reduces this. */
export const ENEMY_DAMAGE_DICE: Record<EnemyTier, DiceSpec> = {
  minion: { count: 1, sides: 4, bonus: 0 },
  normal: { count: 1, sides: 6, bonus: 1 },
  strong: { count: 2, sides: 4, bonus: 2 },
  boss: { count: 2, sides: 6, bonus: 2 },
};
/** Ward and the warrior's guard can never reduce an enemy hit below this. */
export const MIN_ENEMY_DAMAGE = 1;
/** The hit threshold never drops below this, even with keen_eye (nat 1 still always misses). */
export const MIN_HIT_THRESHOLD = 2;

/** I1: player armor class = BASE_AC + DEX mod (capped by armor class) + AC_PER_REDUCTION x worn armor reduction. */
export const BASE_AC = 10;
export const AC_PER_REDUCTION = 2;
/** Highest DEX bonus by worn-armor weight: light (weight <= 1) and no armor are uncapped, medium (2) +2, heavy (>= 3) none. */
export const LIGHT_ARMOR_MAX_WEIGHT = 1;
export const MEDIUM_ARMOR_MAX_WEIGHT = 2;
export const MEDIUM_ARMOR_DEX_CAP = 2;

/** I4: enemy traits picked from this fixed list; the server computes every effect. */
export const ENEMY_TRAIT_IDS = ['armored', 'brute', 'pack', 'venomous', 'nimble', 'regenerating', 'ranged', 'fearsome', 'boss_signature'] as const;
export type EnemyTrait = (typeof ENEMY_TRAIT_IDS)[number];
/** An enemy carries at most this many traits (extra ones in a tag are ignored). */
export const MAX_ENEMY_TRAITS = 2;
/** Thai badge shown in the enemy panel. */
export const ENEMY_TRAIT_LABELS: Record<EnemyTrait, string> = {
  armored: 'เกราะหนา',
  brute: 'กำลังสูง',
  pack: 'ล่าเป็นฝูง',
  venomous: 'พิษร้าย',
  nimble: 'ว่องไว',
  regenerating: 'ฟื้นตัวได้',
  ranged: 'โจมตีระยะไกล',
  fearsome: 'น่าเกรงขาม',
  boss_signature: 'ท่าไม้ตายบอส',
};
/** What the DM is told each trait does (the server applies the numbers; "narration only" ones are just for the story). */
export const ENEMY_TRAIT_HINTS: Record<EnemyTrait, string> = {
  armored: 'armor class +2 against player attacks',
  brute: 'its hits deal +2 damage',
  pack: 'attacks with advantage while at least one other enemy of the fight is still standing',
  venomous: 'a hit also poisons the player: 1 more HP lost at the start of the next round',
  nimble: 'armor class +1 against player attacks, and slips away easily when it flees (narration only)',
  regenerating: 'recovers 1 pip after every 2 rounds in which it is not hit, never above its starting pips',
  ranged: 'can strike any player from afar, no one is out of reach (narration only)',
  fearsome: 'its terror gives every player disadvantage on attacks during the first round of the fight',
  boss_signature: 'boss only: every 3rd round of the fight it may attack 2 different players',
};
/** Traits only a boss can carry. */
export const BOSS_ONLY_TRAITS: readonly EnemyTrait[] = ['boss_signature'];
export const ARMORED_AC_BONUS = 2;
export const NIMBLE_AC_BONUS = 1;
export const BRUTE_DAMAGE_BONUS = 2;
/** HP a venomous hit takes at the start of the next round (never drops the player below 1 HP). */
export const VENOM_DAMAGE = 1;
/** Rounds without being hit before a regenerating enemy recovers, and the pips it recovers. */
export const REGEN_CALM_ROUNDS = 2;
export const REGEN_PIPS = 1;
/** The fight round (1-based) in which fearsome enemies frighten the players. */
export const FEARSOME_ROUND = 1;
/** A boss_signature boss attacks two players every this-many rounds. */
export const BOSS_SIGNATURE_EVERY = 3;
export const BOSS_SIGNATURE_TARGETS = 2;

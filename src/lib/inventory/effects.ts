import type { Slot } from './catalog';

/** Special item mechanics chosen in docs/magic-mechanics-draft.md (F5j0). Behaviour of each lands in later tasks. */
export const ITEM_EFFECT_IDS = ['crit_surge', 'lifesteal', 'keen_eye', 'ward', 'deep_pack', 'lucky_purse', 'quick_tempo'] as const;
export type ItemEffectId = (typeof ITEM_EFFECT_IDS)[number];

/** X9: bonus to every skill check when weapon, armor and accessory share a theme. */
export const SET_SKILL_BONUS = 1;

export const KEEN_EYE_DEFAULT = 1;
export const KEEN_EYE_MAX = 2;

/** X4 ward: extra damage reduction on the first hit a wearer takes in a round (2-3, default 2). */
export const WARD_DEFAULT = 2;
export const WARD_MAX = 3;

/** X6 deep_pack: extra carry capacity (3-5, default 3). */
export const DEEP_PACK_DEFAULT = 3;
export const DEEP_PACK_MAX = 5;

/** X7 lucky_purse: extra gold on every gold-tag reward (default 2). */
export const LUCKY_PURSE_DEFAULT = 2;

/** X8 quick_tempo: extra cooldown rounds shaved off on every eventful round (fixed, no per-item value). */
export const QUICK_TEMPO_EXTRA = 1;

export interface EquippedEffectItem {
  slot: Slot;
  effect?: ItemEffectId;
  theme?: string;
  /** Strength of the effect, e.g. keen_eye lowers the hit threshold by this much (1-2). */
  effectValue?: number;
}

/** Combined special effects of everything one character wears. */
export interface ItemEffects {
  /** Unique effects; the same effect on several worn items counts once. */
  effects: ItemEffectId[];
  /** Shared theme of a complete weapon + armor + accessory set, else null. */
  setTheme: string | null;
  /** Skill-check bonus granted by the set (0 without a complete set). */
  setSkillBonus: number;
  /** keen_eye only: hit-threshold reduction (1-2, default 1; the strongest worn item wins). Absent without keen_eye. */
  keenEye?: number;
  /** ward only: extra reduction on the first hit of a round (2-3, default 2; the strongest worn item wins). Absent without ward. */
  ward?: number;
  /** deep_pack only: extra carry capacity (3-5, default 3; the strongest worn item wins). Absent without deep_pack. */
  deepPack?: number;
  /** lucky_purse only: extra gold per gold-tag reward (default 2; the strongest worn item wins). Absent without lucky_purse. */
  luckyPurse?: number;
}

export function aggregateEffects(equippedItems: EquippedEffectItem[]): ItemEffects {
  const effects = [...new Set(equippedItems.flatMap((i) => (i.effect ? [i.effect] : [])))];
  const themeOf = (slot: Slot) => equippedItems.find((i) => i.slot === slot)?.theme;
  const [w, a, c] = [themeOf('weapon'), themeOf('armor'), themeOf('accessory')];
  const setTheme = w && w === a && a === c ? w : null;
  const result: ItemEffects = { effects, setTheme, setSkillBonus: setTheme ? SET_SKILL_BONUS : 0 };
  if (effects.includes('keen_eye')) {
    const values = equippedItems.filter((i) => i.effect === 'keen_eye').map((i) => i.effectValue ?? KEEN_EYE_DEFAULT);
    result.keenEye = Math.min(KEEN_EYE_MAX, Math.max(KEEN_EYE_DEFAULT, ...values));
  }
  if (effects.includes('ward')) {
    const values = equippedItems.filter((i) => i.effect === 'ward').map((i) => i.effectValue ?? WARD_DEFAULT);
    result.ward = Math.min(WARD_MAX, Math.max(WARD_DEFAULT, ...values));
  }
  if (effects.includes('deep_pack')) {
    const values = equippedItems.filter((i) => i.effect === 'deep_pack').map((i) => i.effectValue ?? DEEP_PACK_DEFAULT);
    result.deepPack = Math.min(DEEP_PACK_MAX, Math.max(DEEP_PACK_DEFAULT, ...values));
  }
  if (effects.includes('lucky_purse')) {
    const values = equippedItems.filter((i) => i.effect === 'lucky_purse').map((i) => i.effectValue ?? LUCKY_PURSE_DEFAULT);
    result.luckyPurse = Math.max(LUCKY_PURSE_DEFAULT, ...values);
  }
  return result;
}

/**
 * Takes the wearer's ward for the first hit of the round: returns the extra reduction (0 without ward or once
 * `used` already holds the character) and records the use. `used` is shared by every damage path of one round.
 */
export function takeWard(character: { id: string; itemEffects?: ItemEffects; roundWard?: number }, used: Set<string>): number {
  // K4: a ward spell (roundWard) stacks with the worn ward and is spent by the same first hit.
  const worn = character.itemEffects?.effects.includes('ward') ? (character.itemEffects.ward ?? WARD_DEFAULT) : 0;
  const total = worn + (character.roundWard ?? 0);
  if (total <= 0 || used.has(character.id)) return 0;
  used.add(character.id);
  return total;
}

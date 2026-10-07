import type { Slot } from './catalog';

/** Special item mechanics chosen in docs/magic-mechanics-draft.md (F5j0). Behaviour of each lands in later tasks. */
export const ITEM_EFFECT_IDS = ['crit_surge', 'lifesteal', 'keen_eye', 'ward', 'deep_pack', 'lucky_purse', 'quick_tempo'] as const;
export type ItemEffectId = (typeof ITEM_EFFECT_IDS)[number];

/** X9: bonus to every skill check when weapon, armor and accessory share a theme. */
export const SET_SKILL_BONUS = 1;

export const KEEN_EYE_DEFAULT = 1;
export const KEEN_EYE_MAX = 2;

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
  return result;
}

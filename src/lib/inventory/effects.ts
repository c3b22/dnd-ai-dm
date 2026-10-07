import type { Slot } from './catalog';

/** Special item mechanics chosen in docs/magic-mechanics-draft.md (F5j0). Behaviour of each lands in later tasks. */
export const ITEM_EFFECT_IDS = ['crit_surge', 'lifesteal', 'keen_eye', 'ward', 'deep_pack', 'lucky_purse', 'quick_tempo'] as const;
export type ItemEffectId = (typeof ITEM_EFFECT_IDS)[number];

/** X9: bonus to every skill check when weapon, armor and accessory share a theme. */
export const SET_SKILL_BONUS = 1;

export interface EquippedEffectItem {
  slot: Slot;
  effect?: ItemEffectId;
  theme?: string;
}

/** Combined special effects of everything one character wears. */
export interface ItemEffects {
  /** Unique effects; the same effect on several worn items counts once. */
  effects: ItemEffectId[];
  /** Shared theme of a complete weapon + armor + accessory set, else null. */
  setTheme: string | null;
  /** Skill-check bonus granted by the set (0 without a complete set). */
  setSkillBonus: number;
}

export function aggregateEffects(equippedItems: EquippedEffectItem[]): ItemEffects {
  const effects = [...new Set(equippedItems.flatMap((i) => (i.effect ? [i.effect] : [])))];
  const themeOf = (slot: Slot) => equippedItems.find((i) => i.slot === slot)?.theme;
  const [w, a, c] = [themeOf('weapon'), themeOf('armor'), themeOf('accessory')];
  const setTheme = w && w === a && a === c ? w : null;
  return { effects, setTheme, setSkillBonus: setTheme ? SET_SKILL_BONUS : 0 };
}

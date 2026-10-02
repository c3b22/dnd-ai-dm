export const BASE_MAX_HP = 20;
/** max HP never drops below this, so nobody is stuck in a death spiral. */
export const MIN_MAX_HP = 10;
export const REVIVE_HP = 5;
/** The n-th revive since the last sanctuary costs n * this much max HP. */
export const REVIVE_MAX_HP_STEP = 2;
/** A whole-party wipe costs the revive price plus this. */
export const WIPE_EXTRA_MAX_HP_PENALTY = 2;

export interface DiceSpec {
  count: number;
  sides: number;
  bonus: number;
}

export const TIERS = {
  light: { count: 1, sides: 4, bonus: 0 },
  medium: { count: 1, sides: 6, bonus: 1 },
  heavy: { count: 2, sides: 6, bonus: 0 },
} as const satisfies Record<string, DiceSpec>;
export type Tier = keyof typeof TIERS;
/** Heals only: 'full' restores straight to max HP with no roll, for a paid rest/treatment. */
export type HealTier = Tier | 'full';

export const WEAPONS = {
  shortsword: { nameTh: 'ดาบสั้น', dice: { count: 1, sides: 8, bonus: 0 } },
  shortbow: { nameTh: 'ธนูสั้น', dice: { count: 1, sides: 6, bonus: 0 } },
  staff: { nameTh: 'ไม้เท้า', dice: { count: 1, sides: 4, bonus: 0 } },
  fists: { nameTh: 'มือเปล่า', dice: { count: 1, sides: 2, bonus: 0 } },
} as const satisfies Record<string, { nameTh: string; dice: DiceSpec }>;
export type WeaponId = keyof typeof WEAPONS;

export const STARTING_WEAPON_IDS = ['shortsword', 'shortbow', 'staff'] as const;
export const DEFAULT_WEAPON_ID: (typeof STARTING_WEAPON_IDS)[number] = 'shortsword';

function isWeaponId(id: unknown): id is WeaponId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

export function isStartingWeapon(id: unknown): id is (typeof STARTING_WEAPON_IDS)[number] {
  return typeof id === 'string' && (STARTING_WEAPON_IDS as readonly string[]).includes(id);
}

export function weaponFor(id: string | null | undefined): { id: WeaponId; nameTh: string; dice: DiceSpec } {
  const key: WeaponId = isWeaponId(id) ? id : 'fists';
  return { id: key, ...WEAPONS[key] };
}

export function diceLabel(spec: DiceSpec): string {
  return `${spec.count}d${spec.sides}${spec.bonus ? `+${spec.bonus}` : ''}`;
}

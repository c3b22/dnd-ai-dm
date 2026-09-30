import { WEAPONS, type DiceSpec } from '@/lib/character/constants';

export const CARRY_CAPACITY = 10;
export const MAX_STORY_UNITS = 5;
export const MAX_STORY_TITLE = 40;
export const STORY_ITEM_ID = 'story';

export type Slot = 'weapon' | 'armor';

export type CatalogEntry =
  | { kind: 'weapon'; nameTh: string; weight: number }
  | { kind: 'armor'; nameTh: string; weight: number; reduction: number }
  | { kind: 'consumable'; nameTh: string; weight: number; heal: DiceSpec };

// Weapon dice live in character/constants WEAPONS (single source of truth); ids match its keys.
export const CATALOG = {
  shortsword: { kind: 'weapon', nameTh: WEAPONS.shortsword.nameTh, weight: 2 },
  shortbow: { kind: 'weapon', nameTh: WEAPONS.shortbow.nameTh, weight: 2 },
  staff: { kind: 'weapon', nameTh: WEAPONS.staff.nameTh, weight: 2 },
  armor_light: { kind: 'armor', nameTh: 'เกราะหนัง', weight: 1, reduction: 1 },
  armor_medium: { kind: 'armor', nameTh: 'เกราะโซ่', weight: 2, reduction: 2 },
  armor_heavy: { kind: 'armor', nameTh: 'เกราะเหล็ก', weight: 3, reduction: 3 },
  potion_minor: { kind: 'consumable', nameTh: 'ยาฟื้นฟูเล็ก', weight: 1, heal: { count: 1, sides: 6, bonus: 1 } },
  potion_major: { kind: 'consumable', nameTh: 'ยาฟื้นฟูใหญ่', weight: 1, heal: { count: 2, sides: 6, bonus: 0 } },
} as const satisfies Record<string, CatalogEntry>;
export type CatalogId = keyof typeof CATALOG;

export function catalogEntry(id: string): CatalogEntry | null {
  return Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id as CatalogId] : null;
}

export function slotOf(entry: CatalogEntry): Slot | null {
  return entry.kind === 'consumable' ? null : entry.kind;
}

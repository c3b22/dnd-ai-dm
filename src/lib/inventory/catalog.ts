import { WEAPONS, type DiceSpec } from '@/lib/character/constants';
import type { SkillId } from '@/lib/character/classes';
import { MAGIC_ITEMS } from './magicItems';

export const CARRY_CAPACITY = 10;
export const MAX_STORY_UNITS = 5;
export const MAX_STORY_TITLE = 40;
export const STORY_ITEM_ID = 'story';

export type Slot = 'weapon' | 'armor' | 'accessory';
/** How many items of each slot one player can wear at once. Accessories: 1 (default, adjustable; the DB's one-per-slot unique index must change too if raised above 1). */
export const SLOT_LIMIT: Readonly<Record<Slot, number>> = { weapon: 1, armor: 1, accessory: 1 };
export const SLOTS = Object.keys(SLOT_LIMIT) as Slot[];

export type CatalogEntry =
  | { kind: 'weapon'; nameTh: string; weight: number }
  | { kind: 'armor'; nameTh: string; weight: number; reduction: number }
  | { kind: 'accessory'; nameTh: string; weight: number; skill: SkillId; skillBonus: number }
  | { kind: 'consumable'; nameTh: string; weight: number; heal: DiceSpec }
  | { kind: 'scroll'; nameTh: string; weight: number; pipReduction: number };

// Weapon dice live in character/constants WEAPONS (single source of truth); ids match its keys.
const BASE_CATALOG = {
  shortsword: { kind: 'weapon', nameTh: WEAPONS.shortsword.nameTh, weight: 2 },
  shortbow: { kind: 'weapon', nameTh: WEAPONS.shortbow.nameTh, weight: 2 },
  staff: { kind: 'weapon', nameTh: WEAPONS.staff.nameTh, weight: 2 },
  dagger: { kind: 'weapon', nameTh: WEAPONS.dagger.nameTh, weight: 1 },
  armor_light: { kind: 'armor', nameTh: 'เกราะหนัง', weight: 1, reduction: 1 },
  armor_medium: { kind: 'armor', nameTh: 'เกราะโซ่', weight: 2, reduction: 2 },
  armor_heavy: { kind: 'armor', nameTh: 'เกราะเหล็ก', weight: 3, reduction: 3 },
  potion_minor: { kind: 'consumable', nameTh: 'ยาฟื้นฟูเล็ก', weight: 1, heal: { count: 1, sides: 6, bonus: 1 } },
  potion_major: { kind: 'consumable', nameTh: 'ยาฟื้นฟูใหญ่', weight: 1, heal: { count: 2, sides: 6, bonus: 0 } },
} as const satisfies Record<string, CatalogEntry>;

/** Magic weapons / armor / healing potions generated from magicItems.ts (F5c). Accessories (F5d) and scrolls (F5e) included. Charms come later. */
const MAGIC_CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  MAGIC_ITEMS.flatMap((item): [string, CatalogEntry][] => {
    const m = item.mechanic;
    if (m.kind === 'weapon') return [[item.id, { kind: 'weapon', nameTh: item.nameTh, weight: item.weight }]];
    if (m.kind === 'armor') return [[item.id, { kind: 'armor', nameTh: item.nameTh, weight: item.weight, reduction: m.reduction }]];
    if (m.kind === 'accessory') return [[item.id, { kind: 'accessory', nameTh: item.nameTh, weight: item.weight, skill: m.skill, skillBonus: m.skillBonus }]];
    if (m.kind === 'consumable') return [[item.id, { kind: 'consumable', nameTh: item.nameTh, weight: item.weight, heal: m.heal }]];
    if (m.kind === 'scroll') return [[item.id, { kind: 'scroll', nameTh: item.nameTh, weight: item.weight, pipReduction: m.pipReduction }]];
    return [];
  })
);

export const CATALOG: Readonly<Record<string, CatalogEntry>> & typeof BASE_CATALOG = { ...MAGIC_CATALOG, ...BASE_CATALOG };
export type CatalogId = string;

export function catalogEntry(id: string): CatalogEntry | null {
  return Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id as CatalogId] : null;
}

export function slotOf(entry: CatalogEntry): Slot | null {
  return entry.kind === 'consumable' || entry.kind === 'scroll' ? null : entry.kind;
}

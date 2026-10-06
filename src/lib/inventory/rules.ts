import type { DiceSpec } from '@/lib/character/constants';
import type { SkillId } from '@/lib/character/classes';
import {
  CARRY_CAPACITY, MAX_STORY_TITLE, MAX_STORY_UNITS, SLOT_LIMIT, STORY_ITEM_ID, catalogEntry, slotOf, type Slot,
} from './catalog';
import type { InventoryItem } from './types';

const isStory = (item: { itemId: string }) => item.itemId === STORY_ITEM_ID;
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function itemLabel(item: { itemId: string; customName: string }): string {
  if (isStory(item)) return item.customName;
  return catalogEntry(item.itemId)?.nameTh ?? item.itemId;
}

export function weightOf(items: InventoryItem[]): number {
  return items.reduce((sum, i) => sum + (catalogEntry(i.itemId)?.weight ?? 0) * i.quantity, 0);
}

export type GiveResult = 'added' | 'full' | 'unknown';

export function giveItem(
  items: InventoryItem[],
  itemId: string,
  customName = ''
): { items: InventoryItem[]; result: GiveResult; label: string } {
  if (itemId === STORY_ITEM_ID) {
    const title = customName.trim().slice(0, MAX_STORY_TITLE);
    if (!title) return { items, result: 'unknown', label: '' };
    const units = items.filter(isStory).reduce((sum, i) => sum + i.quantity, 0);
    if (units >= MAX_STORY_UNITS) return { items, result: 'full', label: title };
    const existing = items.find((i) => isStory(i) && sameTitle(i.customName, title));
    if (existing) {
      return {
        items: items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i)),
        result: 'added',
        label: existing.customName,
      };
    }
    return {
      items: [...items, { itemId: STORY_ITEM_ID, customName: title, quantity: 1, slot: null, equipped: false }],
      result: 'added',
      label: title,
    };
  }

  const entry = catalogEntry(itemId);
  if (!entry) return { items, result: 'unknown', label: '' };
  if (weightOf(items) + entry.weight > CARRY_CAPACITY) return { items, result: 'full', label: entry.nameTh };

  const existing = items.find((i) => i.itemId === itemId);
  if (existing) {
    return {
      items: items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i)),
      result: 'added',
      label: entry.nameTh,
    };
  }
  const slot = slotOf(entry);
  // A player who finds their first sword or armor is not left with it in the backpack.
  const slotFree = slot !== null && !items.some((i) => i.equipped && i.slot === slot);
  return {
    items: [...items, { itemId, customName: '', quantity: 1, slot, equipped: slotFree }],
    result: 'added',
    label: entry.nameTh,
  };
}

export function takeItem(
  items: InventoryItem[],
  itemId: string,
  customName = ''
): { items: InventoryItem[]; taken: boolean; label: string } {
  // A story title is always stored truncated to MAX_STORY_TITLE; truncate the same way here so a
  // `take` that repeats the AI's original (untruncated) title still matches the stored row.
  const wanted = customName.trim().slice(0, MAX_STORY_TITLE);
  const row = items.find((i) => i.itemId === itemId && (itemId !== STORY_ITEM_ID || sameTitle(i.customName, wanted)));
  if (!row) return { items, taken: false, label: '' };
  const next =
    row.quantity > 1 ? items.map((i) => (i === row ? { ...i, quantity: i.quantity - 1 } : i)) : items.filter((i) => i !== row);
  return { items: next, taken: true, label: itemLabel(row) };
}

export function equipItem(items: InventoryItem[], itemId: string): { items: InventoryItem[]; ok: boolean } {
  const row = items.find((i) => i.itemId === itemId);
  if (!row || row.slot === null) return { items, ok: false };
  if (row.equipped) return { items, ok: true };
  // Wearing past the slot's limit swaps out the earliest-listed worn item(s) of that slot.
  const worn = items.filter((i) => i.slot === row.slot && i.equipped);
  const evict = new Set(worn.slice(0, Math.max(0, worn.length - (SLOT_LIMIT[row.slot] - 1))));
  return {
    items: items.map((i) => (i === row ? { ...i, equipped: true } : evict.has(i) ? { ...i, equipped: false } : i)),
    ok: true,
  };
}

export function unequipSlot(items: InventoryItem[], slot: Slot): InventoryItem[] {
  return items.map((i) => (i.slot === slot && i.equipped ? { ...i, equipped: false } : i));
}

export const equippedWeaponId = (items: InventoryItem[]): string | null =>
  items.find((i) => i.equipped && i.slot === 'weapon')?.itemId ?? null;

export const equippedArmorId = (items: InventoryItem[]): string | null =>
  items.find((i) => i.equipped && i.slot === 'armor')?.itemId ?? null;

export function armorReduction(items: InventoryItem[]): number {
  const id = equippedArmorId(items);
  const entry = id ? catalogEntry(id) : null;
  return entry?.kind === 'armor' ? entry.reduction : 0;
}

/** Check bonus per skill from worn accessories (F5d); empty when none are worn. */
export function equippedSkillBonuses(items: InventoryItem[]): Partial<Record<SkillId, number>> {
  const bonuses: Partial<Record<SkillId, number>> = {};
  for (const i of items) {
    if (!i.equipped || i.slot !== 'accessory') continue;
    const entry = catalogEntry(i.itemId);
    if (entry?.kind === 'accessory') bonuses[entry.skill] = (bonuses[entry.skill] ?? 0) + entry.skillBonus;
  }
  return bonuses;
}

/** Spends one scroll (F5e); null when it is not a scroll or the player does not have it. */
export function useScroll(
  items: InventoryItem[],
  itemId: string
): { items: InventoryItem[]; pipReduction: number; label: string } | null {
  const entry = catalogEntry(itemId);
  if (!entry || entry.kind !== 'scroll') return null;
  const taken = takeItem(items, itemId);
  return taken.taken ? { items: taken.items, pipReduction: entry.pipReduction, label: entry.nameTh } : null;
}

export function useConsumable(
  items: InventoryItem[],
  itemId: string
): { items: InventoryItem[]; heal: DiceSpec; label: string } | null {
  const entry = catalogEntry(itemId);
  if (!entry || entry.kind !== 'consumable') return null;
  const taken = takeItem(items, itemId);
  return taken.taken ? { items: taken.items, heal: entry.heal, label: entry.nameTh } : null;
}

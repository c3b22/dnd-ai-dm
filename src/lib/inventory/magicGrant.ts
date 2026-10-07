import type { MagicTagRarity, MagicTagType } from '@/lib/character/tags';
import { CATALOG } from './catalog';
import { MAGIC_ITEMS, type MagicItem } from './magicItems';

/** Legendaries a campaign may hand out in total. */
export const MAX_LEGENDARY_PER_CAMPAIGN = 1;

const KIND_FOR_TYPE: Record<MagicTagType, MagicItem['mechanic']['kind']> = {
  weapon: 'weapon', armor: 'armor', accessory: 'accessory', potion: 'consumable', scroll: 'scroll',
};

/** Items a [[magic]] tag may draw from: right rarity, right type (any when null), and actually in the catalog (charms are not yet). */
export function magicPool(rarity: MagicTagRarity, itemType: MagicTagType | null): MagicItem[] {
  return MAGIC_ITEMS.filter(
    (i) => i.rarity === rarity && i.id in CATALOG && (itemType === null || i.mechanic.kind === KIND_FOR_TYPE[itemType])
  );
}

export type MagicPick = { item: MagicItem } | { item: null; reason: 'legendary_limit' | 'empty_pool' };

/**
 * Server-side pick: a random item of the rarity/type this campaign has not been given yet; only when
 * every item of that pool was already given does it start repeating. At most one legendary per campaign.
 */
export function pickMagicItem(
  rarity: MagicTagRarity,
  itemType: MagicTagType | null,
  given: ReadonlySet<string>,
  rand: () => number = Math.random
): MagicPick {
  if (rarity === 'legendary') {
    const legendaries = MAGIC_ITEMS.filter((i) => i.rarity === 'legendary' && given.has(i.id)).length;
    if (legendaries >= MAX_LEGENDARY_PER_CAMPAIGN) return { item: null, reason: 'legendary_limit' };
  }
  const pool = magicPool(rarity, itemType);
  if (pool.length === 0) return { item: null, reason: 'empty_pool' };
  const fresh = pool.filter((i) => !given.has(i.id));
  const from = fresh.length > 0 ? fresh : pool;
  return { item: from[Math.min(from.length - 1, Math.floor(rand() * from.length))] };
}

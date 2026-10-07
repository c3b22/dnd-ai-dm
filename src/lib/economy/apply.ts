import { findByDisplayName } from '@/lib/character/names';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { LUCKY_PURSE_DEFAULT } from '@/lib/inventory/effects';
import { rollGold } from './gold';
import { buyPrice } from './prices';

export interface ShopState {
  name: string;
  itemIds: string[];
}

export type ShopAction = { action: 'open'; shop: ShopState } | { action: 'close' } | null;

const MAX_MERCHANT_NAME = 40;

export function applyEconomyTags(
  characters: Pick<Character, 'id' | 'displayName' | 'gold' | 'itemEffects'>[],
  tags: CharacterTag[],
  rollDie: (sides: number) => number
): { goldDeltas: Record<string, number>; changes: string[]; shop: ShopAction } {
  const deltas: Record<string, number> = {};
  const changes: string[] = [];
  let shop: ShopAction = null;

  for (const tag of tags) {
    if (tag.kind === 'shop') {
      const name = tag.merchant.trim().slice(0, MAX_MERCHANT_NAME);
      const itemIds = [...new Set(tag.itemIds)].filter((id) => buyPrice(id) !== null);
      if (name && itemIds.length > 0) shop = { action: 'open', shop: { name, itemIds } };
      continue;
    }
    if (tag.kind === 'shop_close') {
      shop = { action: 'close' };
      continue;
    }
    if (tag.kind !== 'gold' && tag.kind !== 'pay') continue;

    const target = findByDisplayName(characters, tag.name);
    if (!target) continue;
    let rolled = rollGold(tag.tier, rollDie);
    // X7 lucky_purse: bonus on gold-tag rewards only (not pay, sales or trades)
    if (tag.kind === 'gold' && target.itemEffects?.effects.includes('lucky_purse')) {
      rolled += target.itemEffects.luckyPurse ?? LUCKY_PURSE_DEFAULT;
    }
    const available = (target.gold ?? 0) + (deltas[target.id] ?? 0);

    if (tag.kind === 'gold') {
      deltas[target.id] = (deltas[target.id] ?? 0) + rolled;
      changes.push(`${target.displayName} ได้รับ ${rolled} ทอง`);
    } else {
      const paid = Math.min(rolled, available);
      if (paid <= 0) continue;
      deltas[target.id] = (deltas[target.id] ?? 0) - paid;
      changes.push(`${target.displayName} ${paid < rolled ? 'จ่ายเท่าที่มี' : 'เสียไป'} ${paid} ทอง`);
    }
  }
  return { goldDeltas: deltas, changes, shop };
}

import { WEAPONS, diceLabel } from '@/lib/character/constants';
import { skillLabel } from '@/lib/character/skillLabels';
import { buyPrice, sellPrice } from '@/lib/economy/prices';
import { catalogEntry, slotOf, STORY_ITEM_ID, type Slot } from './catalog';
import { magicInfo } from './magicDescribe';

export const KIND_TH = {
  weapon: 'อาวุธ',
  armor: 'เกราะ',
  accessory: 'เครื่องประดับ',
  consumable: 'ของใช้',
  scroll: 'ม้วนคาถา',
  charm: 'เครื่องรางฟื้นคืนชีพ',
  story: 'ไอเท็มเนื้อเรื่อง',
} as const;

export const SLOT_TH: Record<Slot, string> = { weapon: 'อาวุธ', armor: 'เกราะ', accessory: 'เครื่องประดับ' };

export interface ItemDescription {
  nameTh: string;
  kindTh: string;
  /** Null for story items: they only show a name (and the quantity, added by the caller). */
  weight: number | null;
  /** Thai stat lines (damage dice, damage reduction, heal amount, magic mechanic ...). */
  stats: string[];
  buyPrice: number | null;
  sellPrice: number | null;
  slotTh: string | null;
  magic: ReturnType<typeof magicInfo>;
}

/** O1: everything the tooltip shows for one item, assembled from the existing catalog / prices / magic sources. Null for an unknown id. */
export function describeItem(itemId: string, customName = ''): ItemDescription | null {
  if (itemId === STORY_ITEM_ID) {
    return { nameTh: customName, kindTh: KIND_TH.story, weight: null, stats: [], buyPrice: null, sellPrice: null, slotTh: null, magic: null };
  }
  const entry = catalogEntry(itemId);
  if (!entry) return null;
  const magic = magicInfo(itemId);
  const stats: string[] = [];
  switch (entry.kind) {
    case 'weapon': {
      const w = WEAPONS[itemId];
      if (w) stats.push(`ลูกเต๋าดาเมจ ${diceLabel(w.dice)}`);
      if (magic) stats.push(magic.effectTh);
      break;
    }
    case 'armor':
      stats.push(magic ? magic.effectTh : `ลดดาเมจที่ได้รับ ${entry.reduction}`);
      break;
    case 'consumable':
      stats.push(magic ? magic.effectTh : `ฟื้นฟู ${diceLabel(entry.heal)} HP`);
      break;
    case 'accessory':
      stats.push(magic ? magic.effectTh : `โบนัสทักษะ ${skillLabel(entry.skill)} +${entry.skillBonus}`);
      break;
    case 'scroll':
    case 'charm':
      if (magic) stats.push(magic.effectTh);
      break;
  }
  const slot = slotOf(entry);
  return {
    nameTh: entry.nameTh,
    kindTh: KIND_TH[entry.kind],
    weight: entry.weight,
    stats,
    buyPrice: buyPrice(itemId),
    sellPrice: sellPrice(itemId),
    slotTh: slot ? SLOT_TH[slot] : null,
    magic,
  };
}

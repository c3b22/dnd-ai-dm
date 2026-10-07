import { diceLabel } from '@/lib/character/constants';
import { skillLabel } from '@/lib/character/skillLabels';
import { MAGIC_ITEMS, MAGIC_RARITY_TH, type MagicItem, type MagicMechanic, type MagicRarity } from './magicItems';

const BY_ID: ReadonlyMap<string, MagicItem> = new Map(MAGIC_ITEMS.map((i) => [i.id, i]));

export function magicItemById(id: string): MagicItem | null {
  return BY_ID.get(id) ?? null;
}

/** One Thai line telling the player what the item does (bonus / damage reduction / effect). */
export function magicEffectTh(m: MagicMechanic): string {
  switch (m.kind) {
    case 'weapon':
      return `ดาเมจ +${m.damageBonus}`;
    case 'armor':
      return `ลดดาเมจที่ได้รับ ${m.reduction}`;
    case 'consumable':
      return `ฟื้นฟู ${diceLabel(m.heal)} HP`;
    case 'scroll':
      return `ใช้ใส่ศัตรู: ศัตรูเสีย ${m.pipReduction} pip`;
    case 'accessory':
      return `โบนัสทักษะ ${skillLabel(m.skill)} +${m.skillBonus}`;
    case 'charm':
      return `ฟื้นคืนชีพที่ HP ${m.reviveHp}`;
  }
}

export function magicInfo(id: string): { rarity: MagicRarity; rarityTh: string; effectTh: string; flavorTh: string } | null {
  const item = magicItemById(id);
  if (!item) return null;
  return { rarity: item.rarity, rarityTh: MAGIC_RARITY_TH[item.rarity], effectTh: magicEffectTh(item.mechanic), flavorTh: item.flavorTh };
}

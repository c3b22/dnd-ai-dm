import { diceLabel } from '@/lib/character/constants';
import { skillLabel } from '@/lib/character/skillLabels';
import { SET_SKILL_BONUS, type ItemEffectId, KEEN_EYE_DEFAULT, WARD_DEFAULT, DEEP_PACK_DEFAULT, LUCKY_PURSE_DEFAULT, QUICK_TEMPO_EXTRA } from './effects';
import { CRIT_SURGE_EXTRA_PIPS, LIFESTEAL_HEAL } from '@/lib/combat/constants';
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

/** F5j10: Thai description of what a special `effect` really does (matches the implemented behaviour). */
export function specialEffectTh(effect: ItemEffectId, value?: number): string {
  switch (effect) {
    case 'crit_surge':
      return `วิกฤตทวี: ทอยได้ 20 ธรรมชาติ ศัตรูเสีย pip เพิ่ม ${CRIT_SURGE_EXTRA_PIPS}`;
    case 'lifesteal':
      return `ดูดชีวิต: โจมตีโดนจนศัตรูเสีย pip ฟื้น ${LIFESTEAL_HEAL} HP (รอบละครั้ง)`;
    case 'keen_eye':
      return `ตาเหยี่ยว: โจมตีโดนง่ายขึ้น เกณฑ์ทอยลดลง ${value ?? KEEN_EYE_DEFAULT}`;
    case 'ward':
      return `โล่รับแรกกระแทก: โดนตีครั้งแรกของรอบลดดาเมจเพิ่ม ${value ?? WARD_DEFAULT}`;
    case 'deep_pack':
      return `กระเป๋าไร้ก้น: แบกของได้เพิ่ม ${value ?? DEEP_PACK_DEFAULT} น้ำหนัก`;
    case 'lucky_purse':
      return `ถุงเงินโชคดี: รางวัลทองทุกครั้งได้เพิ่ม ${value ?? LUCKY_PURSE_DEFAULT} ทอง`;
    case 'quick_tempo':
      return `จังหวะไว: ทุกรอบที่มีเหตุการณ์ คูลดาวน์ลดเพิ่ม ${QUICK_TEMPO_EXTRA} รอบ`;
  }
}

const SET_SLOTS: { slot: string; labelTh: string }[] = [
  { slot: 'weapon', labelTh: 'อาวุธ' },
  { slot: 'armor', labelTh: 'เกราะ' },
  { slot: 'accessory', labelTh: 'เครื่องประดับ' },
];

/** Set progress of `theme` among worn items: complete (all 3 slots same theme) or the missing slots. */
export function setStatusTh(theme: string, worn: { itemId: string; slot: string | null }[]): string {
  const has = (slot: string) => worn.some((w) => w.slot === slot && magicItemById(w.itemId)?.theme === theme);
  const missing = SET_SLOTS.filter((s) => !has(s.slot));
  if (missing.length === 0) return `ครบชุดธีม${theme} +${SET_SKILL_BONUS} ทุกการเช็ก`;
  return `ธีม${theme} ${SET_SLOTS.length - missing.length}/${SET_SLOTS.length} ขาด: ${missing.map((m) => m.labelTh).join(', ')}`;
}

export function magicInfo(id: string): {
  rarity: MagicRarity;
  rarityTh: string;
  effectTh: string;
  flavorTh: string;
  specialTh: string | null;
  theme: string | null;
} | null {
  const item = magicItemById(id);
  if (!item) return null;
  return {
    rarity: item.rarity,
    rarityTh: MAGIC_RARITY_TH[item.rarity],
    effectTh: magicEffectTh(item.mechanic),
    flavorTh: item.flavorTh,
    specialTh: item.effect ? specialEffectTh(item.effect, item.effectValue) : null,
    theme: item.theme ?? null,
  };
}

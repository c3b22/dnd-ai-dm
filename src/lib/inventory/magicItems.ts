import type { DiceSpec } from '@/lib/character/constants';
import type { SkillId } from '@/lib/character/classes';
import type { ItemEffectId } from './effects';

/**
 * Magic item catalogue (F5b). Pure data with 6 mechanic kinds only. Variety comes from names, numbers,
 * weight, which skill gets the bonus, and rarity. Not yet wired into CATALOG/PRICES/shop (later tasks).
 * Numbers follow docs/magic-items-draft.md (M1-M10): buy ~3x the ordinary weapon, sell back half rounded down;
 * legendaries carry a price only so the table is complete and are never sold in shops.
 */
export const MAGIC_RARITIES = ['uncommon', 'rare', 'legendary'] as const;
export type MagicRarity = (typeof MAGIC_RARITIES)[number];
export const MAGIC_RARITY_TH: Record<MagicRarity, string> = { uncommon: 'ไม่ธรรมดา', rare: 'หายาก', legendary: 'ตำนาน' };

export const MAGIC_MECHANIC_KINDS = ['weapon', 'armor', 'consumable', 'scroll', 'accessory', 'charm'] as const;
export type MagicWeaponId = 'shortsword' | 'shortbow' | 'staff' | 'dagger';

export type MagicMechanic =
  | { kind: 'weapon'; weaponId: MagicWeaponId; damageBonus: number }
  | { kind: 'armor'; reduction: number }
  | { kind: 'consumable'; heal: DiceSpec }
  | { kind: 'scroll'; pipReduction: number }
  | { kind: 'accessory'; skill: SkillId; skillBonus: number }
  | { kind: 'charm'; effect: 'revive'; reviveHp: number };

export interface MagicItem {
  id: string;
  nameTh: string;
  flavorTh: string;
  rarity: MagicRarity;
  weight: number;
  price: number;
  mechanic: MagicMechanic;
  /** Optional special mechanic (F5j0); at most one. */
  effect?: ItemEffectId;
  /** Optional strength of `effect` (e.g. keen_eye 1-2). */
  effectValue?: number;
  /** Optional set theme, e.g. 'เงา'; a matching weapon + armor + accessory gives the set bonus. */
  theme?: string;
}

export const magicSellPrice = (item: Pick<MagicItem, 'price'>): number => Math.floor(item.price / 2);
export const isSoldInShop = (item: Pick<MagicItem, 'rarity'>): boolean => item.rarity !== 'legendary';

type R = MagicRarity;
const U: R = 'uncommon';
const RA: R = 'rare';
const L: R = 'legendary';

// --- weapons: bonus +1/+2/+3 by rarity; price ~3x the ordinary weapon (sword/bow 30, dagger/staff 20) ---
const WEAPON_BONUS: Record<R, number> = { uncommon: 1, rare: 2, legendary: 3 };
const WEAPON_WEIGHT: Record<MagicWeaponId, number> = { shortsword: 2, shortbow: 2, staff: 2, dagger: 1 };
const WEAPON_PRICE: Record<MagicWeaponId, Record<R, number>> = {
  shortsword: { uncommon: 90, rare: 150, legendary: 350 },
  shortbow: { uncommon: 90, rare: 150, legendary: 350 },
  staff: { uncommon: 60, rare: 150, legendary: 350 },
  dagger: { uncommon: 60, rare: 150, legendary: 350 },
};
const weapon = (weaponId: MagicWeaponId, id: string, nameTh: string, rarity: R, flavorTh: string): MagicItem => ({
  id: `${weaponId}_${id}`, nameTh, flavorTh, rarity,
  weight: WEAPON_WEIGHT[weaponId], price: WEAPON_PRICE[weaponId][rarity],
  mechanic: { kind: 'weapon', weaponId, damageBonus: WEAPON_BONUS[rarity] },
});

// --- armor: reduction 2 (uncommon) / 3 (rare) / 4 (legendary), lighter than ordinary armor of that reduction ---
const ARMOR_REDUCTION: Record<R, number> = { uncommon: 2, rare: 3, legendary: 4 };
const ARMOR_PRICE: Record<R, number> = { uncommon: 75, rare: 160, legendary: 400 };
const armor = (id: string, nameTh: string, rarity: R, weight: number, flavorTh: string): MagicItem => ({
  id: `armor_${id}`, nameTh, flavorTh, rarity, weight,
  price: ARMOR_PRICE[rarity] + (rarity === 'rare' && weight === 1 ? 20 : 0),
  mechanic: { kind: 'armor', reduction: ARMOR_REDUCTION[rarity] },
});

// --- healing items ---
const potion = (id: string, nameTh: string, rarity: R, count: number, sides: number, bonus: number, price: number, flavorTh: string): MagicItem => ({
  id: `potion_${id}`, nameTh, flavorTh, rarity, weight: 1, price,
  mechanic: { kind: 'consumable', heal: { count, sides, bonus } },
});

// --- scrolls: remove 1 / 2 / 3 enemy pips by rarity (a boss at full pips keeps at least 1, existing rule) ---
const SCROLL_PIPS: Record<R, number> = { uncommon: 1, rare: 2, legendary: 3 };
const scroll = (id: string, nameTh: string, rarity: R, price: number, flavorTh: string): MagicItem => ({
  id: `scroll_${id}`, nameTh, flavorTh, rarity, weight: 1, price,
  mechanic: { kind: 'scroll', pipReduction: SCROLL_PIPS[rarity] },
});

// --- accessories: +1 (uncommon) / +2 (rare) on checks of one skill ---
const accessory = (id: string, nameTh: string, skill: SkillId, rarity: R, weight: number, flavorTh: string): MagicItem => ({
  id: `acc_${id}`, nameTh, flavorTh, rarity, weight, price: rarity === 'rare' ? 220 : 120,
  mechanic: { kind: 'accessory', skill, skillBonus: rarity === 'rare' ? 2 : 1 },
});

// --- one-use revive charms ---
const charm = (id: string, nameTh: string, reviveHp: number, price: number, flavorTh: string): MagicItem => ({
  id: `charm_${id}`, nameTh, flavorTh, rarity: L, weight: 0, price,
  mechanic: { kind: 'charm', effect: 'revive', reviveHp },
});

const BASE_MAGIC_ITEMS: readonly MagicItem[] = [
  // shortswords
  weapon('shortsword', 'dawn', 'ดาบสั้นยามเช้า', U, 'คมดาบสะท้อนแสงแรกของวันจนศัตรูตาพร่า'),
  weapon('shortsword', 'ember', 'ดาบสั้นถ่านแดง', U, 'ใบดาบอุ่นเหมือนถ่านที่ยังไม่มอดดับ'),
  weapon('shortsword', 'oakleaf', 'ดาบสั้นใบโอ๊ก', U, 'ด้ามดาบสลักลายใบโอ๊กที่ไม่เคยร่วงโรย'),
  weapon('shortsword', 'tide', 'ดาบสั้นน้ำขึ้น', U, 'ทุกครั้งที่ฟันจะมีเสียงคลื่นแว่วมาจากไกล'),
  weapon('shortsword', 'thornbite', 'ดาบสั้นหนามกัด', RA, 'ใบดาบหยักเป็นหนามคล้ายกุหลาบป่าที่ไม่ยอมปล่อยเหยื่อ'),
  weapon('shortsword', 'stormcall', 'ดาบสั้นเรียกพายุ', RA, 'เมื่อสะบัดดาบ อากาศรอบตัวจะหนักอึ้งด้วยกลิ่นฝน'),
  weapon('shortsword', 'nightsilver', 'ดาบสั้นเงินราตรี', RA, 'เหล็กเงินที่ตีใต้แสงจันทร์เต็มดวงตัดความมืดได้เหมือนผ้า'),
  weapon('shortsword', 'oathkeeper', 'ดาบสั้นผู้รักษาสัตย์', L, 'ว่ากันว่าไม่เคยมีใครที่ถือดาบเล่มนี้แล้วผิดคำสาบาน'),
  // shortbows
  weapon('shortbow', 'skyfeather', 'ธนูขนนกฟ้า', U, 'สายธนูร้อยด้วยขนนกสีฟ้าที่นำลูกศรไปตรงทาง'),
  weapon('shortbow', 'vine', 'ธนูเถาวัลย์', U, 'ไม้ธนูยังเลื้อยงอกใบอ่อนใหม่ทุกฤดูฝน'),
  weapon('shortbow', 'mist', 'ธนูหมอกเช้า', U, 'ลูกศรที่ปล่อยจากธนูนี้แทบไม่มีเสียงลม'),
  weapon('shortbow', 'dragonfly', 'ธนูแมลงปอ', U, 'ปีกบางใสสองข้างที่ปลายธนูสั่นไหวทุกครั้งที่เล็งเป้า'),
  weapon('shortbow', 'hawkeye', 'ธนูเนตรเหยี่ยว', RA, 'ผู้ถือจะเห็นเป้าหมายชัดเหมือนมองจากฟ้าสูง'),
  weapon('shortbow', 'galewind', 'ธนูลมกรด', RA, 'ลูกศรพุ่งแรงจนเสียงสายธนูดังก้องหุบเขา'),
  weapon('shortbow', 'meteor', 'ธนูดาวตก', RA, 'ลูกศรทิ้งแสงสว่างยาวเป็นทางเหมือนดาวร่วง'),
  weapon('shortbow', 'horizon', 'ธนูสุริยะสุดขอบฟ้า', L, 'ลูกศรทุกดอกของธนูนี้ไปถึงเป้าไม่ว่าไกลแค่ไหน'),
  // staves
  weapon('staff', 'whisperbamboo', 'ไม้เท้าไผ่กระซิบ', U, 'ลมที่ผ่านข้อไผ่ส่งเสียงกระซิบเตือนภัยเบาๆ'),
  weapon('staff', 'candle', 'ไม้เท้าเทียนหอม', U, 'ปลายไม้เท้ามีเปลวเทียนเล็กๆ ที่ไม่เคยดับ'),
  weapon('staff', 'mossy', 'ไม้เท้าตะไคร่น้ำ', U, 'ตะไคร่เขียวสดบนไม้เท้าชื้นอยู่เสมอแม้กลางทะเลทราย'),
  weapon('staff', 'lantern', 'ไม้เท้าโคมลอย', U, 'โคมกระดาษใบจิ๋วลอยวนอยู่เหนือปลายไม้เท้า'),
  weapon('staff', 'moonglass', 'ไม้เท้าแก้วจันทร์', RA, 'ลูกแก้วที่ปลายไม้เท้าสะสมแสงจันทร์ไว้ตลอดคืน'),
  weapon('staff', 'bodhiroot', 'ไม้เท้ารากโพธิ์', RA, 'รากไม้ศักดิ์สิทธิ์พันเกลียวเป็นด้ามที่อุ่นใจเสมอ'),
  weapon('staff', 'silverbell', 'ไม้เท้าระฆังเงิน', RA, 'เสียงระฆังเงินที่ปลายไม้เท้าขับไล่ความมืดมน'),
  weapon('staff', 'lifetree', 'ไม้เท้าต้นไม้แห่งชีวิต', L, 'กิ่งไม้จากต้นไม้ต้นแรกของโลกที่ยังผลิดอกได้ทุกยาม'),
  // daggers
  weapon('dagger', 'tamarind', 'กริชใบมะขาม', U, 'ใบกริชเรียวเล็กเหมือนใบมะขามอ่อนแต่คมกริบ'),
  weapon('dagger', 'rain', 'กริชสายฝน', U, 'ผิวโลหะเปียกชื้นเสมอ และไม่เคยลื่นหลุดจากมือ'),
  weapon('dagger', 'blackrat', 'กริชหนูดำ', U, 'โจรตรอกซอกซอยเชื่อว่ากริชนี้พาผู้ถือหนีรอดได้ทุกครั้ง'),
  weapon('dagger', 'needle', 'กริชเข็มเย็บผ้า', U, 'บางเฉียบเหมือนเข็มเย็บผ้าที่ช่างเงาตีไว้เป็นอาวุธ'),
  weapon('dagger', 'shadowsnake', 'กริชงูเงา', RA, 'ใบกริชคดเคี้ยวเหมือนงูที่เลื้อยในเงามืด'),
  weapon('dagger', 'batfang', 'กริชฟันค้างคาว', RA, 'แกะจากเขี้ยวค้างคาวยักษ์ที่ไม่เคยเห็นแสงอาทิตย์'),
  weapon('dagger', 'moonflick', 'กริชสะบัดจันทร์', RA, 'สะบัดครั้งเดียวเกิดเงาโค้งเหมือนจันทร์เสี้ยว'),
  weapon('dagger', 'eternalwhisper', 'กริชกระซิบนิรันดร์', L, 'ผู้ถูกแทงจะได้ยินเสียงกระซิบเพียงครั้งเดียวก่อนทุกอย่างเงียบสนิท'),

  // armor: 11 uncommon (reduction 2, weight 1), 8 rare (reduction 3, weight 1-2), 3 legendary (reduction 4, weight 2-3)
  armor('shadowhide', 'เกราะหนังเงา', U, 1, 'หนังเคลือบเงามืดช่วยกลืนแรงกระแทกได้ดีกว่าที่ตาเห็น'),
  armor('greywolf', 'เกราะหนังหมาป่าเทา', U, 1, 'หนังหมาป่าฝูงเก่าแก่ที่ยังอุ่นเหมือนมีลมหายใจ'),
  armor('fallenleaf', 'เกราะหนังใบไม้ร่วง', U, 1, 'ลวดลายใบไม้แห้งทำให้ผู้สวมกลมกลืนกับป่าฤดูใบไม้ร่วง'),
  armor('eelskin', 'เกราะหนังปลาไหล', U, 1, 'ผิวลื่นจนคมอาวุธไถลผ่านไปอย่างง่ายดาย'),
  armor('silklayers', 'เกราะผ้าไหมซ้อนชั้น', U, 1, 'ผ้าไหมสิบชั้นที่เย็บด้วยเข็มช่างทอแห่งตะวันออก'),
  armor('leopard', 'เกราะหนังเสือดาว', U, 1, 'จุดด่างบนหนังดูเหมือนขยับได้เมื่อแสงไฟส่ายไหว'),
  armor('campo', 'เกราะหนังพรางป่า', U, 1, 'เขียวขรึมเหมือนพุ่มไม้ จนนักล่าก็เกือบมองไม่เห็น'),
  armor('wyrmling', 'เกราะหนังเกล็ดมังกรน้อย', U, 1, 'เกล็ดมังกรตัวเล็กที่ผลัดทิ้งไว้ถักเป็นเกราะเบา'),
  armor('turtle', 'เกราะหนังกระดองเต่า', U, 1, 'แผ่นกระดองเต่าทะเลเย็บซ้อนทับกันเหมือนเกล็ด'),
  armor('indigo', 'เกราะหนังครามเข้ม', U, 1, 'ย้อมครามเก้ารอบจนสีไม่เคยซีดแม้ผ่านศึกมานับครั้งไม่ถ้วน'),
  armor('crane', 'เกราะหนังนกกระเรียน', U, 1, 'ขนนกกระเรียนสีขาวเรียงเป็นแนวรับเคียงไหล่ทั้งสองข้าง'),
  armor('mithril', 'เกราะโซ่มิธริล', RA, 2, 'ห่วงโซ่เส้นเล็กสุดแกร่งที่คนแคระตีขึ้นเป็นความลับของตระกูล'),
  armor('starfall', 'เกราะโซ่ดาวตก', RA, 2, 'ห่วงโลหะจากหินที่ตกจากฟ้าเย็นเฉียบแม้ในกองไฟ'),
  armor('fishscale', 'เกราะโซ่เกล็ดปลา', RA, 1, 'ห่วงเล็กเรียงซ้อนเหมือนเกล็ดปลาที่ไม่เคยเปียกน้ำ'),
  armor('frostwind', 'เกราะโซ่ลมหนาว', RA, 2, 'ไอเย็นเบาบางรอบตัวผู้สวมทำให้ศัตรูลังเลก่อนฟัน'),
  armor('verdigris', 'เกราะโซ่ทองแดงเขียว', RA, 2, 'สนิมสีเขียวสวยงามที่กลับทำให้เกราะแข็งแกร่งขึ้นทุกวัน'),
  armor('fogmail', 'เกราะโซ่หมอกควัน', RA, 1, 'ห่วงโซ่เบาจนเหมือนสวมหมอกไว้รอบตัว'),
  armor('dewdrop', 'เกราะโซ่หยาดน้ำค้าง', RA, 1, 'หยดน้ำค้างบนห่วงโซ่ไม่เคยแห้งแม้ใต้แดดจัด'),
  armor('gatewarden', 'เกราะโซ่ผู้พิทักษ์ประตู', RA, 2, 'เกราะของทหารยามที่ยืนเฝ้าประตูเมืองมาพันปีโดยไม่เคยล้ม'),
  armor('hero', 'เกราะวีรบุรุษ', L, 3, 'เกราะที่ผู้กล้าทุกยุคส่งต่อกันมา และไม่เคยปล่อยให้เจ้าของล้มลงง่ายๆ'),
  armor('golddrake', 'เกราะมังกรทอง', L, 2, 'เกล็ดทองของมังกรผู้เฝ้าขุมทรัพย์ที่ไม่มีอาวุธใดเจาะทะลุได้'),
  armor('eternalstar', 'เกราะแห่งดวงดาวนิรันดร์', L, 2, 'แสงดาวเก่าแก่ห่อหุ้มผู้สวมเหมือนผืนฟ้าที่ไม่มีใครแตะต้องได้'),

  // healing items: 6 uncommon, 5 rare, 1 legendary
  potion('wildhoney', 'ยาน้ำผึ้งป่า', U, 1, 8, 1, 30, 'หวานละมุนลิ้นและอุ่นไปถึงปลายนิ้วเมื่อกลืนลงคอ'),
  potion('gingertea', 'ยาชาขิงอุ่น', U, 2, 4, 0, 30, 'ไอร้อนจากชาขิงไล่ความเจ็บปวดออกไปทีละน้อย'),
  potion('morning', 'ยาสมุนไพรเช้า', U, 1, 6, 2, 30, 'สมุนไพรเก็บตอนฟ้าสางมีฤทธิ์สดชื่นกว่าปกติ'),
  potion('dewdrop', 'ยาหยดน้ำค้าง', U, 1, 10, 0, 35, 'เพียงสามหยดก็รู้สึกเหมือนตื่นจากหลับยาว'),
  potion('jasmine', 'ยากลิ่นมะลิ', U, 1, 12, 0, 35, 'กลิ่นมะลิหอมเย็นช่วยให้หายใจโล่งและแผลหยุดแสบ'),
  potion('coconut', 'ยาน้ำมะพร้าวเสก', U, 2, 4, 1, 40, 'น้ำมะพร้าวที่นักบวชชราเสกไว้ใต้แสงจันทร์'),
  potion('redflame', 'ยาแดงเพลิง', RA, 2, 6, 2, 70, 'แดงเหมือนถ่านไฟแต่ดื่มแล้วให้ความอุ่นสบายไปทั่วตัว'),
  potion('dragonblood', 'ยาเลือดมังกร', RA, 3, 4, 1, 75, 'รสเผ็ดร้อนที่ปลุกร่างกายที่อ่อนล้าให้ฮึกเหิม'),
  potion('mermaidtear', 'ยาน้ำตาเงือก', RA, 2, 8, 0, 80, 'ใสเหมือนไข่มุกเหลว และเย็นสนิทลึกถึงกระดูก'),
  potion('goldbodhi', 'ยาใบโพธิ์ทอง', RA, 4, 4, 0, 85, 'ต้มจากใบโพธิ์ทองคำที่ร่วงแค่ปีละครั้ง'),
  potion('stream', 'ยาสายธารฟื้นฟู', RA, 3, 6, 0, 90, 'น้ำจากต้นธารศักดิ์สิทธิ์ที่แผลเก่าแก่ก็หายสนิท'),
  potion('ambrosia', 'ยาน้ำอมฤต', L, 4, 8, 4, 220, 'หยดเดียวจากน้ำอมฤตก็ดึงคนใกล้ตายกลับมาลืมตาได้'),

  // scrolls: 5 uncommon (1 pip), 6 rare (2 pips), 1 legendary (3 pips)
  scroll('spark', 'ม้วนคัมภีร์ประกายไฟ', U, 35, 'ตัวอักษรบนม้วนร้อนผ่าวและแตกเป็นประกายเมื่ออ่านออกเสียง'),
  scroll('cuttingwind', 'ม้วนคัมภีร์สายลมบาด', U, 35, 'ลมที่หลุดจากม้วนกระดาษคมเหมือนใบมีดบาง'),
  scroll('frostdew', 'ม้วนคัมภีร์น้ำค้างแข็ง', U, 40, 'เมื่อคลี่ม้วนออก อากาศรอบตัวเย็นจนหายใจเป็นไอ'),
  scroll('thunderclap', 'ม้วนคัมภีร์เสียงฟ้าร้อง', U, 40, 'อ่านจบประโยคแรกก็ได้ยินเสียงฟ้าคำรามจากในกระดาษ'),
  scroll('thornvine', 'ม้วนคัมภีร์หนามเถาวัลย์', U, 45, 'เถาหนามงอกจากรอยหมึกพันขาศัตรูไว้แน่น'),
  scroll('flame', 'ม้วนคัมภีร์เปลวไฟ', RA, 70, 'เมื่อฉีกม้วนนี้ เปลวไฟจะพุ่งใส่เป้าหมายโดยไม่ต้องเล็ง'),
  scroll('lightning', 'ม้วนคัมภีร์สายฟ้าฟาด', RA, 75, 'สายฟ้าแลบจากกระดาษและตรงเข้าหาศัตรูที่ใกล้ที่สุด'),
  scroll('icespear', 'ม้วนคัมภีร์หอกน้ำแข็ง', RA, 80, 'หอกน้ำแข็งเสียบทะลุเกราะราวกับไม่มีอะไรขวางกั้น'),
  scroll('whirlwind', 'ม้วนคัมภีร์ลมพายุหมุน', RA, 85, 'พายุจิ๋วหมุนจากม้วนกระดาษและเหวี่ยงศัตรูกระเด็น'),
  scroll('boulder', 'ม้วนคัมภีร์ศิลากระแทก', RA, 90, 'หินก้อนใหญ่ปรากฏขึ้นกลางอากาศแล้วตกใส่เป้าหมาย'),
  scroll('shadowbind', 'ม้วนคัมภีร์เงาตรึงขา', RA, 90, 'เงาของศัตรูลุกขึ้นมาตรึงขาตัวเองไว้กับพื้น'),
  scroll('starfall', 'ม้วนคัมภีร์ดาวตกทลาย', L, 200, 'เสียงอ่านครั้งเดียวเรียกดาวตกลูกหนึ่งลงมาถล่มสนามรบ'),

  // accessories: each of the 18 skills at least once, plus 6 extras (5 rare +2, the rest uncommon +1)
  accessory('acrobat', 'แหวนนักกายกรรม', 'acrobatics', U, 0, 'วงแหวนนี้ทำให้นิ้วมือและข้อเท้ารู้สึกเบาเหมือนขนนก'),
  accessory('wolffang', 'สร้อยเขี้ยวสุนัขป่า', 'animal_handling', U, 0, 'สัตว์ป่าจะหยุดคำรามเมื่อได้กลิ่นเขี้ยวที่ห้อยอยู่ที่คอ'),
  accessory('crystalear', 'ต่างหูผลึกอาคม', 'arcana', U, 0, 'ผลึกสั่นเบาๆ เมื่ออยู่ใกล้พลังเวทมนตร์'),
  accessory('fightband', 'สายรัดแขนนักสู้', 'athletics', U, 0, 'ผ้าสีซีดที่เคยผูกแขนแชมป์สังเวียนมาแล้วสิบสมัย'),
  accessory('grinmask', 'หน้ากากยิ้มเจ้าเล่ห์', 'deception', U, 0, 'รอยยิ้มบนหน้ากากทำให้คำโกหกฟังเป็นความจริง'),
  accessory('sandglass', 'จี้นาฬิกาทรายโบราณ', 'history', U, 0, 'ทรายในจี้ไหลเวียนอยู่และกระซิบเรื่องราวในอดีต'),
  accessory('truthring', 'แหวนตาแห่งความจริง', 'insight', U, 0, 'ดวงตาเล็กบนแหวนกะพริบเมื่อมีคนพูดไม่ตรงกับใจ'),
  accessory('skullring', 'แหวนกะโหลกเงิน', 'intimidation', U, 0, 'เพียงยื่นมือออกไป คู่สนทนาก็เริ่มเหงื่อตก'),
  accessory('glass', 'แว่นขยายทองเหลือง', 'investigation', U, 1, 'เลนส์เก่าที่เผยรอยเล็กๆ ที่คนอื่นมองข้ามไป'),
  accessory('herbbracelet', 'กำไลสมุนไพรร้อย', 'medicine', U, 0, 'กลิ่นสมุนไพรบนกำไลช่วยให้นึกวิธีรักษาออกทันที'),
  accessory('evergreen', 'สร้อยใบไม้ไม่เหี่ยว', 'nature', U, 0, 'ใบไม้สดที่ห้อยอยู่ไม่เคยเหี่ยวแม้ผ่านมาหลายปี'),
  accessory('scout', 'แหวนนักสำรวจ', 'perception', U, 0, 'สวมแล้วรายละเอียดรอบตัวชัดเจนขึ้นเหมือนเพ่งมอง'),
  accessory('goldlyre', 'จี้พิณทองจิ๋ว', 'performance', U, 0, 'พิณจิ๋วที่ดีดเองได้เบาๆ เมื่อผู้สวมเริ่มร้องเพลง'),
  accessory('silverbrooch', 'เข็มกลัดลิ้นทอง', 'persuasion', U, 0, 'ถ้อยคำของผู้สวมฟังนุ่มหูจนน่าเชื่อถือ'),
  accessory('prayerbeads', 'สร้อยลูกประคำเงิน', 'religion', U, 0, 'ลูกประคำอุ่นขึ้นเมื่อสวดมนต์ในสถานที่ศักดิ์สิทธิ์'),
  accessory('nimblegloves', 'ถุงมือนิ้วว่องไว', 'sleight_of_hand', U, 0, 'นิ้วมือเคลื่อนไหวเร็วจนคนมองไม่ทัน'),
  accessory('silentshawl', 'ผ้าคลุมไหล่เงียบเชียบ', 'stealth', U, 1, 'ผ้าที่กลืนเสียงฝีเท้าและเงาไปด้วยกัน'),
  accessory('wandercompass', 'เข็มทิศพเนจร', 'survival', U, 0, 'เข็มชี้ทางไปยังที่พักและน้ำสะอาดแทนทิศเหนือ'),
  accessory('nightfalcon', 'ต่างหูเหยี่ยวราตรี', 'perception', RA, 0, 'ได้ยินเสียงแม้เบาที่สุดเหมือนมีเหยี่ยวกลางคืนกระซิบข้างหู'),
  accessory('soundlessanklet', 'กำไลข้อเท้าไร้เสียง', 'stealth', RA, 0, 'ก้าวไปไหนก็ไม่เหลือแม้แต่รอยฝุ่น'),
  accessory('envoyring', 'แหวนราชทูต', 'persuasion', RA, 0, 'ตราประทับของราชสำนักทำให้ทุกคนฟังจนจบประโยค'),
  accessory('giantbelt', 'เข็มขัดยักษ์', 'athletics', RA, 1, 'หัวเข็มขัดหนักอึ้งแต่ทำให้แขนขาเต็มไปด้วยแรง'),
  accessory('thirdeye', 'จี้ตาที่สาม', 'arcana', RA, 0, 'ลูกตาแก้วที่เปิดขึ้นเองเมื่อเวทมนตร์ปรากฏ'),
  accessory('calmtassel', 'พู่ห้อยจิตสงบ', 'insight', U, 0, 'ความสงบจากพู่ห้อยช่วยให้อ่านใจคนได้ละเอียดขึ้น'),

  // revive charms (legendary, never in shops)
  charm('revive', 'เครื่องรางคืนชีพ', 1, 500, 'เมื่อลมหายใจสุดท้ายจะหลุดไป เครื่องรางจะแตกสลายและดึงผู้สวมกลับมา'),
  charm('phoenix', 'ขนนกฟีนิกซ์', 2, 550, 'ขนนกสีเพลิงที่จะลุกไหม้แทนเจ้าของหนึ่งครั้ง'),
  charm('twinheart', 'ลูกปัดหัวใจสอง', 2, 600, 'ลูกปัดที่เต้นเป็นจังหวะเดียวกับหัวใจดวงที่สองซึ่งสำรองไว้'),
  charm('crossing', 'เหรียญข้ามฝั่ง', 3, 700, 'เหรียญที่ใช้ซื้อทางกลับจากฝั่งตรงข้ามของความตาย'),
];

/**
 * F5j9: special effects. Rules: uncommon = no effect; rare = one small effect (X2 lifesteal, X3 keen_eye, X7 lucky_purse,
 * X8 quick_tempo); legendary = one main effect. Each effect only on the slots the draft allows (crit_surge/lifesteal: weapon,
 * ward: armor, keen_eye: weapon or accessory, deep_pack/lucky_purse/quick_tempo: accessory). Rare armor, potions and scrolls
 * get none because no small effect is allowed on armor. Every rare weapon and accessory carries one: lifesteal on the
 * "biting/draining/holy" ones, keen_eye on bows and sharp-sight pieces (value 2 only on hawkeye), the rest on accessories.
 * KNOWN GAP: deep_pack (X6) should sit on a legendary accessory, but the catalogue has none (accessories are uncommon/rare only,
 * charms have no slot) and adding items is out of scope here, so no item carries deep_pack yet.
 */
const EFFECTS: Readonly<Record<string, { effect: ItemEffectId; effectValue?: number }>> = {
  // rare weapons: lifesteal (X2)
  shortsword_thornbite: { effect: 'lifesteal' }, dagger_batfang: { effect: 'lifesteal' }, staff_bodhiroot: { effect: 'lifesteal' },
  shortsword_nightsilver: { effect: 'lifesteal' }, dagger_shadowsnake: { effect: 'lifesteal' }, staff_silverbell: { effect: 'lifesteal' },
  // rare weapons + rare accessory: keen_eye (X3)
  shortbow_hawkeye: { effect: 'keen_eye', effectValue: 2 }, shortbow_galewind: { effect: 'keen_eye', effectValue: 1 },
  shortbow_meteor: { effect: 'keen_eye', effectValue: 1 }, shortsword_stormcall: { effect: 'keen_eye', effectValue: 1 },
  dagger_moonflick: { effect: 'keen_eye', effectValue: 1 }, staff_moonglass: { effect: 'keen_eye', effectValue: 1 },
  acc_nightfalcon: { effect: 'keen_eye', effectValue: 1 },
  // rare accessories: lucky_purse (X7) / quick_tempo (X8)
  acc_envoyring: { effect: 'lucky_purse', effectValue: 2 }, acc_soundlessanklet: { effect: 'lucky_purse', effectValue: 2 },
  acc_thirdeye: { effect: 'quick_tempo' }, acc_giantbelt: { effect: 'quick_tempo' },
  // legendary weapons: crit_surge (X1)
  shortsword_oathkeeper: { effect: 'crit_surge' }, shortbow_horizon: { effect: 'crit_surge' },
  staff_lifetree: { effect: 'crit_surge' }, dagger_eternalwhisper: { effect: 'crit_surge' },
  // legendary armor: ward (X4), the heaviest/most defensive pieces get 3
  armor_hero: { effect: 'ward', effectValue: 2 }, armor_golddrake: { effect: 'ward', effectValue: 3 }, armor_eternalstar: { effect: 'ward', effectValue: 3 },
};

/**
 * F5j9: themes for X9 (matching weapon + armor + accessory = +1 on every skill check). 9 themes, each with at least one full
 * 3-slot set (first three ids of each entry); extra pieces let players mix and collect. Themes may sit on any rarity.
 */
const THEME_SETS: Readonly<Record<string, readonly string[]>> = {
  'เงา': ['dagger_shadowsnake', 'armor_shadowhide', 'acc_silentshawl', 'dagger_blackrat', 'dagger_batfang', 'acc_grinmask'],
  'ป่า': ['shortbow_vine', 'armor_campo', 'acc_evergreen', 'staff_mossy', 'armor_fallenleaf', 'acc_wolffang'],
  'จันทรา': ['shortsword_nightsilver', 'armor_indigo', 'acc_nightfalcon', 'dagger_moonflick', 'staff_moonglass'],
  'ผู้พิทักษ์': ['shortsword_oathkeeper', 'armor_gatewarden', 'acc_truthring', 'armor_hero', 'acc_fightband'],
  'พายุ': ['shortbow_galewind', 'armor_frostwind', 'acc_wandercompass', 'shortsword_stormcall', 'acc_giantbelt'],
  'มังกร': ['shortsword_ember', 'armor_wyrmling', 'acc_skullring', 'armor_golddrake', 'dagger_rain'],
  'ดวงดาว': ['shortbow_meteor', 'armor_starfall', 'acc_thirdeye', 'armor_eternalstar', 'acc_crystalear'],
  'ศักดิ์สิทธิ์': ['staff_bodhiroot', 'armor_crane', 'acc_prayerbeads', 'staff_silverbell', 'staff_lifetree'],
  'มิธริล': ['dagger_needle', 'armor_mithril', 'acc_silverbrooch', 'armor_fishscale', 'acc_envoyring'],
};
const THEME_OF: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(THEME_SETS).flatMap(([theme, ids]) => ids.map((id) => [id, theme] as const))
);

export const MAGIC_ITEMS: readonly MagicItem[] = BASE_MAGIC_ITEMS.map((item) => {
  const fx = EFFECTS[item.id];
  const theme = THEME_OF[item.id];
  return { ...item, ...(fx ?? {}), ...(theme ? { theme } : {}) };
});

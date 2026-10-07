// Generates docs/magic-items-list.md (Thai table) from src/lib/inventory/magicItems.ts.
// Run: node --experimental-strip-types scripts/generate-magic-items-doc.mjs   (Node >= 22.6)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAGIC_ITEMS, MAGIC_RARITY_TH, magicSellPrice, isSoldInShop } from '../src/lib/inventory/magicItems.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_TH = {
  acrobatics: 'กายกรรม', animal_handling: 'ควบคุมสัตว์', arcana: 'เวทมนตร์ศาสตร์', athletics: 'กรีฑา',
  deception: 'หลอกลวง', history: 'ประวัติศาสตร์', insight: 'หยั่งรู้ใจ', intimidation: 'ข่มขู่',
  investigation: 'สืบสวน', medicine: 'การแพทย์', nature: 'ธรรมชาติ', perception: 'การรับรู้',
  performance: 'การแสดง', persuasion: 'โน้มน้าว', religion: 'ศาสนา', sleight_of_hand: 'มือไว',
  stealth: 'ซ่อนตัว', survival: 'เอาตัวรอด',
};
const WEAPON_TH = { shortsword: 'ดาบสั้น', shortbow: 'ธนู', staff: 'ไม้เท้า', dagger: 'กริช' };
const KIND_TH = {
  weapon: 'อาวุธ', armor: 'เกราะ', consumable: 'ของใช้ฟื้น HP', scroll: 'ม้วนคัมภีร์',
  accessory: 'เครื่องประดับ', charm: 'เครื่องรางใช้ครั้งเดียว',
};
const dice = (d) => `${d.count}d${d.sides}${d.bonus ? `+${d.bonus}` : ''}`;
const effect = (m) => {
  switch (m.kind) {
    case 'weapon': return `${WEAPON_TH[m.weaponId]} ดาเมจ +${m.damageBonus}`;
    case 'armor': return `ลดดาเมจ ${m.reduction}`;
    case 'consumable': return `ฟื้น HP ${dice(m.heal)}`;
    case 'scroll': return `ใช้ครั้งเดียว ลด pip ศัตรู ${m.pipReduction}`;
    case 'accessory': return `เช็ก${SKILL_TH[m.skill] ?? m.skill} +${m.skillBonus}`;
    case 'charm': return `ใช้ครั้งเดียว คืนชีพที่ ${m.reviveHp} HP`;
  }
};

const esc = (s) => s.replace(/\|/g, '\|');
const out = [];
out.push('# รายการไอเท็มวิเศษ (F5b)', '');
out.push('ไฟล์นี้สร้างอัตโนมัติจาก `src/lib/inventory/magicItems.ts` ด้วย `scripts/generate-magic-items-doc.mjs` ห้ามแก้ด้วยมือ ให้แก้ข้อมูลแล้วรันสคริปต์ใหม่', '');
out.push(`รวม ${MAGIC_ITEMS.length} ชิ้น · ขายคืน = ราคาซื้อหารสองปัดลง · ตำนานไม่วางขายในร้าน (ราคาใส่ไว้ให้ตารางครบ)`, '');

const rarities = ['uncommon', 'rare', 'legendary'];
out.push('## สรุป', '', '| หมวด | จำนวน | ไม่ธรรมดา | หายาก | ตำนาน |', '|---|---|---|---|---|');
for (const kind of Object.keys(KIND_TH)) {
  const items = MAGIC_ITEMS.filter((i) => i.mechanic.kind === kind);
  out.push(`| ${KIND_TH[kind]} | ${items.length} | ${rarities.map((r) => items.filter((i) => i.rarity === r).length).join(' | ')} |`);
}
out.push(`| **รวม** | **${MAGIC_ITEMS.length}** | ${rarities.map((r) => MAGIC_ITEMS.filter((i) => i.rarity === r).length).join(' | ')} |`, '');

for (const kind of Object.keys(KIND_TH)) {
  const items = MAGIC_ITEMS.filter((i) => i.mechanic.kind === kind);
  out.push(`## ${KIND_TH[kind]} (${items.length})`, '');
  out.push('| id | ชื่อ | ผล | ความหายาก | น้ำหนัก | ซื้อ / ขายคืน | ขายในร้าน | คำบรรยาย |', '|---|---|---|---|---|---|---|---|');
  for (const i of items) {
    out.push(`| \`${i.id}\` | ${esc(i.nameTh)} | ${effect(i.mechanic)} | ${MAGIC_RARITY_TH[i.rarity]} | ${i.weight} | ${i.price} / ${magicSellPrice(i)} | ${isSoldInShop(i) ? 'ได้' : 'ไม่ขาย'} | ${esc(i.flavorTh)} |`);
  }
  out.push('');
}

const target = resolve(root, 'docs', 'magic-items-list.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out.join('\n'), 'utf8');
console.log(`wrote ${target} (${MAGIC_ITEMS.length} items)`);

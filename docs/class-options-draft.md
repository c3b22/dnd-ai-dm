# ร่างทางเลือกของตัวละคร (K1): นักเวท, เวท 12 บท, subclass, ท่าที่ 2 และ 3

เอกสารร่างสำหรับงาน K2–K7 ใน [auto-tasks.md](auto-tasks.md) ผู้ใช้ให้ AI ออกแบบเองแล้วทำต่อเลย ตัวเลขทุกตัวเป็นค่าเริ่มต้นที่ยังไม่เคยเล่นจริง ให้ไปอยู่ในไฟล์ constants ไฟล์เดียวต่อกลุ่ม (ดูหัวข้อ 9) เพื่อจูนทีหลังด้วย `simulateFight` (I5) ได้

ชื่อ id, ชื่อค่าคงที่ และตัวเลขในเอกสารนี้อ้างอิงโค้ดจริงบน `auto/tasks`: `classes.ts` (`CLASSES`, `proficiencyBonus`), `applyAbilities.ts`, `check.ts` (`resolveCheck`), `combat/constants.ts`, `combat/attack.ts`, `combat/encounter.ts`, `inventory/magicItems.ts`, `rest.ts`

## 1. กติกากลางที่ทุกรายการใช้ร่วมกัน

### 1.1 เครื่องมือที่ server มีอยู่แล้ว (ใช้ตามนี้ ไม่ต้องคิดกลไกใหม่)

| เครื่องมือ | ของจริงในโค้ด | ใช้อย่างไรในเอกสารนี้ |
|---|---|---|
| หัก pip | `damageEnemy(target, pips)` (boss ที่ pip เต็มถูกตีให้เหลือไม่ต่ำกว่า 1 ในครั้งเดียว) pip เริ่มต้น: minion 1, normal 2, strong 3, boss 5 | "−N pip" |
| ทอยโจมตีเทียบ AC ศัตรู | `resolveAttack`: d20 + mod + proficiency + magic เทียบ `HIT_THRESHOLD` (minion 11, normal 13, strong 15, boss 17) + `traitAcBonus` (armored +2, nimble +1) − `keen_eye` nat 1 พลาดเสมอ nat 20 โดนเสมอ (คริ) | "ทอยโจมตี" ของเวทและท่า (เรียกว่า **attack roll**) ผลคริคือ pip +1 จากค่าปกติ (เว้นแต่ระบุไว้) |
| ศัตรูทอย save เทียบ DC | **ใหม่ แต่เล็ก:** `rollEnemySave(tier, dc, d20)` = d20 + `ENEMY_SAVE_BONUS[tier]` เทียบ DC, nat 20 ผ่านเสมอ, nat 1 ไม่ผ่านเสมอ (ตรงข้ามกับการโจมตีของศัตรู) | "save" |
| โบนัส save ตาม tier | **ใหม่:** `ENEMY_SAVE_BONUS = { minion: 0, normal: 2, strong: 4, boss: 6 }` (ไล่ตาม `ENEMY_ATTACK_BONUS` ที่ 3/4/5/7 แต่ต่ำกว่าเล็กน้อย เพราะ DC เริ่มที่ 12) | |
| heal tier | `TIERS`: light 1d4, medium 1d6+1, heavy 2d6 (นักบวช: medium ก่อน Lv5, heavy ตั้งแต่ Lv5 ตาม `clericHealTier`) | "heal tier" |
| ผลชั่วคราว 1 รอบ | **ใหม่ ไม่เก็บลง DB:** `RoundEffects` สร้างใหม่ทุกรอบจากสิ่งที่ผู้เล่นเลือก แล้วทิ้งเมื่อจบรอบ (ดูหัวข้อ 1.3) | AC +n, advantage, ward, ศัตรูมึน ฯลฯ |
| ward | `takeWard` ใน `inventory/effects.ts`: ลดดาเมจของ **การโดนครั้งแรก** ของรอบ (ขั้นต่ำ `MIN_ENEMY_DAMAGE` = 1) | "กำบัง n" |

### 1.2 ตารางอ้างอิงตามเลเวล (ค่าที่ใช้คำนวณ DC และโบนัสโจมตี)

`proficiencyBonus(level)` = +2 (Lv1–4), +3 (Lv5–8), +4 (Lv9–10) ตัวเลขสูงสุดของเกมคือ Lv10 (`MAX_LEVEL`) HP สูงสุด = 20 + 5 × (เลเวล − 1) (`BASE_MAX_HP`, `HP_PER_LEVEL`)

สมมติว่าผู้เล่นเอาแต้ม ability ที่ Lv4 และ Lv8 (+2 ต่อครั้ง ตาม `ABILITY_CHOICE_LEVELS`) ลงค่าหลักของ class เหมือนที่ `docs/combat-balance.md` สมมติ: ค่าหลักเริ่มต้น 15 → 17 (Lv4) → 19 (Lv8) โค้ดต้องคำนวณจากค่า ability จริงของตัวละคร ไม่ใช่ตารางนี้ (ตารางมีไว้ให้เห็นขนาด)

| เลเวล | prof | mod ค่าหลัก | save DC = 8 + prof + mod | โบนัสโจมตีเวท/ท่า = prof + mod | spell slot นักเวท | ยิงแสงเวทพุ่ง (ลูก) |
|---|---|---|---|---|---|---|
| 1 | +2 | +2 | 12 | +4 | 2 | 1 |
| 2 | +2 | +2 | 12 | +4 | 2 | 1 |
| 3 | +2 | +2 | 12 | +4 | 3 | 1 |
| 4 | +2 | +3 | 13 | +5 | 3 | 1 |
| 5 | +3 | +3 | 14 | +6 | 4 | 2 |
| 6 | +3 | +3 | 14 | +6 | 4 | 2 |
| 7 | +3 | +3 | 14 | +6 | 5 | 2 |
| 8 | +3 | +4 | 15 | +7 | 5 | 2 |
| 9 | +4 | +4 | 16 | +8 | 6 | 3 |
| 10 | +4 | +4 | 16 | +8 | 6 | 3 |

โอกาสที่ศัตรูพลาด save (เลเวล 1, DC 12 / เลเวล 9, DC 16): minion 55% / 75%, normal 45% / 65%, strong 35% / 55%, boss 25% / 45% (ทอย d20 ไม่รวม nat 20 ผ่านเสมอ ซึ่งคิดรวมแล้ว)

**save DC ของ class อื่นที่มีท่าบังคับให้ศัตรู save:** `8 + prof + mod ของ ability ที่ระบุในท่านั้น` ตามคอลัมน์ DC ด้านบน (ใช้ฟังก์ชันเดียวกัน `saveDc(character, abilityKey)`)

### 1.3 ผลชั่วคราว 1 รอบ (`RoundEffects`)

ใช้เฉพาะภายในรอบที่ผู้เล่นร่ายหรือใช้ท่า ไม่ข้ามรอบ ไม่ต้องมี migration เพิ่ม:

```ts
interface RoundEffects {
  acBonus: Record<string, number>;       // playerId -> AC +n (ลบได้ เช่น ฟันคลั่ง -2) ใช้ตอนศัตรูทอยโจมตี
  ward: Record<string, number>;          // playerId -> ลดดาเมจการโดนครั้งแรก (รวมกับ ward ของไอเท็มวิเศษ)
  advantage: Set<string>;                // playerId ที่ attack roll รอบนี้มี advantage
  skillAdvantage: Record<string, SkillId[]>; // playerId -> skill ที่เช็กรอบนี้มี advantage (ใส่ใน checkPlan)
  enemy: Record<string, ('dazed' | 'stunned' | 'exposed')[]>; // ชื่อศัตรู -> สถานะ
  hidden: Set<string>;                   // playerId ที่ศัตรูเล็งไม่ได้รอบนี้ (ข้ามการโจมตีของศัตรูที่เล็งคนนี้)
  cooldownCut: Record<string, number>;   // playerId -> ลด cooldown ทุกท่าที่ยังเหลือ n (ขั้นต่ำ 0)
}
```

ความหมายของสถานะศัตรู (หมดเมื่อจบรอบ):
- `dazed` (มึนงง): การทอยโจมตีของศัตรูตัวนี้ **disadvantage** (ใช้ d20 สองลูกเอาต่ำ; ถ้ามี `pack` ด้วยให้หักล้างกันเป็นทอยปกติ)
- `stunned` (ตรึง): ศัตรูตัวนี้ **ไม่โจมตีเลย** รอบนี้ (server ข้าม `enemyAttacks` ของตัวนั้น) **boss ที่ควรได้ stunned จะได้ `dazed` แทน**
- `exposed` (เปิดช่องโหว่): การทอยโจมตีของผู้เล่นทุกคนต่อศัตรูตัวนี้ **advantage**

### 1.4 ลำดับ resolve ในหนึ่งรอบ และข้อจำกัด action

ลำดับ: (1) เวท / ท่าที่ตั้ง `RoundEffects` และท่าที่ไม่ใช่การโจมตี → (2) การโจมตีของผู้เล่น (อาวุธ ท่าโจมตี เวทโจมตี) → (3) การโจมตีของศัตรู (AC ผู้เล่นรวม `acBonus`, ward, `hidden`, `stunned`) → (4) tick cooldown และปิดรอบ

ผู้เล่นมี **1 action ต่อรอบ**: ร่ายเวท 1 บท **หรือ** โจมตีด้วยอาวุธ ท่า class ที่เป็นการโจมตีหรือเวทโจมตี นับเป็นการโจมตีของรอบนั้น (ใช้แทนการโจมตีอาวุธ) ส่วนท่าที่ไม่ใช่การโจมตี (ยืนบัง, อวยพรรักษา, ท่าตั้งผลชั่วคราว) ใช้ได้โดยไม่เสีย action โจมตีตามพฤติกรรมเดิมของ `applyAbilityActions` ท่าที่ระบุว่า "ใช้แทนโจมตี" ชัดเจนในตารางข้างล่าง

AI ไม่ได้เป็นคนคิดผล: AI แค่บอกว่าใครใช้ท่า/เวทอะไรกับใคร (จากที่ผู้เล่นเลือกใน `round_actions.ability_id` / `spell_id` ตาม K2) server คิดแล้วส่ง note ให้ AI เล่าตามจริงเหมือนท่า class เดิม

## 2. Class นักเวท (`mage`) สำหรับ `classes.ts` และ K3

| ฟิลด์ | ค่า |
|---|---|
| `id` | `mage` (เพิ่มเข้า `ClassId` และ `CLASS_IDS`) |
| `nameTh` | นักเวท |
| `weaponId` | `wand` (เพิ่มเข้า type ของ `ClassDef.weaponId`) |
| ค่า ability เริ่มต้น | STR 8, DEX 14, CON 13, **INT 15**, WIS 12, CHA 10 (ชุด standard array 15/14/13/12/10/8 เหมือน class อื่น, INT สูงสุด, DEX รองเพื่อ AC) |
| skill ที่ถนัด (4 ตัว เหมือน class อื่น) | `arcana`, `history`, `investigation`, `insight` |
| HP, AC เริ่มต้น | HP 20 (ตามพื้นฐานเกม ไม่มี hit die ต่าง class) · AC ไม่มีเกราะ = 10 + DEX mod(+2) = **12** |
| ability ที่ใช้โจมตีอาวุธ | `WEAPON_ATTACK_ABILITIES.wand = ['INT']` (เวทใช้ INT เสมอ) |
| ค่าที่ต้องใช้ | `save DC เวท = 8 + prof + INT mod` · `โบนัสโจมตีเวท = prof + INT mod` |

### 2.1 อาวุธใหม่ "ไม้กายสิทธิ์" (`wand`)

- `BASE_WEAPONS.wand = { nameTh: 'ไม้กายสิทธิ์', dice: { count: 1, sides: 4, bonus: 0 } }`
- ใช้ INT โจมตี (เพิ่ม `wand: ['INT']` ใน `WEAPON_ATTACK_ABILITIES`) กติกา heavy blow เดิม: ดาเมจ ≥ 75% ของสูงสุด (3 จาก 4) หรือ nat 20 = 2 pip
- เพิ่ม `'wand'` ใน `MagicWeaponId` ของ `magicItems.ts` เพื่อให้มี "ไม้กายสิทธิ์วิเศษ" ได้ในอนาคต: น้ำหนัก 1 (เหมือนกริช) ราคาไอเท็มวิเศษ ไม่ธรรมดา 60 / หายาก 150 / ตำนาน 350 (เหมือนไม้เท้า/กริช) ราคาไม้กายสิทธิ์ธรรมดาในร้าน 20 (เท่ากริชและไม้เท้า) **เพิ่มชิ้นวิเศษจริงไม่อยู่ในงาน K** ถ้าต้องการให้ทำเป็นงานแยก

### 2.2 ตาราง spell slot (ตัวเลขพร้อมใส่โค้ด)

ช่องเวทมีระดับเดียว (ไม่แบ่ง level ของเวท) ทุกเวทที่ไม่ใช่ cantrip ใช้ 1 ช่อง:

```ts
export const MAGE_SPELL_SLOTS: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6 };
```

- Lv1 2 ช่อง → Lv10 6 ช่อง (Lv9 ก็ 6)
- ใช้หมดแล้วร่ายเวทที่ใช้ช่องไม่ได้ (cantrip ยังได้เสมอ) เก็บเป็น `spell_slots_used` (K2) ค่าคงเหลือ = `MAGE_SPELL_SLOTS[level] (+1 ถ้ามี ช่องเวทลึก) − used`
- พักสั้นคืน 1 ช่อง (`SHORT_REST_SPELL_SLOTS_RESTORED`), พักยาวคืนเต็ม (J1 มีอยู่แล้ว ผูกกับ `spellSlots: { current, max }` ใน `rest.ts`)
- ขึ้นเลเวลทำให้ max เพิ่ม ส่วน current เพิ่มตามเท่าที่ max เพิ่ม

### 2.3 ท่าหลักของนักเวท: เวทไหลล้น (`arcane_surge`)

| | |
|---|---|
| ชื่อ | เวทไหลล้น |
| คำอธิบาย (Thai) | ร่ายเวทหนึ่งบทโดยไม่เสียช่องเวท Lv5 ขึ้นไป เวทนั้นแรงขึ้น (โจมตี +2 หรือ DC +2) |
| target | `null` (เลือกบทเวทและเป้าหมายตามปกติของการร่าย) |
| cooldown | **4** |
| ผล | เวทที่ร่ายพร้อมท่านี้ไม่หัก slot (cantrip ก็ใช้ได้แต่ไม่คุ้ม) ตั้งแต่ `ABILITY_UPGRADE_LEVEL` (Lv5): เวทโจมตีทอย +2 และเวทที่ให้ศัตรูทอย save ได้ DC +2 เฉพาะครั้งนั้น |

## 3. เวท 12 บท (`spells.ts`)

หมวดละ 2 บท ยกเว้นโจมตีเดี่ยวและสำรวจ (ดูตาราง) cantrip 3 บท (ไม่ใช้ช่อง) ที่เหลือ 9 บทใช้ 1 ช่อง ทุกบทเป็น 1 action ของรอบ ผลทั้งหมด server คิดจากเครื่องมือในหัวข้อ 1.1

| # | id | ชื่อ | หมวด | ช่อง | เป้าหมาย |
|---|---|---|---|---|---|
| 1 | `arcane_bolt` | แสงเวทพุ่ง | โจมตีเดี่ยว | 0 (cantrip) | ศัตรู 1 ตัว |
| 2 | `frost_lance` | หอกน้ำแข็ง | โจมตีเดี่ยว | 1 | ศัตรู 1 ตัว |
| 3 | `scatter_spark` | ประกายแตกกระจาย | โจมตีหมู่ | 0 (cantrip) | ศัตรู 1 ตัว + ตัวถัดไปในรายการ |
| 4 | `fire_burst` | ลูกไฟระเบิด | โจมตีหมู่ | 1 | ศัตรูทุกตัว (สูงสุด 6) |
| 5 | `arcane_shield` | โล่เวท | ป้องกัน | 1 | เพื่อนหรือตัวเอง |
| 6 | `spell_ward` | กำบังเวท | ป้องกัน | 1 | เพื่อนหรือตัวเอง |
| 7 | `hold_foe` | ตรึงร่าง | ควบคุม | 1 | ศัตรู 1 ตัว |
| 8 | `illusion_fog` | หมอกมายา | ควบคุม | 1 | ศัตรูทุกตัว (สูงสุด 6) |
| 9 | `valor_blessing` | พรกล้าหาญ | สนับสนุน | 1 | เพื่อนหรือตัวเอง |
| 10 | `quicken_rhythm` | เร่งจังหวะ | สนับสนุน | 1 | เพื่อน (ไม่ใช่ตัวเอง) |
| 11 | `arcane_sight` | ตาเวท | สำรวจ | 0 (cantrip) | ตัวเอง |
| 12 | `all_tongues` | เสียงทั้งปวง | สำรวจ | 1 | เพื่อนทุกคน |

### รายละเอียดและตัวเลข

1. **แสงเวทพุ่ง** (cantrip): ยิงลูกแสง ทอยโจมตี (โบนัส prof + INT mod) เทียบ AC ศัตรู โดน −1 pip, nat 20 = −2 pip ยิงหลายลูกตามเลเวล (Lv1–4 1 ลูก, Lv5–8 2 ลูก, Lv9+ 3 ลูก) แต่ละลูกทอยแยก เป้าเดียวกันทั้งหมด (ลูกต่อไปหยุดถ้าเป้าล้มแล้วให้ย้ายไปศัตรูที่เหลือ pip น้อยสุด) นับ disadvantage จาก `fearsome` เหมือนการโจมตีทั่วไป
2. **หอกน้ำแข็ง** (1 ช่อง): ทอยโจมตี โดน −2 pip (Lv7+ −3 pip), nat 20 = +1 pip จากค่าปกติ และศัตรูที่โดนเป็น `dazed` ในรอบนี้ (ผลเดียวกับที่เขียนในข้อ 1.3)
3. **ประกายแตกกระจาย** (cantrip): ศัตรูเป้าหมาย 1 ตัว + ศัตรูตัวถัดไปในรายการที่ยังสู้ได้ (Lv1–4 2 ตัว, Lv5–8 3 ตัว, Lv9+ 4 ตัว) แต่ละตัวทอย save เทียบ DC เวท ไม่ผ่าน = −1 pip ผ่าน = ไม่เสีย
4. **ลูกไฟระเบิด** (1 ช่อง): ศัตรูที่ยังสู้ได้ทุกตัว (สูงสุด 6 ตัว ตามลำดับในรายการ) ทอย save เทียบ DC เวท ไม่ผ่าน = −1 pip (Lv7+ −2 pip) ผ่าน = ไม่เสีย เป็นเวทหมู่ที่แรงที่สุดจึงมี 1 ช่อง
5. **โล่เวท** (1 ช่อง): ผู้รับ AC +3 ตลอดรอบนี้ (`acBonus[target] += 3`) ใช้ก่อนศัตรูโจมตี Lv9+ เป็น +4
6. **กำบังเวท** (1 ช่อง): ผู้รับ ward 3 (ลดดาเมจการโดนครั้งแรกของรอบนี้ 3 ขั้นต่ำ 1) Lv7+ ward 4
7. **ตรึงร่าง** (1 ช่อง): ศัตรู 1 ตัวทอย save เทียบ DC เวท ไม่ผ่าน = `stunned` (ไม่โจมตีรอบนี้) boss ที่ไม่ผ่านได้ `dazed` แทน ผ่าน = ไม่มีผล
8. **หมอกมายา** (1 ช่อง): ศัตรูที่ยังสู้ได้ทุกตัว (สูงสุด 6) ทอย save เทียบ DC เวท ไม่ผ่าน = `dazed` รอบนี้ (รวม boss) อ่อนกว่าตรึงร่างแต่ครอบคลุมทุกตัว
9. **พรกล้าหาญ** (1 ช่อง): ผู้รับมี advantage ในการทอยโจมตีของรอบนี้ (`advantage.add`) ใช้กับตัวเองได้
10. **เร่งจังหวะ** (1 ช่อง): เพื่อน (ไม่ใช่ตัวเอง) ลด cooldown ทุกท่าที่ยังเหลืออยู่ลง 2 (ขั้นต่ำ 0) ผ่าน `cooldownCut` ตอน tick cooldown ของรอบนี้ ไม่มีผลถ้าเพื่อนไม่มี cooldown เหลือ (ไม่หัก slot ถ้าไม่มีผล ให้ปฏิเสธการร่ายตั้งแต่ต้น)
11. **ตาเวท** (cantrip): ตัวเองมี advantage ในการเช็กหนึ่งครั้งของรอบนี้ในกลุ่ม `perception`, `investigation`, `arcana`, `history`, `religion` (ใส่ `skillAdvantage` ให้ checkPlan) และ note ให้ DM ว่าเห็นออร่าเวท/ร่องรอยเวทในที่นั้นหรือไม่
12. **เสียงทั้งปวง** (1 ช่อง): เพื่อนทุกคนที่ยังเล่นได้ มี advantage ในการเช็กสังคมหนึ่งครั้งของรอบนี้ในกลุ่ม `persuasion`, `deception`, `intimidation`, `performance` และ note ให้ DM ว่าทุกคนฟัง/อ่านภาษาใดก็ได้ในรอบนี้

**เงื่อนไขที่ server ต้องปฏิเสธ (ไม่หัก slot, ไม่เริ่ม cooldown):** ผู้ร่ายไม่ใช่ `active`; ช่องหมด (เวทที่ใช้ช่อง); เป้าหมายไม่ถูกชนิด (เช่น เวทเดี่ยวไม่มีเป้า); เวท ward/AC/advantage ใส่เป้าที่ไม่ active; เวทโจมตีตอนไม่มี encounter

## 4. ค่าคงที่ใหม่ที่เสนอ (ไฟล์เดียว `src/lib/character/spellConstants.ts` + เพิ่มใน `combat/constants.ts`)

```ts
// combat/constants.ts
export const ENEMY_SAVE_BONUS: Record<EnemyTier, number> = { minion: 0, normal: 2, strong: 4, boss: 6 };
export const WEAPON_ATTACK_ABILITIES.wand = ['INT'];      // เพิ่มในตารางเดิม

// spellConstants.ts
export const MAGE_SPELL_SLOTS = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6 };
export const SPELL_SAVE_DC_BASE = 8;                       // + prof + INT mod
export const CANTRIP_SCALE_LEVELS = [5, 9];                 // แสงเวทพุ่ง +1 ลูก, ประกายแตกกระจาย +1 เป้า ต่อค่าที่ถึง
export const SPELL_PIPS = { arcane_bolt: 1, frost_lance: 2, frost_lance_hi: 3, scatter_spark: 1, fire_burst: 1, fire_burst_hi: 2 };
export const SPELL_HIGH_LEVEL = 7;                          // frost_lance / fire_burst / กำบังเวท แรงขึ้น
export const ARCANE_SHIELD_AC = 3;  export const ARCANE_SHIELD_AC_HI = 4;   // hi ที่ Lv9
export const SPELL_WARD = 3;  export const SPELL_WARD_HI = 4;               // hi ที่ Lv7
export const QUICKEN_COOLDOWN_CUT = 2;
export const SPELL_AOE_MAX_TARGETS = 6;
export const SURGE_UPGRADE_BONUS = 2;                      // เวทไหลล้นที่ Lv5+
```

## 5. Subclass ที่ Lv3 (2 สายต่อ class = 10 สาย)

เลือกครั้งเดียว ไม่บล็อกรอบ เลือกทีหลังได้ (K5) เก็บเป็น `players.subclass_id` ทุกสายผูกกับ class เดียว (id ขึ้นต้นด้วย id ของ class) การเลือก "เปลี่ยนท่าหลัก" หมายถึงท่าหลักเดิมของ class ถูกแทนที่ด้วยท่าใหม่ของสายนั้น (ใช้ cooldown ตัวเดียวกันใน map `ability_cooldowns` ของ K2 ภายใต้ id ของท่าใหม่)

### 5.1 นักรบ (STR; ท่าหลักเดิม ยืนบัง cooldown 3, guardDivisor 2 → 3 ที่ Lv5)

| id | สาย | ผล |
|---|---|---|
| `warrior_guardian` | ผู้พิทักษ์ | **ยืนบังเร็วขึ้น:** cooldown 3 → **2** และระหว่างรอบที่ยืนบัง ตัวนักรบเองได้ **AC +2** (`acBonus[warrior] += 2`) ท่าเดิมอื่นเหมือนเดิม |
| `warrior_berserker` | นักรบคลั่ง | **แทนที่ ยืนบัง ด้วย ฟันคลั่ง** (`berserk_strike`, ใช้แทนโจมตี, target ไม่มี, cooldown **3**): ทอยโจมตีศัตรูที่เลือกด้วย advantage โดน −2 pip (นับเป็นอย่างน้อย heavy), nat 20 −3 pip แต่ตัวนักรบ **AC −2** ตลอดรอบ (`acBonus[warrior] -= 2`) Lv5+ ฟื้น 2 HP เมื่อฟันคลั่งทำให้ศัตรูหมด pip |

### 5.2 นักธนู (DEX; ท่าหลักเดิม ยิงแม่นยำ cooldown 3, ทอยอาวุธ 2 ครั้ง → 3 ครั้งที่ Lv5)

| id | สาย | ผล |
|---|---|---|
| `archer_hunter` | นักล่า | **passive เล็งจุดอ่อน:** ทอยโจมตีใส่ศัตรู tier `strong` และ `boss` ใช้ AC ต่ำลง 2 (เหมือน keen_eye แต่เฉพาะสองระดับนี้ รวมกับ keen_eye ได้) ยิงแม่นยำที่โดนศัตรู tier `strong`/`boss` ได้ −1 pip เพิ่ม |
| `archer_skirmisher` | พลธนูกระหน่ำ | **แทนที่ ยิงแม่นยำ ด้วย ยิงกระหน่ำ** (`volley`, ใช้แทนโจมตี, cooldown **3**): ยิง 2 ลูก ทอยโจมตีแยกกัน เลือกเป้าหลัก 1 ตัว (ลูกที่ 2 ไปที่ศัตรูถัดไปที่ยังสู้ได้ ถ้ามีไม่พอให้ไปเป้าเดิม) แต่ละลูกโดน −1 pip (heavy ตามกติกาอาวุธเดิมคือ −2) Lv5+ เป็น 3 ลูก |

### 5.3 นักบวช (WIS; ท่าหลักเดิม อวยพรรักษา cooldown 3, heal medium → heavy ที่ Lv5)

| id | สาย | ผล |
|---|---|---|
| `cleric_life` | สายชีวิต | **อวยพรรักษาเข้มข้น:** heal **+2 HP** เพิ่มจากการทอย และ cooldown 3 → **2** |
| `cleric_radiant` | สายแสงเจิดจ้า | **อวยพรเจิดจ้า (ปรับท่าเดิม):** heal ต่ำลงหนึ่งขั้น (Lv1–4 `light` 1d4, Lv5+ `medium` 1d6+1) แต่ศัตรูทุกตัวที่ยังสู้ได้ (สูงสุด 6) ต้อง save เทียบ DC (8 + prof + WIS mod) ไม่ผ่าน = `dazed` รอบนี้ (ใช้ได้แม้ไม่มีใครบาดเจ็บ: ถ้าเป้าหมาย HP เต็มก็ไม่ heal แต่แสงยังทำงาน) |

### 5.4 โจร (DEX; ท่าหลักเดิม ลอบโจมตี cooldown 4, 2d6 → 3d6 ที่ Lv5)

| id | สาย | ผล |
|---|---|---|
| `rogue_assassin` | นักลอบสังหาร | **ลอบโจมตีแม่นขึ้น:** ทอยโจมตีของท่านี้มี advantage เสมอ และถ้าศัตรูเป้าหมาย **ยังมี pip เต็ม** ก่อนโดน −1 pip เพิ่ม (boss ยังโดน full-health rule) |
| `rogue_trickster` | จอมเล่ห์ | **แทนที่ ลอบโจมตี ด้วย หลอกล่อ** (`feint`, target ศัตรู 1 ตัว, cooldown **3**): ศัตรูทอย save เทียบ DC (8 + prof + DEX mod) ไม่ผ่าน = `dazed` + `exposed` (เพื่อนทุกคน advantage ใส่ตัวนั้น) ผ่านแล้วยัง `exposed` แต่ไม่ `dazed` ตัวโจร **AC +2** รอบนี้ + **passive ชำนาญเป็นสองเท่า:** โบนัส proficiency ของ `stealth`, `deception`, `sleight_of_hand` นับ 2 เท่า (เพิ่มใน `skillModifier`) |

### 5.5 นักเวท (INT; ท่าหลัก เวทไหลล้น cooldown 4)

| id | สาย | ผล |
|---|---|---|
| `mage_evoker` | สายทำลายล้าง | **passive:** save DC เวท **+1** ถาวร และ **เวทที่หัก pip ครั้งแรกของรอบ (เวทใดก็ได้ หรือเวทไหลล้น)** หัก **เพิ่ม 1 pip** (ต่อเวทนั้น 1 ครั้งต่อรอบ) |
| `mage_warder` | สายผนึกเวท | **passive:** **โล่เวท AC +4** (แทน +3, Lv9+ +5), **กำบังเวท ward 5** (แทน 3, Lv7+ 6), **ตรึงร่าง/หมอกมายา DC +2** (นักเวทคนนี้ใส่ผลนี้ในสองบทนี้เท่านั้น) และเวทหมวดป้องกัน/สนับสนุน (บท 5, 6, 9) ที่ผู้ร่ายใช้กับ **ตัวเอง** ไม่เสียช่อง **ครั้งแรกของรอบ** |

หมายเหตุ: ข้อไม่เสียช่องของ warder ใช้กับเวทที่ร่ายใส่ตัวเองเท่านั้น ไม่ใช่เพื่อน

## 6. ท่าที่ 2 (Lv6) และท่าที่ 3 (Lv9): เลือก 1 จาก 2

เก็บใน `players.ability_picks` เป็น `{ "6": "<id>", "9": "<id>" }` ทุกท่า active มี cooldown ของตัวเองใน `ability_cooldowns` (หน่วยเหมือนเดิม: ลด 1 ต่อรอบที่มีเหตุการณ์ ตาม `tickCooldowns`) ท่า passive ไม่มี cooldown "แทนโจมตี" = เมื่อใช้ ผู้เล่นไม่โจมตีอาวุธในรอบนั้น save DC ใช้ ability ของ class ตามข้อ 1.2

### 6.1 นักรบ

| Lv | id | ชื่อ | ชนิด | cooldown | ผล |
|---|---|---|---|---|---|
| 6 | `warrior_stone_skin` | ผิวหินผา | passive | - | AC **+1** ถาวร (บวกเพิ่มใน `armorClass` ของนักรบ) |
| 6 | `warrior_war_cry` | เสียงคำราม | active | 4 | ศัตรูทุกตัวที่ยังสู้ได้ (สูงสุด 6) save เทียบ DC (8 + prof + STR mod) ไม่ผ่าน = `dazed` รอบนี้ (ไม่แทนโจมตี) |
| 9 | `warrior_blood_rush` | กระแสเลือด | passive | - | เมื่อการโจมตีของนักรบทำให้ศัตรู **เสีย pip จริง** ฟื้น **2 HP** (ครั้งเดียวต่อรอบ ไม่เกิน max; ถ้าสวมไอเท็ม `lifesteal` รวมกันได้) |
| 9 | `warrior_sweep` | ฟันกวาด | active | 4 | ใช้แทนโจมตี: ฟันศัตรู **2 ตัว** (เป้าหลัก + ตัวถัดไป) ทอยโจมตีแยกกัน ใช้ดาเมจทอยเดียวกัน โดน −1 pip (heavy −2 ตามกติกาเดิม) |

### 6.2 นักธนู

| Lv | id | ชื่อ | ชนิด | cooldown | ผล |
|---|---|---|---|---|---|
| 6 | `archer_hawk_eye` | ตาเหยี่ยว | passive | - | โบนัสทอยโจมตีทุกครั้ง **+1** (บวกใน `attackBonuses.magic` ของคนนี้) |
| 6 | `archer_snare` | กับดักเชือก | active | 4 | ศัตรู 1 ตัว save เทียบ DC (8 + prof + DEX mod) ไม่ผ่าน = `stunned` รอบนี้ (boss ได้ `dazed`) (ไม่แทนโจมตี) |
| 9 | `archer_piercing_arrow` | ลูกศรทะลวง | active | 3 | ใช้แทนโจมตี: ทอยโจมตีด้วย advantage โดน **−2 pip** (nat 20 −3) และ **ไม่นับ AC ที่เพิ่มจาก trait** `armored`/`nimble` |
| 9 | `archer_chain_shot` | ยิงต่อเนื่อง | passive | - | เมื่อการโจมตีของนักธนูทำให้ศัตรู **หมด pip** ได้ยิงลูกเพิ่ม 1 ลูกทันทีใส่ศัตรูที่เหลือ pip น้อยสุด (ทอยโจมตีปกติ, โดน −1 pip, ครั้งเดียวต่อรอบ) |

### 6.3 นักบวช

| Lv | id | ชื่อ | ชนิด | cooldown | ผล |
|---|---|---|---|---|---|
| 6 | `cleric_ward_prayer` | มนตร์คุ้มกัน | active | 4 | เพื่อนทุกคนที่ยังเล่นได้ **AC +2** ตลอดรอบนี้ (รวมตัวนักบวช) |
| 6 | `cleric_twin_spark` | ประกายซ้ำ | passive | - | ทุกครั้งที่ อวยพรรักษา ใช้กับเพื่อน เพื่อนที่ **HP น้อยที่สุดอีกหนึ่งคน** (ไม่ใช่เป้าและไม่ใช่นักบวช) ฟื้นครึ่งหนึ่งของที่ทอย (ปัดลง ขั้นต่ำ 1) ถ้า HP ไม่เต็ม |
| 9 | `cleric_mass_heal` | รักษาหมู่ | active | 5 | เพื่อนทุกคนที่ยังเล่นได้ฟื้นตาม heal `medium` (1d6+1) ทอยแยกคน (ไม่ใช่ฟื้นนักบวชเอง) (ไม่ใช่การโจมตี) |
| 9 | `cleric_smite` | แสงทัณฑ์ | active | 3 | ใช้แทนโจมตี: ทอยโจมตี (d20 + WIS mod + prof) โดน **−2 pip** (nat 20 −3) |

### 6.4 โจร

| Lv | id | ชื่อ | ชนิด | cooldown | ผล |
|---|---|---|---|---|---|
| 6 | `rogue_smoke_veil` | ม่านควัน | active | 5 | ศัตรูทุกตัวที่ยังสู้ได้เป็น `dazed` รอบนี้ **โดยไม่ต้อง save** (ไม่แทนโจมตี) |
| 6 | `rogue_wound_reader` | อ่านแผล | passive | - | ทอยโจมตี **+2** ใส่ศัตรูที่ `pip` ต่ำกว่าค่าเริ่มต้น (บาดเจ็บแล้ว) |
| 9 | `rogue_evasion` | หลบเหลี่ยม | passive | - | การโดนโจมตีที่ **ทำดาเมจ** ของโจมตีแรกที่โดนในรอบ ดาเมจ **ลดครึ่ง** (ปัดขึ้น หลังหัก ward) |
| 9 | `rogue_shadow_step` | หายตัวในเงา | active | 5 | ตัวโจรอยู่ใน `hidden` รอบนี้: การโจมตีของศัตรูที่เล็งโจรถูกข้าม (ไม่ทอย) การโจมตีของโจรยังทำได้ตามปกติ (ไม่แทนโจมตี) |

### 6.5 นักเวท

| Lv | id | ชื่อ | ชนิด | cooldown | ผล |
|---|---|---|---|---|---|
| 6 | `mage_deep_reserve` | ช่องเวทลึก | passive | - | spell slot สูงสุด **+1** ทุกเลเวลตั้งแต่ Lv6 (ตาราง `MAGE_SPELL_SLOTS` + 1) |
| 6 | `mage_recover` | คืนพลังเวท | active | 6 | คืน **2 ช่อง** (ไม่เกิน max) ใช้ไม่ได้ถ้าช่องเต็ม (ไม่ใช่การโจมตี แต่เปลืองรอบด้วย ไม่มี action อื่น) |
| 9 | `mage_meteor` | ดาวตกเวท | active | 5 | **ไม่เสียช่อง** ใช้แทนการร่ายเวท: ศัตรูทุกตัวที่ยังสู้ได้ (สูงสุด 6) save เทียบ DC เวท ไม่ผ่าน = **−2 pip** (ผ่าน = ไม่เสีย) |
| 9 | `mage_frequent_surge` | ไหลล้นถี่ | passive | - | **เวทไหลล้น cooldown 4 → 2** |

## 7. รายการ id ทั้งหมดสำหรับ migration / data (K2, K5, K6)

- class: `mage` (เพิ่ม)
- weapon: `wand`
- subclass (10): `warrior_guardian`, `warrior_berserker`, `archer_hunter`, `archer_skirmisher`, `cleric_life`, `cleric_radiant`, `rogue_assassin`, `rogue_trickster`, `mage_evoker`, `mage_warder`
- ท่าแทนท่าหลัก (ผลของ subclass): `berserk_strike`, `volley`, `feint`
- ท่า Lv6/9 (20): ตาราง 6.1–6.5 (ใช้คอลัมน์ id)
- เวท (12): ตารางข้อ 3
- สถานะรอบเดียว: `dazed`, `stunned`, `exposed` (+ `hidden`, `acBonus`, `ward`, `advantage`, `skillAdvantage`, `cooldownCut` ใน `RoundEffects`)

## 8. ผลต่อโค้ดเดิม (ให้ K2–K7 รู้ล่วงหน้า)

- `classes.ts`: เพิ่ม `mage` และ `wand` ใน type; `ClassDef.ability` ของนักเวทคือ เวทไหลล้น (target `null`, cooldown 4); `SKILL_ABILITIES`/`skillModifier` รองรับ expertise ของ `rogue_trickster`
- `constants.ts` (character): เพิ่ม `wand` ใน `BASE_WEAPONS`; `combat/constants.ts` เพิ่ม `wand` ใน `WEAPON_ATTACK_ABILITIES` และ `ENEMY_SAVE_BONUS`
- `armorClass.ts`: รับ AC +1 ของ `warrior_stone_skin` เป็นโบนัสคงที่จากตัวละคร + `acBonus` ของ `RoundEffects` ตอนศัตรูทอย
- `attack.ts`: `resolveAttack` ต้องรับ advantage จาก `RoundEffects.advantage`/`exposed` และ `acBonus` ลบจาก trait ของ `archer_piercing_arrow`, `archer_hunter`; `runEnemyAttacks` ต้องข้ามศัตรู `stunned` และเป้า `hidden`, ทอย disadvantage ให้ `dazed`
- `applyAbilities.ts`: ท่าใหม่แยกตาม `ability_id` (K2); พฤติกรรมของ 4 ท่าเดิมต้องเหมือนเดิมทุกเทสต์เมื่อไม่มี subclass
- `rest.ts`: พักสั้น/ยาวคืน slot ตามที่ `rest.ts` มีอยู่แล้ว (`spellSlots`); `mage_recover` ใช้ฟังก์ชันเดียวกันคืน 2 ช่อง
- `prompt.ts`: บอก AI ว่าใครอยู่สายไหน ท่าที่มี และ slot เหลือ (K4/K5)

## 9. จุดที่ผู้ใช้ควรดูตอนรีวิวร่าง (ตัดสินใจเองไปก่อนแล้ว แก้ได้)

1. **ตารางเลเวล** ยึดตาม auto-tasks: subclass Lv3, ท่าที่ 2 Lv6, ท่าที่ 3 Lv9 (เลเวลสูงสุดของเกมคือ 10)
2. **ค่า `ENEMY_SAVE_BONUS` 0/2/4/6** เป็นค่าใหม่ที่ผมตั้งเอง ยังไม่มีในโค้ด
3. **ไม่มีเวทหลายระดับ** ใช้ช่องเดียว (ง่ายต่อการ resolve และ UI) ถ้าต้องการเวท level 2+ ต้องแยกตาราง slot
4. **นักเวทไม่มี hit die หรือ HP ต่างจาก class อื่น** (ทุก class เริ่ม 20 HP ในเกมนี้)
5. **ไม่มีเวทที่ revive/ชุบ** (ชนกับกติกา permadeath H3) และ **ไม่มีผลข้ามรอบ** ทุกผลหมดเมื่อจบรอบ เพื่อไม่ต้องเพิ่มคอลัมน์สถานะ
6. **นักบวช radiant ไม่มีท่าฟื้นเต็มสูตร:** ถ้าทีมไม่มีสายชีวิตจะมี heal น้อยลงแต่ระบบพัก (J) ชดเชย
7. ตัวเลข pip/DC/cooldown ทั้งหมดควรจูนด้วย `simulateFight` หลังทำ K4–K6 (เพิ่ม mage และ subclass เข้าชุดจำลองใน I5 เป็นงานต่อ) **อย่าแก้ค่าในโค้ดโดยไม่เสนอใน pending.md**

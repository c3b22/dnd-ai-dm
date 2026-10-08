# รายการตรวจก่อน deploy และ migrate

ใช้ก่อนนำงาน A–G (branch `auto/tasks`, 54 commit ณ `ffa986a` และยังมีงานต่อเนื่อง) ขึ้น production ตรวจเรียงตามลำดับ ติ๊ก `[x]` เมื่อทำแล้ว ข้อที่เขียนว่า "ห้าม" คือเงื่อนไขที่ถ้าไม่ผ่านให้หยุด

ที่ผมตรวจแล้ว (2026-10-06): `npx tsc --noEmit` ผ่าน, `npx vitest run` ผ่าน 977 เทสต์ใน 114 ไฟล์ (รันใหม่ 2026-10-07 บน `ffa986a` พร้อมงานที่ยังไม่ commit), merge `auto/tasks` เข้า `master` ไม่มี conflict, migration 0016–0025 เพิ่มอย่างเดียว ไม่ลบหรือเปลี่ยนของเดิม
ที่ผมยังไม่ได้ตรวจ: การทำงานกับ Supabase จริง, หน้าเว็บบนเบราว์เซอร์, ค่าใช้จ่าย Gemini จริง, ว่า production รัน migration ถึงเลขไหนแล้ว

---

## บันทึกการ deploy จริง (2026-10-07)

ผู้ใช้สั่งให้ข้ามฐานทดสอบและทำตามลำดับข้อ 4 โดยสำรองข้อมูลก่อน

| ลำดับ | สิ่งที่ทำ | ผล |
|---|---|---|
| 1 | สำรองข้อมูล production เป็นไฟล์ JSON (10 ตาราง รวม 1,316 แถว: campaigns 43, players 46, rounds 233, round_actions 234, messages 702, campaign_summary 3, inventory_items 55, ที่เหลือ 0) | เก็บที่โฟลเดอร์ dnd-ai-dm-backups/2026-10-07 ข้างโฟลเดอร์โปรเจกต์ (แผน Free ไม่มี backup ในตัว สำรองเฉพาะข้อมูล ไม่ใช่ schema) |
| 2 | รัน migration บน production ผ่าน SQL editor เรียงลำดับ: 0012 → 0015_classes → (0016, 0017, 0018, 0020, 0022, 0024 รวมกลุ่ม) → (0019, 0023 รวมกลุ่ม) → (0021, 0025 รวมกลุ่ม) | สำเร็จทุกกลุ่ม ตรวจแล้วว่า SQL ที่ใส่ในตัวแก้ไขตรงกับไฟล์ทุกตัวอักษร (เทียบ SHA-256) |
| 3 | ตรวจหลัง migrate: คอลัมน์และตารางใหม่มีครบ, จำนวนแถวทุกตารางเท่าเดิม, `apply_changes` เป็นเวอร์ชันที่มีคอลัมน์ class, constraint ของ `messages` และ `inventory_items` ขยายแล้ว, `campaign_facts` อยู่ใน realtime และเปิด RLS ทั้งสองตารางใหม่ | ผ่าน |
| 4 | merge `auto/tasks` เข้า `master` ในเครื่อง ที่ commit `048a14e` (merge commit `b51f7d2`) **ไม่ได้ push ไป GitHub** | ผ่าน เทสต์ 980 ข้อใน 114 ไฟล์ผ่านบน master หลัง merge |
| 5 | `vercel deploy --prod` (build บน Vercel) | **Ready** target production alias `dnd-ai-dm-omega.vercel.app` build 57 วินาที |
| 6 | smoke test แบบอ่านอย่างเดียวบน production | หน้าแรก 200, หน้า/ API พรีวิวโครงเรื่องที่แชร์ไม่พบ = 404 พร้อม JSON ถูกต้อง (แสดงว่า query คอลัมน์ `share_code` ใหม่ทำงาน), `/api/adventures/mine` ไม่ล็อกอิน = 401 |

**ข้อควรรู้หลัง deploy**
- `tsc` บน master รายงาน error เฉพาะไฟล์ใน `.next/types` (หน้า `dev-preview` ที่ไม่มีใน source แล้ว มาจาก dev server ของคุณ) ไม่มี error ใน `src/`
- **ยังไม่ได้ทดสอบเล่นจริงบน production** (สร้างห้อง เล่นรอบ แชร์/ลบ ถาม DM ไอเท็ม) ผมไม่สร้างข้อมูลทดสอบหรือผู้ใช้ใน production เอง รายการ smoke test ข้อ 5 ยังรอคุณหรือคำสั่งให้ทำ
- `auto/tasks` ไปไกลกว่าที่ deploy: มีงาน H1–H3d หลัง `048a14e` ที่โค้ดยังไม่ได้ deploy (migration 0026–0028 ของงานนี้รันแล้ว ดูหัวข้อถัดไป)
- `master` ในเครื่องนำหน้า `origin/master` อยู่ 57 commit ยังไม่ได้ push
- SQL editor ของ Supabase มี query ที่บันทึกไว้ชื่อ "Untitled query" ในรายการ Private (SELECT ตรวจสอบอย่างเดียว) ลบได้

**แผนถอยกลับถ้าพบปัญหา:** promote deployment เก่าของ Vercel (ล่าสุดก่อนหน้า: วันที่ 2 ต.ค.) กลับมา migration ไม่ต้องถอย (เพิ่มอย่างเดียว) ข้อมูลสำรองอยู่ในโฟลเดอร์ข้างบน ยกเว้นเวอร์ชันเดิมของ `apply_changes` ถ้าจำเป็นต้องถอยฟังก์ชัน ให้รัน `create or replace function` ส่วนที่อยู่ใน `0013_xp.sql`


## รัน migration 0026–0028 บน production (2026-10-07)

ผู้ใช้สั่งให้รัน ทำผ่าน Supabase SQL editor (Chrome ของผู้ใช้) รวมทั้งสามไฟล์ใน transaction เดียว (`begin; … commit;`) เนื้อ SQL นำมาจาก branch `auto/tasks` ตรวจแล้วว่าข้อความใน editor ตรงกับไฟล์ทุกตัวอักษร (SHA-256 `5cbfea4f…89e9`) ไม่ได้สำรองข้อมูลใหม่ เพราะ migration ชุดนี้เพิ่มอย่างเดียว ไม่แก้ข้อมูลเดิม (ข้อมูลสำรองของเช้าวันเดียวกันยังอยู่)

| ตรวจ | ก่อน | หลัง |
|---|---|---|
| จำนวนแถว players / campaigns / messages / rounds | 46 / 43 / 758 / 248 | 46 / 43 / 758 / 248 (เท่าเดิม) |
| คอลัมน์ `players.death_saves` | ไม่มี | มี |
| ตาราง `campaign_corpses` | ไม่มี | มี, เปิด RLS, policy 1 ตัว (members อ่านได้) |
| check ของ `players.status` | active, downed | active, downed, dead (เหลือ constraint เดียว) |

Supabase เตือน "destructive operations" เพราะคำสั่ง `drop constraint` (แทนที่ทันทีด้วย check ที่กว้างขึ้น) และ `drop policy if exists` (policy ที่ยังไม่มี) ซึ่งเป็นไปตามที่คาด โค้ดที่ deploy อยู่ใช้ได้ต่อเพราะไม่เคยเขียนค่า `dead` โค้ด H1–H3d **ยังไม่ได้ deploy**

---

## ผลตรวจข้อ 0 และ 1 (ทำแล้ว 2026-10-06)

ตรวจแบบอ่านอย่างเดียว ด้วยคีย์ใน `.env.local` ยิงถามทีละคอลัมน์ผ่าน PostgREST (`select=<คอลัมน์>&limit=0`) ไม่เขียนอะไร และไม่พิมพ์คีย์

**ข้อ 0 (ข้อมูลที่หาเจอ)**
- โปรเจกต์ Vercel ที่ลิงก์ไว้ในเครื่อง: `dnd-ai-dm` (`.vercel/project.json`) branch หลักบน GitHub: `master` ไม่พบรายการ deployment ผ่าน GitHub API
- Supabase ที่ `.env.local` ชี้อยู่: โปรเจกต์ `ygke…` **ยืนยันแล้ว (2026-10-07) ว่าเป็นโปรเจกต์เดียวกับ `NEXT_PUBLIC_SUPABASE_URL` ของ Production บน Vercel** (ดูใน Vercel → Environment Variables ซึ่งมีเฉพาะสภาพแวดล้อม Preview และ Production และชี้โปรเจกต์เดียวกันกับ `.env.local`) ผลตรวจฐานข้อมูลทั้งหมดในหัวข้อนี้จึงคือสถานะของ **production จริง** ที่ branch `main` (ป้าย PRODUCTION ใน Supabase) ไม่ใช่ฐานพัฒนา
- **รัน migration ด้วยมือ ไม่ได้ใช้ Supabase CLI:** ไม่มีตาราง `supabase_migrations.schema_migrations` ในฐาน production (ตรวจแล้ว `relation does not exist`) แปลว่าเลข `0015` ซ้ำสองไฟล์ **ไม่ใช่ปัญหากับ `supabase db push`** (ไม่เคยใช้) ปัญหาจริงคือการวางไฟล์ทีละไฟล์ใน SQL editor ซึ่งข้ามไฟล์ได้ง่าย และผลตรวจแสดงว่าข้ามไปแล้วสองไฟล์ (0012 และ 0015_classes)
- **การ deploy ทำด้วยมือผ่าน `vercel deploy`:** โปรเจกต์ Vercel `dnd-ai-dm` ไม่ได้เชื่อมกับ Git (หน้าโปรเจกต์ขึ้น "Connect Git Repository") ทุก deployment ใน 2 สัปดาห์นี้เป็น `vercel deploy` ทั้งหมด ล่าสุดคือวันที่ **2 ต.ค. 2026** (3 ครั้ง สถานะ Ready) การ merge เข้า `master` จึง**ไม่** deploy เอง
- โดเมน production: `dnd-ai-dm-omega.vercel.app`

**ข้อ 1 (ผลตรวจฐาน `ygke…`)**

| migration | ผล |
|---|---|
| 0002–0008, 0010 (ตรวจ 16 คอลัมน์/ตาราง) | **มีครบ** |
| 0011 (ฟังก์ชัน `apply_changes`) | ตรวจไม่ได้ผ่านวิธีนี้ |
| **0012** `rounds.tags_applied_at` | **ไม่มี** |
| 0013 `players.xp` | มี |
| 0014 ตาราง `custom_adventures` | มี |
| **0015_classes** `class_id`, `ability_cooldown`, `use_ability`, `ability_target_id` | **ไม่มีทั้ง 4 คอลัมน์** |
| 0015_custom_adventure_scene_rpc (ฟังก์ชัน) | ตรวจไม่ได้ผ่านวิธีนี้ |
| **0016–0022** ทั้งหมด (7 คอลัมน์ + ตาราง `campaign_facts`) | **ไม่มีทั้งหมด** |
| 0023–0025 (เพิ่มภายหลังการตรวจนี้ ไม่ได้ตรวจ) | ถือว่ายังไม่มี เพราะเพิ่งสร้างใน `auto/tasks` ยังไม่เคยรันที่ไหน |

**สิ่งที่ผลนี้บอก**
1. ฐานนี้ขาด **0012 และ 0015_classes** นอกเหนือจาก 0016–0022 ซึ่งผมไม่ได้คาดไว้ในร่างแรก 0013 ถูกรันแต่ 0012 ถูกข้าม แปลว่าเคยรันแบบเลือกไฟล์ (น่าจะ SQL editor)
2. **โค้ดบน `master` ตอนนี้ต้องใช้คอลัมน์พวกนี้อยู่แล้ว** (`createCampaign.ts` เขียน `class_id`, `roundRepository.ts` อ่าน `tags_applied_at`, `class_id`, `ability_cooldown`, `use_ability`) ถ้าฐานนี้คือฐานที่แอปใช้อยู่จริง การสร้างห้องและการประมวลผลรอบด้วยโค้ด master จะ error อยู่แล้วโดยไม่เกี่ยวกับ `auto/tasks`
3. ถ้าฐานนี้เป็นของ production แล้ว production กำลังรันโค้ดที่เก่ากว่า master (ก่อนเพิ่ม class) การ deploy master เฉยๆ จะทำให้พังเหมือนกัน ต้อง migrate ก่อนเสมอ

**ผลตรวจ SQL บน production (รันแล้ว 2026-10-07 ผ่าน Supabase SQL editor แบบ SELECT อย่างเดียว)**

| รายการ | ผล |
|---|---|
| ฟังก์ชัน `apply_changes` | มี (เวอร์ชันที่ไม่รู้แน่ แต่เพราะ 0015_classes ยังไม่ได้รัน จึงน่าจะเป็นเวอร์ชันจาก 0013) |
| ฟังก์ชัน `is_campaign_member` | มี |
| ฟังก์ชัน `update_custom_adventure_scene_image` (0015_custom_adventure_scene_rpc) | **มี** แปลว่าไฟล์นี้รันไปแล้ว ต่างจาก 0015_classes ที่ยังไม่ได้รัน |
| constraint `messages_role_check` | `dm`, `player`, `system` เท่านั้น (ยังไม่มี `ooc`/`ask`/`ask_answer` ตามที่คาด) |
| realtime publication | `campaigns`, `inventory_items`, `messages`, `players`, `round_actions`, `trades` (ไม่มี `campaign_facts` ตามที่คาด 0021 จะเพิ่มให้) |

**สรุปสิ่งที่ต้องรันบน production เรียงลำดับ:** 0012 → 0015_classes → 0016 → 0017 → 0018 → 0019 → 0020 → 0021 → 0022 → 0023 → 0024 → 0025 (ไม่ต้องรัน 0015_custom_adventure_scene_rpc ซ้ำ ฟังก์ชันนั้นมีอยู่แล้ว แต่รันซ้ำได้เพราะเป็น `create or replace`)

**สิ่งที่ผลนี้บอกเรื่องความเสี่ยง**
1. production วันนี้ยังทำงานได้ เพราะโค้ดที่ deploy ล่าสุด (2 ต.ค.) เก่ากว่าการเพิ่ม 0012 (5 ต.ค.) และ class (6 ต.ค.) จึงไม่ต้องการคอลัมน์ที่ยังไม่มี
2. **ถ้า deploy `master` หรือ `auto/tasks` ก่อน migrate production จะพังทันที** สร้างห้องไม่ได้ (เขียน `class_id`) และประมวลผลรอบไม่ได้ (อ่าน `tags_applied_at`, `class_id`, `ability_cooldown`, `use_ability`) ต้อง migrate ก่อนเสมอ
3. migrate ก่อนไม่ทำให้ production ปัจจุบันพัง เพราะทุกไฟล์เพิ่มอย่างเดียว

---

## ผลทดลอง migration ในเครื่อง (2026-10-07)

**Supabase branch ใช้ไม่ได้:** โปรเจกต์ production อยู่บนแพ็กเกจ **Free** (ป้าย FREE ใน dashboard) ส่วน Branching ต้องใช้แพ็กเกจ **Pro ขึ้นไป** และคิดค่าใช้จ่ายต่อชั่วโมงของ branch ([Supabase: Pricing](https://supabase.com/pricing), [Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching)) ผมไม่อัปเกรดแพ็กเกจให้ จึงทดลองแบบอื่นแทน และไม่มี Docker ที่เปิดอยู่ในเครื่อง (ตรวจแล้ว daemon ไม่ทำงาน)

**วิธีที่ใช้แทน:** Postgres จำลองในหน่วยความจำ (PGlite) พร้อมตัวแทนของส่วนที่เป็นของ Supabase (`auth.users`, `auth.uid()`, `storage.*`, publication `supabase_realtime`) จากนั้น

1. วาง migration 0001–0011, 0013, 0014 และ 0015_custom_adventure_scene_rpc เพื่อให้เหมือน production ตามผลตรวจ (ไม่มี 0012 และ 0015_classes)
2. รันชุดที่ต้องรันจริงตามลำดับ: 0012 → 0015_classes → 0016 → … → 0025
3. รันซ้ำอีกรอบเพื่อดูว่ารันซ้ำได้ไหม
4. ทดสอบพฤติกรรมด้วยข้อมูลจำลอง

**ผล**
- [x] ชุดจำลองก่อนรันตรงกับ production (คอลัมน์ของ 0012, 0015_classes, 0016+ ยังไม่มี)
- [x] migration ทั้ง 12 ไฟล์ **รันผ่านทุกไฟล์ตามลำดับ** ไม่มี error
- [x] รันซ้ำ: ทุกไฟล์ผ่าน ยกเว้น **0016 ที่ error รอบสอง** (`share_code already exists`) ตามที่คาดไว้ ห้ามรัน 0016 ซ้ำใน SQL editor
- [x] `messages_role_check` รับ `dm/player/system/ooc/ask/ask_answer` และปฏิเสธ role แปลกปลอม
- [x] `inventory_items_slot_check` รับ `weapon/armor/accessory` และปฏิเสธช่องอื่น
- [x] `campaign_facts` ปฏิเสธ NPC ที่ไม่มีชื่อ (key) แต่รับเบาะแสหลายแถวที่ไม่มี key ได้
- [x] ตาราง realtime หลังรัน: `campaign_facts`, `campaigns`, `inventory_items`, `messages`, `players`, `round_actions`, `trades`
- [x] ออกจากห้อง (ลบแถว `players` หนึ่งแถว) ทำให้เทรดของผู้เล่นนั้นถูกลบด้วย
- [x] ลบห้อง (ลบแถว `campaigns` หนึ่งแถว) ลบข้อมูลลูกหมด: players, rounds, round_actions, messages, inventory_items, campaign_facts, campaign_magic_given, trades, campaign_summary, game_state ยืนยันข้อสรุป FK audit ของงาน A1

**สิ่งที่ผลนี้ยืนยันไม่ได้ (ต้องดูตอน smoke test บนของจริง)**
- ไม่ใช่ Supabase จริง: นโยบาย RLS ถูกสร้างได้แต่ไม่ได้ทดสอบว่าบทบาท `anon`/`authenticated` เห็นอะไร และ storage/realtime เป็นของจำลอง
- ฟังก์ชัน `apply_changes` (ถูกเขียนใหม่ใน 0015_classes) ถูกสร้างได้ แต่ไม่ได้เรียกใช้
- ยังไม่ได้ลองรันกับข้อมูลจริงที่มีอยู่ใน production (แถวเดิมทั้งหมดต้องผ่าน constraint ใหม่ของ 0019 และ 0023 ซึ่งเป็นแค่การขยายค่าที่รับได้ จึงไม่น่าเป็นปัญหา)

---

## 0. ข้อมูลที่ต้องรู้ก่อนเริ่ม

- [ ] ระบุให้ได้ว่า production ใช้ Supabase โปรเจกต์ไหน และมีโปรเจกต์ทดสอบ (หรือ Supabase branch) แยกต่างหากไหม ถ้าไม่มี ให้สร้างก่อน อย่า migrate ครั้งแรกบน production
- [ ] ระบุวิธีรัน migration ที่ใช้อยู่: SQL editor หรือ `supabase db push` ถ้าใช้ CLI ดูข้อ 2.2 (เลข `0015` ซ้ำ)
- [ ] ระบุที่ deploy: โฟลเดอร์ `.vercel` มีอยู่ในโปรเจกต์ น่าจะเป็น Vercel ยืนยันว่า deploy จาก branch ไหน (`master`) และมี preview deploy ให้ลองก่อนไหม

## 1. ตรวจสถานะ production ปัจจุบัน

รันคำถามนี้ใน SQL editor ของ **production** คืนแถวเฉพาะคอลัมน์ที่ยัง**ไม่มี** ถ้าไม่มีแถวเลย แปลว่าครบ

```sql
select expected.t as table_name, expected.c as missing_column
from (values
  ('players','xp'), ('players','class_id'), ('players','ability_cooldown'),
  ('round_actions','use_ability'), ('round_actions','ability_target_id'),
  ('rounds','tags_applied_at'),
  ('custom_adventures','share_code'), ('campaigns','current_encounter'),
  ('players','abilities'), ('players','backstory'), ('players','personality'),
  ('players','goal'), ('players','ability_choices_used'), ('messages','player_id')
) as expected(t, c)
left join information_schema.columns ic
  on ic.table_schema = 'public' and ic.table_name = expected.t and ic.column_name = expected.c
where ic.column_name is null;
```

- [ ] แถวที่ขึ้นมาแต่ละแถวบอกว่า migration ไหนยังไม่ได้รัน: `xp` = 0013, `class_id`/`ability_cooldown`/`use_ability`/`ability_target_id` = 0015_classes, `tags_applied_at` = 0012, `share_code` = 0016, `current_encounter` = 0017, `abilities` = 0018, `player_id` = 0019, `backstory`/`personality`/`goal` = 0020, `ability_choices_used` = 0022
- [ ] **ห้าม** ข้ามไปรัน 0016–0025 ถ้า 0013, 0014, 0015 ยังไม่ครบ (ต้องรันเรียงเลข) ฟังก์ชัน `apply_changes` ถูกเขียนทับใน 0011, 0013 และ 0015_classes ลำดับผิดจะได้ฟังก์ชันเวอร์ชันเก่า
- [ ] ตรวจตาราง `campaign_facts` (จะถูกสร้างโดย 0021): `select to_regclass('public.campaign_facts');` ยังไม่มี = ค่าเป็น null
- [ ] ตรวจ constraint ของ role ข้อความ: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'messages_role_check';` ก่อนรัน 0019 ควรเห็นแค่ `dm`, `player`, `system`

## 2. ตรวจ migration

### 2.1 ไฟล์ที่ต้องรันเรียงเลข

**ลำดับที่ต้องรันสำหรับฐาน `ygke…` ตามผลตรวจ:** 0012 → 0015_classes → 0015_custom_adventure_scene_rpc (ถ้าผลตรวจฟังก์ชันบอกว่าไม่มี) → 0016 → 0017 → 0018 → 0019 → 0020 → 0021 → 0022 → 0023 → 0024 → 0025 (0012 และ 0015_classes ต้องรันก่อนแม้จะไม่ใช่ของงาน A–G เพราะ master ใช้อยู่แล้ว)

| เลข | ทำอะไร | ถ้ารันซ้ำ |
|---|---|---|
| 0012 | เพิ่ม `rounds.tags_applied_at` | ปลอดภัย (`if not exists`) |
| 0015_classes | เพิ่ม `class_id`, `ability_cooldown`, `use_ability`, `ability_target_id` และเขียน `apply_changes` ใหม่ | ปลอดภัย (`if not exists` และ `create or replace`) |
| 0016 | เพิ่ม `custom_adventures.share_code` + unique index | **error** (ไม่มี `if not exists`) ดูข้อ 1 ก่อนรัน |
| 0017 | เพิ่ม `campaigns.current_encounter` | ปลอดภัย |
| 0018 | เพิ่ม `players.abilities` | ปลอดภัย |
| 0019 | ขยาย `messages_role_check` + เพิ่ม `messages.player_id` | ปลอดภัย (drop แล้วสร้างใหม่) |
| 0020 | เพิ่ม `players.backstory/personality/goal` | ปลอดภัย |
| 0021 | สร้าง `campaign_facts` + RLS + realtime | ปลอดภัย |
| 0022 | เพิ่ม `players.ability_choices_used` | ปลอดภัย |
| 0023 | ขยาย `inventory_items_slot_check` ให้รับ `accessory` (drop แล้วสร้างใหม่ ชื่อ constraint ตรงกับของ 0008) | ปลอดภัย |
| 0024 | เพิ่ม `round_actions.item_target` (เป้าหมายม้วนคัมภีร์) | ปลอดภัย |
| 0025 | สร้าง `campaign_magic_given` + RLS (สมาชิกอ่านได้ เขียนผ่าน service role) | ปลอดภัย |

- [ ] ทุกไฟล์เพิ่มอย่างเดียว ไม่มีไฟล์ไหนลบหรือเปลี่ยนชื่อคอลัมน์ โค้ดเก่าที่รันอยู่ระหว่าง migrate จึงไม่พัง
- [ ] หลังรัน 0021 ตรวจว่า `campaign_facts` อยู่ใน realtime publication `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`

### 2.2 ปัญหาที่รู้อยู่ในโฟลเดอร์ migration

- [ ] **เลข `0015` ซ้ำสองไฟล์** (`0015_classes.sql`, `0015_custom_adventure_scene_rpc.sql`) ถ้าใช้ SQL editor ไม่มีปัญหา ถ้าใช้ `supabase db push` สองไฟล์ชน version เดียวกัน ให้ตรวจก่อนว่าคำสั่งไม่ error ผมยังไม่ได้แก้ไฟล์ เพราะอาจรันบน production ไปแล้ว การเปลี่ยนชื่อต้องตัดสินใจร่วมกัน
- [ ] **ไฟล์ `supabase/migrations/README-fk-audit.md`** ไม่ใช่ migration ถ้าใช้ CLI อาจเตือนว่าชื่อไม่ตรงรูปแบบ ควรย้ายไปที่ `docs/` ก่อน push (ยังไม่ได้ย้าย)
- [ ] ตรวจ README เก่า: ขั้นตอน "ตั้งค่าฐานข้อมูล" ใน `README.md` บอกให้รันเรียงเลขไฟล์ ยังถูกต้อง

## 3. ตรวจโค้ด ก่อน merge

- [ ] รีวิวผลงานบน branch `auto/tasks` (121 ไฟล์ เปลี่ยน 6,566 บรรทัด) อย่างน้อยจุดเสี่ยง: `src/lib/round/processRound.ts`, `src/lib/round/roundRepository.ts`, `src/lib/combat/`, `src/app/api/campaigns/[id]/route.ts` (ลบห้อง), `src/app/api/adventures/shared/` (แชร์)
- [ ] ตรวจว่าโค้ดทนกรณี migration ยังไม่ครบ: ระบบรอบเกมดึงคอลัมน์ใหม่ใน query แยก (ตรวจแล้วใน `roundRepository.ts`) แต่ route ใหม่ (`chat`, `ask`, `ability-choice`, `share`) ต้องใช้คอลัมน์ใหม่ ถ้า migrate ไม่ครบจะ error เฉพาะฟีเจอร์นั้น
- [ ] ตรวจสิทธิ์ route ใหม่: ลบห้อง (เจ้าของเท่านั้น), ออกจากห้อง (สมาชิก), ตั้งค่าแชร์ (เจ้าของโครงเรื่อง), เลือกแต้ม ability (เจ้าของตัวละคร) เทสต์อัตโนมัติครอบคลุมแล้ว แต่ควรลองกับบัญชีจริงสองบัญชี
- [ ] ตรวจ `.env` ของ production ว่ามีครบ 4 ค่า: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (ผมตรวจแล้วว่างาน A–G ไม่ได้เพิ่ม `process.env` ตัวใหม่)
- [ ] **ห้ามรัน `npm run build` หรือลบ `.next` ในโฟลเดอร์ที่มี `npm run dev` ค้างอยู่** ใช้ preview deploy ของ Vercel ตรวจ build แทน หรือปิด dev server ก่อน

## 4. ลำดับการทำงาน

1. [ ] สำรองข้อมูล production (Supabase: Database → Backups หรือ `pg_dump`) ก่อนแตะอะไร
2. [ ] (Supabase branch ใช้ไม่ได้บน Free ดูผลทดลองในเครื่องด้านบน ถ้าต้องการฐานทดสอบจริงให้สร้างโปรเจกต์ Supabase ใหม่ฟรีอีกอัน) รัน migration 0016–0025 บนฐานข้อมูล**ทดสอบ**ตามลำดับ (ถ้าฐานทดสอบยังไม่มี 0013–0015 ให้รันเรียงเลขจากที่ขาด)
3. [ ] ชี้ preview deploy ไปที่ฐานข้อมูลทดสอบ ลอง smoke test ในข้อ 5 ทั้งหมด
4. [ ] แก้ปัญหาที่เจอ แล้วทำข้อ 1–3 ซ้ำจนผ่าน
5. [ ] merge `auto/tasks` เข้า `master` (ตัดสินใจเอง ผมไม่ merge ให้เว้นแต่สั่ง)
6. [ ] **รัน migration บน production ก่อน** แล้วตรวจด้วยคำถามข้อ 1 ว่าครบ
7. [ ] deploy production
8. [ ] ทำ smoke test ข้อ 5 ซ้ำบน production แบบเบา (สร้างห้องทดลอง 1 ห้อง)

เหตุผลของลำดับ: migration เพิ่มอย่างเดียว โค้ดเก่าทำงานต่อได้ แต่ถ้า deploy โค้ดใหม่ก่อน ฟีเจอร์ที่ใช้คอลัมน์ใหม่จะ error จนกว่าจะ migrate

## 5. Smoke test (ใช้ 2 บัญชี/2 เบราว์เซอร์)

**เกมหลักเดิม (ต้องไม่พัง)**
- [ ] สร้างห้อง เลือกเนื้อเรื่องในตัว เลือก class ชวนเพื่อนด้วยรหัส 6 หลัก
- [ ] เริ่มเกม ส่ง action ทั้งสองคน รอบปิดได้ DM ตอบ HP/ทอง/XP เปลี่ยนตามปกติ
- [ ] เล่นอย่างน้อย 3 รอบ ไม่มีรอบค้างที่สถานะ `processing`

**A ลบห้อง / ออกจากห้อง**
- [ ] เจ้าของห้อง (คนที่เข้าก่อน) เห็นปุ่ม "ลบห้อง" คนอื่นเห็น "ออกจากห้อง" มีขั้นยืนยัน
- [ ] ผู้เล่นอื่นกดออก: ห้องยังอยู่ รอบถัดไปไม่ค้างรอ action ของคนที่ออก
- [ ] เจ้าของกดลบ: ห้องหายจากรายการของทุกคน ข้อมูลลูกหายครบ (ตรวจใน DB)
- [ ] ลบระหว่างรอบ `processing` ได้ข้อความให้ลองใหม่ (409) ไม่พัง

**B แชร์โครงเรื่อง**
- [ ] สร้างโครงเรื่องเอง (พร้อมรูปฉาก) กด "แชร์" ได้ลิงก์ คัดลอกได้
- [ ] เปิดลิงก์ด้วยบัญชีอื่น (ไม่ล็อกอินก็ได้): เห็นพรีวิว **ไม่มี secret** กด "เพิ่มเข้าคลังของฉัน" ได้สำเนาที่แก้ได้
- [ ] สำเนามี secret ครบ รูปฉากถูกคัดลอก เริ่มห้องจากสำเนาได้
- [ ] กด "ยกเลิกการแชร์" ลิงก์เดิมขึ้นข้อความไม่พบ สำเนาที่ import แล้วไม่หาย
- [ ] เปิดลิงก์ของโครงเรื่องตัวเอง: import ไม่ได้ (ข้อความชัดเจน)

**C combat tracker (ฝั่ง server เท่านั้น ยังไม่มี UI)**
- [ ] ให้ DM เปิดการต่อสู้ในห้องทดลอง ตรวจใน DB ว่า `campaigns.current_encounter` มีศัตรูและ pip ถูกต้อง โจมตีแล้ว pip ลด บอสไม่ตายในทีเดียว
- [ ] ไม่มีแผงศัตรูบนหน้าจอเป็นเรื่องปกติ (C7 ยังไม่ทำ)

**D เช็ก skill (ทอยสองรอบ)**
- [ ] turn ที่ไม่มีเช็ก เรียก AI ครั้งเดียว ตอบปกติ
- [ ] turn ที่มีเช็ก เห็นผลทอย skill, DC, ผ่าน/ไม่ผ่าน ในหน้าจอ และเรื่องเล่าสอดคล้องกับผล
- [ ] ทดสอบกรณี AI ตอบ JSON เสียไม่ได้ง่าย: ดูใน log ว่ามีกรณีถอยไปเล่าปกติหรือไม่ รอบต้องไม่ค้าง

**E ถาม DM / แชททีม**
- [ ] ข้อความแชททีมเห็นทั้งสองฝั่ง และ**ไม่**ไปอยู่ในเรื่องเล่าของ DM รอบถัดไป
- [ ] ถาม DM 3 ครั้งในรอบเดียวได้ ครั้งที่ 4 ถูกปฏิเสธ (429) คำตอบสั้น ไม่ทำให้ HP/ทอง/รอบเปลี่ยน และไม่เปิดเผย secret ของเนื้อเรื่อง

**F ตัวตนตัวละคร / แต้ม ability**
- [ ] กรอก backstory/บุคลิก/เป้าหมายตอนสร้างตัวละคร DM เอ่ยถึงในเรื่องเป็นครั้งคราว
- [ ] ตัวละครเลเวล 4 ขึ้นไปมีแต้มเลือกค่า ability (ฝั่ง API ทำแล้ว ปุ่มบนหน้าจอ F4c ยังไม่ทำ จึงทดสอบผ่าน API เท่านั้น)

**G ความทรงจำโลกเกม**
- [ ] เล่นจน DM แนะนำ NPC/ภารกิจ ตรวจตาราง `campaign_facts` มีแถว และสมุดบันทึกบนหน้าจอแสดงตรงกัน อัปเดตแบบ realtime ในอีกเบราว์เซอร์

**ไอเท็มวิเศษและแผงศัตรู (เพิ่มหลังรอบแรกของ checklist)**
- [ ] ให้ DM แจกไอเท็มวิเศษผ่าน `[[magic: ...]]` ในห้องทดลอง: ไอเท็มเข้ากระเป๋า, ไม่ซ้ำกับที่เคยแจก, ตำนานไม่เกิน 1 ชิ้นต่อห้อง, กระเป๋าเต็มได้ข้อความตามระบบเดิม
- [ ] สวมเครื่องประดับ (ช่อง `accessory`) ได้ 1 ชิ้น สลับ/ถอดได้ ผลของไอเท็มแสดงในหน้ากระเป๋า
- [ ] กลไกพิเศษที่ทำแล้ว (วิกฤตทวี, ดูดชีวิต, ตาเหยี่ยว, โล่รับแรกกระแทก, กระเป๋าไร้ก้น) ทำงานตามคำอธิบายในหน้ากระเป๋า
- [ ] ใช้ม้วนคัมภีร์ลด pip ศัตรู: เลือกเป้าหมายได้ ใช้แล้วหายจากกระเป๋า เป้าหมายผิดไม่เสียม้วน
- [ ] แผงศัตรูแบบแถบ (C7) แสดงใน rail ใต้รายชื่อผู้เล่น เปลี่ยนสีเขียวอมฟ้า/เหลือง/แดงตาม pip ที่เหลือ ขีดฆ่าเมื่อล้ม ขึ้นป้าย "หนี" เมื่อหนี และแถบ HP ผู้เล่นมี 3 สีเช่นกัน (C7b)
- [ ] ปุ่มเลือกแต้มเพิ่มค่า ability (F4c) ปรากฏเมื่อถึงเลเวล 4

## 6. ติดตามหลัง deploy

- [ ] ดู log ของ Vercel/Supabase 30 นาทีแรกหา error ซ้ำๆ โดยเฉพาะ `processRound`, การเรียก Gemini, และ route ใหม่
- [ ] ดูค่า Gemini API ในวันแรก: turn ที่มีเช็กเรียก 2 ครั้ง และช่องถาม DM เรียกเพิ่มได้ผู้เล่นละ 3 ครั้งต่อรอบ ตั้ง quota/แจ้งเตือนใน Google AI Studio
- [ ] เช็กว่ามีรอบค้าง `processing` นานเกิน 90 วินาทีไหม (ค่า stale ของ `claimRound.ts` ที่ระบบหยิบรอบกลับมาทำใหม่เอง): `select id, campaign_id, processing_started_at from rounds where status = 'processing' and processing_started_at < now() - interval '90 seconds';`

## 7. แผนถอยกลับ

- **โค้ด:** revert merge ใน `master` แล้ว redeploy (หรือ promote deployment เก่าบน Vercel) ใช้เวลาไม่กี่นาที
- **migration:** ไม่ต้องถอย คอลัมน์และตารางที่เพิ่มไม่กระทบโค้ดเก่า ข้อยกเว้นเดียวคือ 0019 ที่ขยาย `messages_role_check` ถ้าถอยโค้ดแล้วมีข้อความ role `ooc`/`ask`/`ask_answer` อยู่ในตาราง โค้ดเก่าอาจแสดงข้อความพวกนี้ปนในประวัติ ถ้ารบกวน ลบแถวเหล่านั้นด้วยตัวเอง ห้ามหดกลับ constraint ขณะยังมีแถวพวกนี้ เพราะจะล้ม
- **ข้อมูลที่ไม่อาจกู้:** ห้องที่เจ้าของลบแล้วหายถาวร (cascade) เตรียมแจ้งผู้เล่นก่อนเปิดฟีเจอร์นี้

## 8. สิ่งที่ยังไม่ได้ทำ (ไม่ต้องรอก่อน deploy แต่ควรรู้) ณ 2026-10-07

- ระบบความตาย (H1–H3d): death save, สวิตช์โหมดตายจริง, สร้างตัวละครใหม่, เก็บของจากศพ
- เครื่องรางคืนชีพ (F5g รอ H1) และกลไกไอเท็มที่เหลือ: ถุงเงินโชคดี, จังหวะไว, ครบชุดเป็นธีม (F5j6–F5j8), กระจายกลไกลงไอเท็ม (F5j9), แสดงในหน้ากระเป๋า (F5j10)
- หน้าจอ UI ของงานทั้งหมดยังไม่เคยถูกตรวจด้วยตาบนเบราว์เซอร์จริง ผลที่มีคือเทสต์อัตโนมัติเท่านั้น
- รายการของ `auto/tasks` ยังเพิ่มขึ้นอยู่ ก่อน merge ให้ดู `git log --oneline master..auto/tasks` และรันเทสต์ซ้ำอีกครั้ง

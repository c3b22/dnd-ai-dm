# Auto Tasks

แตกจาก [feature-backlog.md](feature-backlog.md) เป็นงานย่อยสำหรับสั่งทำอัตโนมัติ ทำทีละ task ตามลำดับ ข้าม task ที่ติด `BLOCKED` ไปจนกว่าผู้ใช้จะปลดให้

สถานะ: `[ ]` พร้อมทำ · `[x]` เสร็จ · `[!]` BLOCKED (ต้องรอผู้ใช้ตัดสินใจ ห้ามหยิบมาทำเอง)

## กติกาที่ใช้กับทุก task

- **Test-first** (Vitest + Testing Library) ตาม pattern เดิม: inject Supabase client, ไฟล์ `*.test.ts` อยู่ข้างไฟล์จริง
- **1 task = 1 commit** บน branch แยก (ไม่ push, ไม่เปิด PR เอง) รัน `npm test` ผ่านทั้งหมดก่อน commit
- **ห้ามรัน `npm run build` และห้ามลบ `.next`** ผู้ใช้เปิด `npm run dev` ค้างไว้ ใช้ร่วม `.next` ถ้าพังเซิร์ฟเวอร์ผู้ใช้ล่ม ตรวจชนิดด้วย `npx tsc --noEmit` แทน
- **Migration: เขียนไฟล์ `.sql` ใน `supabase/migrations/` เท่านั้น ไม่รันกับ Supabase จริง** ใช้เลขถัดไปที่ว่าง (ล่าสุดคือ `0015` ซึ่งมีซ้ำ 2 ไฟล์ อย่าไปแก้/เปลี่ยนชื่อ) โค้ดที่พึ่ง column ใหม่ต้องทนได้ถ้า column ยังไม่มีใน production (best effort แบบเดียวกับ `current_scene_id` ใน `createCampaign.ts`)
- API route ใช้ pattern Bearer token เดียวกับ `src/app/api/adventures/route.ts` (`createServiceRoleClient` + `auth.getUser(token)`)
- ข้อความ UI เป็นภาษาไทย ตามของเดิม
- **เรื่องที่ต้องให้ผู้ใช้ตัดสินใจ หรืองานที่ทำค้าง ให้บันทึกใน [pending.md](pending.md) เป็นภาษาไทยเท่านั้น** แล้วข้าม task นั้นไปทำข้ออื่นต่อ ห้ามหยุดถามกลางคัน ห้ามเดาเอง เมื่อทำ task เสร็จให้ติ๊ก `[x]` ที่นี่และอัปเดตตารางสถานะใน pending.md
- "เจ้าของห้อง" = ผู้เล่นที่ `joinedAt` เก่าสุด (`findOwnerId` ใน `src/lib/campaign/turnOrder.ts`) ไม่มี `owner_id` บนตาราง campaigns

## ตัดสินใจแล้ว (ถามผู้ใช้ไว้ 2026-10-06)

| เรื่อง | คำตอบ |
|---|---|
| รูปแบบ share | ลิงก์/โค้ดแชร์ + ผู้รับกด "เพิ่มเข้าคลังของฉัน" ได้**สำเนา**ที่แก้ได้เอง ไม่กระทบต้นฉบับ (ไม่มี gallery สาธารณะ) |
| secret ของ DM | ซ่อนในหน้าพรีวิว แต่คัดลอกไปพร้อมสำเนา |
| ลบ campaign | เจ้าของห้อง = ลบถาวรทั้งห้อง (cascade ทุกคน) · ผู้เล่นอื่น = "ออกจากห้อง" (ลบเฉพาะ player ของตัวเอง) |
| เจ้าของห้องออก | ไม่ให้ออกเฉยๆ ต้องลบห้องเท่านั้น (ไม่ต้องย้ายเจ้าของ) |
| Ability scores | 6 ค่าตาม D&D (STR/DEX/CON/INT/WIS/CHA) |
| ถาม DM ฟรี | ส่งให้ Gemini ตอบจริง จำกัด 3 คำถามต่อผู้เล่นต่อรอบ |
| flow ทอยเต๋า (P1) | เรียก AI สองรอบเฉพาะ turn ที่มีเช็ก, turn ไม่มีเช็กเรียกครั้งเดียว (`narration`) → งาน D5 |
| combat tracker UI (P2, P2.1) | เลือกแบบ C (แถบ pip) จาก Figma · เพิ่มสีเหลืองเป็นระดับกลางทั้งแถบศัตรู **และแถบ HP ผู้เล่น** · แผงอยู่ใน rail ใต้ PlayerOrder พับได้บนมือถือเมื่อศัตรูเกิน 4 ตัว → C7, C7b |
| damage → pip (P3) | server คิดเอง ตามสูตรในงาน C8 ไม่ทำ AC |
| เลเวลอัป (P4) | เพิ่มค่า ability ที่เลเวล 4 และ 8 เก็บแต้มเลือกทีหลังได้ → งาน F4a–F4c |
| ไอเท็มวิเศษ: กลไกใหม่ (P9) | ทำ 100 ชิ้นด้วยกลไก 6 แบบเดิมก่อน (F5b–F5h) แล้วเพิ่มกลไกใหม่ในรอบถัดไป โดยให้ AI ร่างรายการกลไกมาให้เลือกก่อน → F5i, F5j (ผมตีความว่าไม่ต้องรอกลไกใหม่ก่อนทำ F5b) |
| ไอเท็มวิเศษ: เลือกกลไก (P11) | เลือก X1 วิกฤตทวี, X2 ดูดชีวิต, X3 ตาเหยี่ยว, X4 โล่รับแรกกระแทก, X6 กระเป๋าไร้ก้น, X7 ถุงเงินโชคดี, X8 จังหวะไว, X9 ครบชุดเป็นธีม · ไม่เลือก X5, X10, X11, X12 → F5j0–F5j10 |
| ไอเท็มวิเศษ: วิธีแจก (P10) | ใช้ tag `[[magic: ผู้เล่น | ความหายาก]]` ให้ server สุ่มจากพูลที่ห้องยังไม่เคยได้ ตำนานไม่เกิน 1 ชิ้นต่อ campaign → F5f |
| ไอเท็มวิเศษ (P5) | อนุมัติร่าง M1–M10 (รวมช่อง `accessory`, ตำนานไม่ขายในร้าน, ตัวเลขเริ่มต้น) และสั่ง **ขั้นต่ำ 100 ชิ้น ไม่ให้ซ้ำซาก** → F5b–F5h |
| ความตาย (P6, P8) | death save D&D + โหมดตายจริงเป็นสวิตช์แยกในตั้งค่าห้อง → H1, H2; ตายถาวรแล้วสร้างตัวใหม่ทันทีที่เลเวลค่าเฉลี่ยเพื่อนปัดลง (ขั้นต่ำ 1) ชุดเริ่มต้น ทอง 0; ไอเท็ม/ทองอยู่กับศพให้เพื่อนเก็บ; `[[revive]]` ใช้กับตัวที่ตายถาวรไม่ได้ แต่ sanctuary ยังฟื้น HP ตัวที่ยังไม่ตาย → H3a–H3d |
| สมมติฐาน 4 ข้อ (P7) | ผู้ใช้ยืนยัน "ใช้ได้" ทั้งหมด (ข้างล่าง) |

## สมมติฐานที่ผู้ใช้ยืนยันแล้ว

- ลบห้องระหว่างรอบสถานะ `processing` → ตอบ 409 ให้ลองใหม่ ไม่ลบกลางประมวลผล
- import เนื้อเรื่องที่แชร์มา: คัดลอกรูปฉากไป storage ของสำเนาแบบ best effort (คัดลอกไม่ได้ = `imagePath` เป็น null) อนุญาต import ซ้ำได้ (ไม่ dedupe) แต่ห้าม import เนื้อเรื่องของตัวเอง
- share code ยาว 8 ตัว ยกเลิกการแชร์ได้ (ตั้งเป็น null แล้วลิงก์ตาย) สำเนาที่ import ไปแล้วไม่ได้รับผลกระทบ
- ความทรงจำโลกเกมใช้ 3 ชนิด `npc` / `quest` / `clue`

## ข้อจำกัดที่รู้อยู่

- RLS ของ `custom_adventures` เปิดอ่านทุกคน (ออกแบบไว้ใน spec custom adventures เพราะผู้เล่นในห้องต้องโหลดเนื้อเรื่อง) ดังนั้น "ซ่อน secret" คือซ่อนในหน้าพรีวิวและ API แชร์เท่านั้น ไม่ได้กันคนที่ query ตาราง `custom_adventures` ตรงๆ **อย่าแก้ RLS ในงานนี้**

---

## A. ลบ campaign / ออกจากห้อง

- [x] **A1 ตรวจ FK ทุกตารางที่ผูกกับ campaigns/players** — อ่าน `supabase/migrations/*.sql` ทั้งหมด ทำรายการตารางที่อ้าง `campaigns(id)`/`players(id)` และดูว่า `on delete cascade` ครบไหม (เช่น inventory, economy/trades, `campaigns.current_round_id → rounds`) ถ้ามีตัวที่ไม่ cascade และจะขวางการลบ ให้เขียน migration แก้ ผลตรวจเขียนเป็นคอมเมนต์ใน migration หรือหัวไฟล์ test ของ A2 (auto/tasks c08cc58)
  - เสร็จเมื่อ: มีรายการยืนยันว่าลบแถว `campaigns` แถวเดียวแล้วข้อมูลลูกหายหมด หรือมี migration ปิดช่องที่เหลือ
- [x] **A2 `deleteCampaign` + `leaveCampaign` (lib)** — ไฟล์ใหม่ `src/lib/campaign/removeCampaign.ts` (+ test) ตามแบบ `startCampaign.ts` (โยน error class ที่มี `status`) (auto/tasks 3fd9435)
  - `deleteCampaign(supabase, {campaignId, userId})`: หา player ของ userId, ต้องเป็น `findOwnerId` ไม่งั้น 403; ถ้ารอบปัจจุบัน `status='processing'` → 409; ลบแถว `campaigns`
  - `leaveCampaign(supabase, {campaignId, userId})`: ต้องเป็นสมาชิก (ไม่งั้น 404); ถ้าเป็นเจ้าของ → 409 พร้อมข้อความให้ลบห้องแทน; ลบแถว `players` ของตัวเอง
  - ตรวจ side effect ของการออกกลางเกม: รอบที่ pending ต้องไม่ค้างรอ action ของคนที่ออก (ดู `claimRound.ts`, `roundRepository.ts`, `turnOrder.ts` ว่านับผู้เล่นจากไหน) และ trade ที่ค้างของคนนั้น ถ้าต้องแก้ ให้แก้ใน task นี้พร้อมเทสต์
  - เสร็จเมื่อ: เทสต์ครอบคลุม เจ้าของลบได้ / คนอื่นลบไม่ได้ (403) / ลบระหว่าง processing (409) / เจ้าของ leave ไม่ได้ / สมาชิกทั่วไป leave ได้ / ไม่ใช่สมาชิก 404
- [x] **A3 API routes** — `DELETE /api/campaigns/[id]` และ `POST /api/campaigns/[id]/leave` (+ route test เช่นเดียวกับ `join/route.test.ts`) ต้องล็อกอิน (401), map error status จาก A2 (auto/tasks 45a847d)
  - ขึ้นกับ: A2
- [x] **A4 เพิ่ม `isOwner` ใน `MyCampaignSummary`** — `src/lib/campaign/myCampaigns.ts` ต้องดึง players ของแต่ละ campaign (หรือ join) เพื่อคำนวณ `findOwnerId` ได้ ระวัง RLS: ผู้เล่นเห็น players ในห้องตัวเองได้ (`is_campaign_member`) อัปเดต `myCampaigns.test.ts` (auto/tasks a5fbd4e)
  - ขึ้นกับ: A2 (ใช้ตรรกะเจ้าของเดียวกัน)
- [x] **A5 ปุ่มลบ/ออกใน `MyCampaigns`** — `src/components/MyCampaigns.tsx` (+ test) ปุ่มข้างแต่ละแถว (อย่าซ้อนใน `<Link>` ทั้งแถว) เจ้าของเห็น "ลบห้อง" คนอื่นเห็น "ออกจากห้อง" กดแล้วมีขั้นยืนยัน (ข้อความบอกชัดว่าลบถาวรและผู้เล่นทุกคนจะเสียห้อง) ยืนยันแล้วเรียก API ใน A3 แล้วเอาแถวออกจากรายการ ถ้า API ผิดพลาดแสดงข้อความ ไม่ลบแถวทิ้งเงียบๆ (auto/tasks 0837362)
  - ขึ้นกับ: A3, A4

## B. แชร์โครงเรื่อง

- [x] **B1 migration `share_code`** — `alter table custom_adventures add column share_code text; create unique index ... where share_code is not null;` ไม่แตะ RLS (auto/tasks 6874d8d)
- [x] **B2 lib: เปิด/ปิดแชร์** — เพิ่มใน `src/lib/adventures/customAdventures.ts` (+ test): `enableSharing(supabase, id, ownerId)` เจ้าของเท่านั้น (403/404 ตาม `CustomAdventureError`) สร้างโค้ด 8 ตัวแบบเดียวกับ `src/lib/campaign/joinCode.ts` (ตัวอักษรอ่านง่าย ไม่กำกวม) ถ้ามีอยู่แล้วคืนตัวเดิม (idempotent) ชนกับของคนอื่นให้สุ่มใหม่ · `disableSharing` ตั้ง null (auto/tasks 1feaef4)
  - ขึ้นกับ: B1
- [x] **B3 lib: พรีวิวและ import** — `getSharedAdventurePreview(supabase, code)` คืนเฉพาะฟิลด์ปลอดภัย (title/titleTh/tagline/taglineTh/tone/toneTh/setting/hook/openingTh/จำนวน acts/NPCs/สถานะรูปเปิดเรื่อง) **ไม่มี `secret`** · `importSharedAdventure(supabase, code, userId)` สร้างแถวใหม่ owner=userId คัดลอกทุกฟิลด์รวม secret, ไม่ติด share_code, ห้ามถ้าเป็นเจ้าของเดิม (400), คัดลอกรูปฉากไป `<newId>/<key>.jpg` best effort แล้วเขียน `scenes[].imagePath` ใหม่ (ดูรูปแบบ URL/path ที่ `sceneImage.ts` ใช้) (auto/tasks 27a268b)
  - ขึ้นกับ: B2
- [x] **B4 API routes** — `POST`/`DELETE /api/adventures/[id]/share` (เจ้าของ, คืน `{ shareCode }`) · `GET /api/adventures/shared/[code]` (สาธารณะ ไม่ต้องล็อกอิน คืนพรีวิวจาก B3, ไม่เจอ = 404) · `POST /api/adventures/shared/[code]/import` (ต้องล็อกอิน, คืนสำเนา 201) พร้อม route test (auto/tasks 12bc73b)
  - ขึ้นกับ: B3
- [x] **B5 หน้าพรีวิว `/adventures/shared/[code]`** — `src/app/adventures/shared/[code]/page.tsx` แสดงพรีวิว (ไม่มี secret) ปุ่ม "เพิ่มเข้าคลังของฉัน" ถ้ายังไม่มี session ใช้ `ensureAnonymousUser` (ดู `src/lib/supabase/ensureAnonymousUser.ts` ว่าหน้าอื่นเรียกอย่างไร) สำเร็จแล้วพาไปหน้าแรกให้เห็นในคลัง โค้ดไม่ถูกต้อง = ข้อความ "ไม่พบโครงเรื่องนี้ หรือเจ้าของยกเลิกการแชร์แล้ว" (auto/tasks e8c7578)
  - ขึ้นกับ: B4
- [x] **B6 ปุ่มแชร์ใน `MyAdventures`** — `src/components/MyAdventures.tsx` (+ test) ปุ่ม "แชร์" → เรียก B4 → แสดงลิงก์ (`<origin>/adventures/shared/<code>`) + ปุ่มคัดลอก (clipboard ล้มเหลวให้แสดงลิงก์ให้ก๊อปเอง) + "ยกเลิกการแชร์" ต้องรู้สถานะแชร์ตอนโหลดรายการ: เพิ่ม `shareCode` ใน `listMyCustomAdventures`/`GET /api/adventures/mine` (อัปเดต test เดิม) (auto/tasks f5aa22f)
  - ขึ้นกับ: B4
- [x] **B7 ช่องกรอกโค้ดที่หน้าแรก** — ช่อง "มีโค้ดโครงเรื่อง?" ใน `src/app/page.tsx` กรอกโค้ดแล้วไปที่ `/adventures/shared/<code>` (รับทั้งโค้ดเปล่าและลิงก์เต็ม ดึงส่วนท้ายออกมา) (auto/tasks 44e51c1)
  - ขึ้นกับ: B5

## C. Combat tracker (ศัตรู + pip)

ออกแบบแล้วใน `feature-backlog.md` (เก็บ `campaigns.current_encounter jsonb` ตาม pattern `current_shop`, tag `[[enemy: ...]]` ฯลฯ) ใช้ `serverShop.ts`/`shop.ts` และการ sync `current_shop` ใน `roundRepository.ts` กับ `campaign/[id]/page.tsx` เป็นแบบอย่าง

- [x] **C1 migration `current_encounter jsonb`** บน `campaigns` (nullable) เพิ่มเข้า realtime publication ถ้า `current_shop` ถูกเพิ่มไว้แบบนั้น (ดู `0010_economy.sql`) (auto/tasks d2c8cc9)
- [x] **C2 Parse tag ศัตรู** — ขยาย `parseCharacterTags` ใน `src/lib/character/tags.ts` (+ test): `[[enemy: ชื่อ | minion/normal/strong/boss]]`, `[[enemy_hurt: ชื่อ | light/medium/heavy]]`, `[[enemy_flee: ชื่อ]]`, `[[combat_end]]` เพิ่มใน `LEFTOVER_TAG` ด้วยเพื่อซ่อน tag เสีย ระวัง: regex ใช้ capture group เป็นลำดับเลข ต้องอัปเดตคอมเมนต์เลขกลุ่มและไม่ทำให้เทสต์เดิมพัง (auto/tasks e55d6ad)
- [x] **C3 โมดูล encounter (pure)** — `src/lib/combat/encounter.ts` (+ test) type `Encounter`, `normalizeEncounter` (validate jsonb, ค่าแปลกๆ = ไม่มี encounter), `applyEnemyTags(encounter, tags)`: pip (minion 1 / normal 2 / strong 3 / boss 5), hurt light/medium หัก 1 heavy หัก 2, **บอสตายในการโจมตีทีเดียวไม่ได้** (หักแล้วเหลืออย่างน้อย 1 ถ้าเต็ม pip), pip 0 = ล้ม, ชื่อซ้ำเติมเลข (`หมาป่า 2`), ชื่อไม่ตรงให้เมิน, สูงสุด 8 ตัว, `enemy_flee` = หนี, จบอัตโนมัติเมื่อล้ม/หนีหมด หรือ `combat_end` (auto/tasks 4d95634)
  - ขึ้นกับ: C2
- [x] **C4 ต่อเข้า processRound** — `src/lib/round/processRound.ts` + `roundRepository.ts`: โหลด `current_encounter`, apply tag หลัง tag อื่น, เขียนกลับตอนจบรอบ (เขียนเมื่อเปลี่ยนจริง), เปลี่ยนฉาก (`current_scene_id` เปลี่ยน) = จบการต่อสู้, ไม่ให้รางวัลอัตโนมัติ (AI ให้ XP/ทองผ่าน tag เดิม) อัปเดต `roundRepository.test.ts`/`processRound.test.ts` (auto/tasks e1a2106)
  - ขึ้นกับ: C1, C3
- [x] **C5 บอก AI เรื่อง encounter** — เพิ่มส่วน prompt (แบบ `src/lib/economy/prompt.ts`/`src/lib/inventory/prompt.ts`) อธิบาย tag ศัตรู + รายชื่อศัตรูและ pip ปัจจุบัน ต่อเข้า `assemblePrompt.ts` (+ test) (auto/tasks ef28801)
  - ขึ้นกับ: C3
- [x] **C6 โหลด + subscribe encounter ฝั่ง client** — hook/state ใน `campaign/[id]/page.tsx` แบบเดียวกับ `current_shop` (ยังไม่วาด UI) แค่ให้มี `encounter` state ที่ sync realtime และ test (auto/tasks 38acd8d)
  - ขึ้นกับ: C1
- [x] **C7a ร่างภาพ mockup แผง combat tracker ใน Figma (งานออกแบบ ไม่ใช่โค้ด)** (Figma: https://www.figma.com/design/IXL9M41uQGjtNgbGS0qs1E ไม่มี commit) — ตัดสินใจแล้ว (P2): ให้ AI ร่างใน Figma ให้ผู้ใช้ดูก่อน ตามที่ระบุใน `feature-backlog.md` + ข้อมูลจาก `src/app/campaign/[id]/page.tsx` (ตำแหน่งแผง), `HpBar.tsx` และ `globals.css` (สไตล์เดิม) เสนอ 2–3 แบบให้เลือก (pip เป็นวงกลม/หัวใจ/แถบ) พร้อมสถานะ ปกติ / ล้ม (ขีดฆ่า) / หนี และมุมมองมือถือ ถ้าเชื่อมต่อ Figma ไม่ได้ (ต้องล็อกอินก่อน) ให้บันทึกลง pending.md ไม่ต้องเดาด้วยการเขียนโค้ด UI
- [x] **C7 UI panel combat tracker (แบบ C แถบ)** (auto/tasks 38d5243) — ตัดสินใจแล้ว (P2, P2.1): ผู้ใช้เลือก Variant C (แถบ pip) จาก Figma https://www.figma.com/design/IXL9M41uQGjtNgbGS0qs1E ทำเป็นคอมโพเนนต์ใหม่ใช้ `encounter` state จาก C6 ใน `src/app/campaign/[id]/page.tsx` (+ test) ใช้รูปแบบเดียวกับ `.hp-track` ใน `globals.css`
  - **สีเหลืองเป็นระดับกลาง** (ผู้ใช้ขอ: แถบเลือดเดิมมีแค่ 2 สี คือ `.hp-fill` เขียวอมฟ้า กับ `.low` แดง) แถบศัตรูมี 3 ระดับตาม pip ที่เหลือ: เหลือเต็ม = เขียวอมฟ้า (ปกติ), เหลือ 1 pip (และ pip สูงสุดมากกว่า 1) = แดง (ใกล้ล้ม), ระหว่างนั้น = เหลือง (บาดเจ็บ) เช่นบอส 5 pip: 5 ปกติ / 4,3,2 เหลือง / 1 แดง; ศัตรู 2 pip: 2 ปกติ / 1 แดง; minion 1 pip มีแค่ปกติ แล้วล้ม
  - ไม่มี token สีเหลืองใน `globals.css` ตอนนี้ (มีแค่ `--teal` และ `--danger`) ให้เพิ่ม token ใหม่ (เช่น `--warn`) ที่อ่านออกทั้งธีมสว่างและมืด (ดูบล็อกธีมที่มีอยู่ในไฟล์)
  - ล้ม = ขีดฆ่าชื่อและแถบจางจนจบการต่อสู้, หนี = จางและมีป้าย "หนี" ไม่นับเป็นล้ม; การต่อสู้จบ (encounter เป็น null) = แผงหายไป
  - ตำแหน่ง (ผู้ใช้ยืนยันแล้ว): การ์ดใน rail ใต้ `PlayerOrder` ตามที่วาดใน Figma; บนมือถือพับได้เมื่อมีศัตรูเกิน 4 ตัว
  - ขึ้นกับ: C6, C7a (เสร็จแล้ว)
- [x] **C7b สีเหลืองบนแถบ HP ผู้เล่น** (auto/tasks 10e602f) — ตัดสินใจแล้ว (P2.1): ผู้ใช้ยืนยันให้ใช้ 3 ระดับกับแถบ HP ของผู้เล่นด้วย ใน `src/components/HpBar.tsx` ตอนนี้ `low` เมื่อ `hp/maxHp <= 0.3` ให้เพิ่มระดับกลาง: `> 0.6` ปกติ (เขียวอมฟ้า), `> 0.3 และ <= 0.6` เหลือง, `<= 0.3` แดง (เกณฑ์ 0.3 เดิมคงไว้) ใช้ token สีเดียวกับ C7 อัปเดต `HpBar.test.tsx` ครอบคลุมขอบเขต 0.3 / 0.6 และตรวจว่าการ์ดตัวละครอื่นที่ใช้ `.hp-fill` (เช่น `.inv-weight .hp-track` ในหน้ากระเป๋า ถ้าใช้คลาสร่วมกัน) ไม่เปลี่ยนสี
  - ขึ้นกับ: C7 (ใช้ token สีร่วมกัน)
- [x] **C8 ผู้เล่นโจมตีศัตรู → pip อัตโนมัติ / ศัตรูโจมตีผู้เล่น** (auto/tasks 6fa5f6e) — ตัดสินใจแล้ว (P3): ใช้สูตรตามเธรดความเห็น ไม่ทำระบบ AC เพราะเกราะมี `reduction` อยู่แล้ว (`catalog.ts`) ตัวเลขทั้งหมดอยู่ในไฟล์ค่าคงที่ไฟล์เดียว (เช่น `src/lib/combat/constants.ts`) ให้ปรับได้
  - ผู้เล่นโจมตีศัตรู: ทอย d20 เทียบเกณฑ์โดน minion 6 / normal 9 / strong 12 / boss 15 ต่ำกว่า = พลาด ไม่หัก pip, nat 1 พลาดเสมอ; โดน = หัก 1 pip; หัก 2 pip ถ้าดาเมจที่ทอย (อาวุธ + โบนัสเลเวล) ≥ 75% ของค่าสูงสุดของอาวุธ หรือ nat 20; บอสที่ pip เต็มหักแล้วเหลืออย่างน้อย 1 (กติกาเดิม)
  - ศัตรูโจมตีผู้เล่น: AI บอกผ่าน tag `[[enemy_attack: ชื่อศัตรู | ชื่อผู้เล่น]]` (เพิ่มใน `tags.ts` แบบ C2) server คิดดาเมจคงที่ minion 2 / normal 4 / strong 6 / boss 8 ลบ `reduction` ของเกราะที่สวม ต่ำสุด 1 ไม่ทอยฝั่งศัตรู
  - tag `enemy_hurt` (light/medium/heavy) จาก C2 ยังอ่านได้แต่ตัดออกจาก prompt ของ AI เมื่อ C8 ทำงาน (server คิดเองแทน)
  - ผลการโจมตีของผู้เล่นผ่านระบบเช็กของ D5 (การโจมตี = เช็กที่ DC เท่าเกณฑ์โดน) ตัวเลขสูตรเป็นค่าเริ่มต้นที่ยังไม่เคยลองเล่นจริง ให้ใส่เทสต์ขอบเขต (พลาด/โดน/หนัก/บอสเต็ม pip)
  - ขึ้นกับ: C4, D5

## D. ทอยเต๋าให้มีความหมาย (6 ability scores + skill + DC)

ปัจจุบัน `processRound.ts` ทอย d20 ให้ทุก action ล่วงหน้าโดยไม่รู้ว่าเป็น action อะไร

- [x] **D1 migration + type ค่าความสามารถ** — `players.abilities jsonb` (STR/DEX/CON/INT/WIS/CHA) เพิ่ม type ใน `src/lib/character/types.ts`/`constants.ts`, ฟังก์ชัน `abilityModifier(score)` = `floor((score-10)/2)` (+ test) ผู้เล่น/แถวที่ไม่มีค่า = 10 ทุกค่า (ห้ามพังเกมเดิม) (auto/tasks c6b2a04)
- [x] **D2 ค่าเริ่มต้นตาม class + proficiency** — `src/lib/character/classes.ts`: แต่ละ class มี ability scores เริ่มต้นที่ต่างกันจริง (แจกชุดมาตรฐาน เช่น 15/14/13/12/10/8 เรียงตามความถนัดของ class) และ skill ที่ proficient พร้อมแผนที่ skill → ability (18 skill ตาม D&D 5e หรือชุดย่อยที่อธิบายเหตุผลในคอมเมนต์) `createCampaign.ts`/`joinCampaign.ts` บันทึกค่าตอนสร้างตัวละคร (+ test) · proficiency bonus ผูกกับเลเวลจาก `leveling.ts` (auto/tasks 21cc40f)
  - ขึ้นกับ: D1
- [x] **D3 ฟังก์ชัน resolve เช็ก (pure)** — `src/lib/character/check.ts` (+ test): `resolveCheck({ d20s, ability, proficient, level, dc, advantage })` → `{ total, success, critical }` รองรับ advantage/disadvantage (ทอย 2 ใบเลือกสูง/ต่ำ) nat 1/20 ตามกติกาที่ระบุไว้ในไฟล์ (auto/tasks 2662dbb)
  - ขึ้นกับ: D2
- [x] **D4 บอก AI เรื่องค่าความสามารถของตัวละคร** — เพิ่มใน `src/lib/character/prompt.ts` ให้ AI เห็น modifier/skill ของแต่ละตัวละครเพื่อตั้ง DC สมเหตุสมผล (+ test) (auto/tasks 9cdec56)
  - ขึ้นกับ: D2
- [x] **D5 flow การทอยแบบรวมรอบ** (auto/tasks 8212fe6) — ตัดสินใจแล้ว (P1): เรียก AI สองรอบเฉพาะ turn ที่มีการเช็ก ปรับ `processRound.ts`, `assemblePrompt.ts`, `DiceRollOverlay`
  1. รอบแรก AI ตอบ JSON อย่างใดอย่างหนึ่ง: `{"checks":[{"player","skill","dc","advantage"}]}` หรือ `{"narration":"..."}` เมื่อไม่มี action ที่ผลไม่แน่นอน
  2. ถ้ามี `checks`: server ทอย d20 (2 ใบถ้า advantage/disadvantage) ด้วย `resolveCheck` (D3) แล้วเรียกรอบสองให้ AI เล่าโดยรู้ผลสำเร็จ/ล้มเหลวของแต่ละคน
  3. ถ้าเป็น `narration` ใช้ข้อความนั้นเลย (เรียก AI ครั้งเดียว) และไม่ทอยเช็ก
  4. JSON เสียหรืออ่านไม่ได้ → ถอยไปเล่าเรื่องปกติแบบไม่เช็ก (ห้ามทำให้รอบค้าง) แต่ tag เดิมทั้งหมด (hurt/heal/gold/...) ยังทำงานตามปกติ
  5. prompt รอบแรกสั่งให้ตั้งเช็กเฉพาะ action ที่ผลไม่แน่นอนจริง ไม่ใช่ทุก action
  6. `DiceRollOverlay` แสดง skill, DC, ผลรวม (d20 + modifier + proficiency) และผ่าน/ไม่ผ่านให้ทุกคนเห็น
  7. ต้องไม่ทำให้ flow อื่นเสียหาย (ยา/ความสามารถ class ที่ทอยเอง) เทสต์ครอบคลุม 3 ทาง: ไม่มีเช็ก (1 call), มีเช็ก (2 calls), JSON เสีย (ถอยไปไม่เช็ก)
  - ขึ้นกับ: D3, D4 (เสร็จแล้ว)

## E. ถามDM ฟรี + แชททีม (ไม่กินรอบ)

- [x] **E1 ตรวจประวัติแชทที่ส่งเข้า AI** — อ่าน `src/lib/round/assemblePrompt.ts` + `roundRepository.ts` ว่าดึง `messages` ยังไง และกรองตาม `role` ไหม (ตาราง `messages.role` มี check constraint `dm/player/system` ใน `0001_init_schema.sql`) สรุปเป็นคอมเมนต์ใน test ของ E2 ว่าข้อความ `ooc`/`ask` ต้องไม่เข้า prompt ของ AI (auto/tasks b7ffd47)
- [x] **E2 migration + type ข้อความแบบใหม่** — ขยาย check constraint ของ `messages.role` เพิ่ม `ooc` (แชททีม) และ `ask`/`ask_answer` (ถาม-ตอบ DM), เพิ่ม `messages.player_id uuid null references players(id) on delete set null` (ใช้นับโควตาและแสดงชื่อผู้พูด) ทำให้ `assemblePrompt` ไม่เอาข้อความสองกลุ่มนี้เข้าประวัติ (+ test) (auto/tasks ff35ef7)
  - ขึ้นกับ: E1
- [x] **E3 แชททีม (OOC) ฝั่ง server** — `POST /api/campaigns/[id]/chat` สมาชิกเท่านั้น จำกัดความยาวข้อความ (เช่น 500 ตัวอักษร) บันทึก `role='ooc'` ไม่แตะ round/AI (+ route test) ใช้ realtime เดิมของ `messagesRealtime.ts` (auto/tasks b87e459)
  - ขึ้นกับ: E2
- [x] **E4 ถาม DM ฟรีฝั่ง server** — `POST /api/campaigns/[id]/ask` สมาชิกเท่านั้น: จำกัด **3 คำถาม/ผู้เล่น/รอบ** (นับจาก `messages` ที่ `role='ask'` + `player_id` + `round_id` ปัจจุบัน เกิน = 429) เรียก Gemini ผ่าน `src/lib/ai/` ด้วย prompt: summary + ฉากปัจจุบัน + ข้อมูลเนื้อเรื่องที่ผู้เล่นรู้แล้ว **ห้ามส่ง secret ของ DM** และสั่งให้ตอบสั้น ไม่เปลี่ยนสถานะเกม ไม่ออก tag ใดๆ (กรอง tag ทิ้งก่อนบันทึกด้วย `parseCharacterTags`) ไม่ทอยเต๋า ไม่จบรอบ บันทึกคำถาม+คำตอบเป็นข้อความ (+ test mock AI) (auto/tasks d152a7f)
  - ขึ้นกับ: E2
- [x] **E5 UI** — แท็บ/ช่องในหน้าเล่น (`campaign/[id]/page.tsx`, `MessageList.tsx`, คอมโพเนนต์ใหม่ เช่น `ChatPanel.tsx`) สลับ "แชททีม" / "ถาม DM" แสดงโควตาที่เหลือ (3 → 0) ข้อความ ooc/ask แสดงต่างจากบรรยายของ DM ชัดเจน (+ test) (auto/tasks 2ed56d5)
  - ขึ้นกับ: E3, E4

## F. ตัวตนตัวละคร

- [x] **F1 migration + type** — `players.backstory text`, `players.personality text`, `players.goal text` (nullable) จำกัดความยาวฝั่ง API (เช่น 500 ตัวอักษรต่อช่อง) (auto/tasks 45a99e3)
- [x] **F2 ฟอร์มสร้าง/เข้าร่วมห้อง** — เพิ่มช่องกรอก (ไม่บังคับ) ในหน้าสร้างห้อง (`src/app/page.tsx`), `src/app/join/[campaignId]/page.tsx`, `createCampaign.ts`, `joinCampaign.ts` + routes (+ test)  (auto/tasks a283414)
  - ขึ้นกับ: F1
- [x] **F3 ส่งเข้า prompt** — `src/lib/character/prompt.ts`: ใส่ backstory/personality/goal ของแต่ละตัวละคร + คำสั่งให้ DM ผูกเนื้อเรื่องกับสิ่งเหล่านี้เป็นครั้งคราว (ไม่ใช่ทุกรอบ) ฟิลด์ว่างต้องไม่เพิ่มบรรทัดเปล่าใน prompt (+ test) ระวัง prompt injection: ครอบข้อความผู้เล่นเป็นข้อมูล ไม่ใช่คำสั่ง ตามที่ prompt เดิมจัดการข้อความผู้เล่นอื่น (auto/tasks ef6652c)
  - ขึ้นกับ: F1
- [x] **F4a migration + ฟังก์ชันแต้มเพิ่มค่า ability** (auto/tasks e20da39) — ตัดสินใจแล้ว (P4): ได้ 1 ครั้งที่เลเวล 4 และ 1 ครั้งที่เลเวล 8; แต่ละครั้งเลือก +2 ให้ ability เดียว หรือ +1 ให้สองค่า ค่าสูงสุด 20; เก็บเป็นแต้มค่อยเลือกทีหลังได้ ไม่บล็อกรอบ ไม่เลือกก็ไม่หมดอายุ เพิ่ม `players.ability_choices_used int default 0`; ฟังก์ชัน pure ใน `src/lib/character/leveling.ts`: `abilityChoicesAvailable(level, used)` และ `applyAbilityChoice(abilities, choice)` ตรวจรูปแบบ (+2 ค่าเดียว / +1 สองค่าต่างกัน, ไม่เกิน 20) (+ test)
  - ขึ้นกับ: D1, D2 (เสร็จแล้ว)
- [x] **F4b API เลือกแต้ม** (auto/tasks d79d31b) — `POST /api/campaigns/[id]/ability-choice` ผู้เล่นเจ้าของตัวละครเท่านั้น (+ route test) ตรวจว่ามีแต้มเหลือจริง เขียน `abilities` และ `ability_choices_used` พร้อมกัน
  - ขึ้นกับ: F4a
- [x] **F4c UI** (auto/tasks 4d5bfed) — ป้ายบนการ์ดตัวละครเมื่อมีแต้มเหลือ ("มีแต้มเพิ่มค่าความสามารถ 1 ครั้ง") กดแล้วเปิดตัวเลือก +2 / +1+1 และยืนยัน (+ test)
  - ขึ้นกับ: F4b
- [x] **F5a ร่างรายการไอเท็มวิเศษ (งานเอกสาร ไม่ใช่โค้ด)** (ผลงาน: `docs/magic-items-draft.md` ไม่มี commit) — ตัดสินใจแล้ว (P5): ให้ AI ร่างมาให้ผู้ใช้ตรวจก่อน เขียน `docs/magic-items-draft.md` เป็นภาษาไทย ราว 10 ชิ้น แต่ละชิ้น: ชื่อ, id, ผลเชิงกลไกที่ระบบปัจจุบันรองรับจริง (ดู `src/lib/inventory/catalog.ts`, `rules.ts`: อาวุธ/เกราะ/ของใช้), ความหายาก (3 ระดับ), แหล่งที่ได้ (AI แจกผ่าน `[[give]]` หรือร้านค้า), ราคาถ้าขายในร้าน (ดู `prices.ts`) ห้ามแก้โค้ดใน task นี้ ใส่คำถามที่ยังไม่แน่ใจลง pending.md
- [x] **F5b รายการไอเท็มวิเศษ ≥ 100 ชิ้น แบบ data-driven** (auto/tasks 071f23d) — ตัดสินใจแล้ว (P5): ผู้ใช้อนุมัติร่าง `docs/magic-items-draft.md` และสั่ง "ขั้นต่ำ 100 ชิ้น ไม่ให้ระบบซ้ำซาก" (ถือว่าอนุมัติข้อ 2–4 ของร่างไปด้วย: ช่อง `accessory`, ตำนานไม่ขายในร้าน, ตัวเลขเริ่มต้น) ไฟล์ข้อมูลใหม่ `src/lib/inventory/magicItems.ts` (+ test) แต่ละชิ้น: `id` (ไม่ซ้ำ), `nameTh` (ไม่ซ้ำ), `flavorTh` 1 ประโยค, ชนิดกลไก, `rarity` (`uncommon`/`rare`/`legendary`), `weight`, `price`
  - **กลไกที่รองรับมี 6 แบบเท่านั้น** (ไม่คิดกลไกใหม่นอกเหนือนี้ในรอบนี้): อาวุธวิเศษ (โบนัสดาเมจ), เกราะ (reduction), ของใช้ฟื้น HP (ลูกเต๋า), ม้วนคัมภีร์ (ลด pip ศัตรู), เครื่องประดับ (+โบนัสเช็ก skill), เครื่องรางใช้ครั้งเดียว (คืนชีพ) ความหลากหลายมาจากชื่อ ตัวเลข น้ำหนัก skill ที่ได้โบนัส และความหายาก
  - **จำนวนขั้นต่ำต่อหมวด (รวม ≥ 100):** อาวุธ ≥ 32 (ทั้ง 4 แบบ: ดาบสั้น ธนู ไม้เท้า กริช อย่างละ ≥ 8 ชื่อ โบนัส +1 / +2 / +3 ตามความหายาก) · เกราะ ≥ 20 (reduction 2–4, น้ำหนักเบากว่าเกราะธรรมดาที่เทียบเท่า) · ของใช้ฟื้น HP ≥ 12 (ลูกเต๋า/โบนัสหลายแบบ) · ม้วนคัมภีร์ ≥ 12 · เครื่องประดับ ≥ 20 (กระจายให้ครอบคลุมทุก skill ที่มีใน `src/lib/character/classes.ts` อย่างน้อยหมวดละ 1) · เครื่องรางใช้ครั้งเดียว ≥ 4
  - **สัดส่วนความหายาก:** ไม่ธรรมดา ≈ 50% · หายาก ≈ 35% · ตำนาน ≥ 10 ชิ้น
  - ใช้ M1–M10 ในร่างเป็นแม่แบบตัวเลขและเหตุผลเรื่องราคา (ซื้อ ≈ 3× อาวุธธรรมดา, ขายคืนครึ่งหนึ่งปัดลง; ตำนานใส่ราคาให้ตารางครบแต่ไม่วางขาย)
  - test: จำนวนรวมและต่อหมวดตามขั้นต่ำ, id และชื่อไม่ซ้ำ, ทุกชิ้นมีกลไกที่รองรับ, ราคาเป็นจำนวนเต็มบวก, ตำนาน ≥ 10, โบนัสดาเมจของอาวุธวิเศษไม่เกิน +3
  - สร้างตารางภาษาไทยสำหรับผู้ใช้ตรวจ `docs/magic-items-list.md` จากข้อมูลด้วยสคริปต์ (ไม่เขียนมือ) ผู้ใช้ตรวจย้อนหลังได้ ไม่ต้องรออนุมัติก่อนทำ task ถัดไป
  - ขึ้นกับ: F5a (เสร็จแล้ว)
- [x] **F5c ต่อไอเท็มเข้า catalog / ราคา / อาวุธ** (auto/tasks 75d8dd4) — เพิ่มไอเท็มจาก F5b ที่เป็นอาวุธ/เกราะ/ของใช้ฟื้น HP ใน `CATALOG` (`src/lib/inventory/catalog.ts`), `PRICES` (`src/lib/economy/prices.ts` ตารางนี้บังคับให้ทุก id มีราคา) และ **ต้องเพิ่มอาวุธใน `WEAPONS` (`src/lib/character/constants.ts`) ด้วย** เพราะ `weaponFor` ถ้าไม่รู้จัก id จะตกเป็นมือเปล่า (d2) เงียบๆ ให้ทำจากข้อมูลใน `magicItems.ts` ไม่เขียนซ้ำด้วยมือ และมี test ว่าทุก id ใน `magicItems.ts` ที่เป็นชนิดเหล่านี้หาเจอทั้ง `CATALOG`, `PRICES` และ (อาวุธ) `WEAPONS` ตำนานต้องถูกกรองออกจากร้านค้า (ฝั่ง server ใน `src/lib/economy/shop.ts`)
  - ขึ้นกับ: F5b
- [x] **F5d ช่องสวม `accessory` และโบนัสเช็ก** (auto/tasks d031250) — ผู้ใช้ยืนยันแล้วให้เพิ่มช่องนี้ใน DB; migration ขยาย check ของ `inventory_items.slot` (ตอนนี้ `slot in ('weapon','armor')` ใน `0008_inventory.sql`) ให้รับ `accessory` และ unique index "หนึ่งชิ้นต่อช่อง" ต้องยังถูกต้อง; สวมได้ **1 ชิ้นต่อผู้เล่น** (ค่าเริ่มต้นที่ผมตั้งเอง ปรับได้ในค่าคงที่ ผู้ใช้ยังไม่ได้ยืนยัน); `src/lib/inventory/equipItem.ts`, `rules.ts`; โบนัสเครื่องประดับบวกเข้ายอดรวมการเช็ก skill ที่ตรงกับ skill ของชิ้นนั้นใน `src/lib/character/check.ts`/`classes.ts` (`skillModifier`) (+ test ทั้งฝั่งสวม/ถอด/สลับ และการเช็กที่ได้โบนัส/ไม่ได้)
  - ขึ้นกับ: F5c
- [x] **F5e ม้วนคัมภีร์ลด pip ศัตรู** (auto/tasks 4c29064) — ของใช้ครั้งเดียวที่ผู้เล่นระบุเป้าหมายตอนส่ง action (ดูรูปแบบการใช้ยาใน `src/lib/inventory/apply.ts`) server ลด pip ศัตรูเป้าหมายตามค่าของม้วนนั้น (1–2) โดยไม่ต้องทอยโดน บอสที่ pip เต็มเหลืออย่างน้อย 1 ตามกติกาเดิม ผ่าน `src/lib/combat/encounter.ts` ม้วนที่ใช้แล้วหายจากกระเป๋า เป้าหมายไม่ถูกต้อง/ไม่มีการต่อสู้ = ไม่ใช้ม้วน (+ test)
  - ขึ้นกับ: F5c
- [x] **F5f การแจกไอเท็มวิเศษฝั่ง server** (auto/tasks 1daf0f4) — 100 ชิ้นใส่ใน prompt ให้ AI เลือก id เองไม่ได้ (ยาว, AI เดา id ผิด, ซ้ำง่าย) ใช้ tag ใหม่ `[[magic: ชื่อผู้เล่น | uncommon/rare/legendary]]` (เพิ่มใน `tags.ts` แบบ C2) และทางเลือก `| weapon/armor/accessory/potion/scroll` เพื่อบอกชนิดที่อยากแจก ให้ server สุ่มจากพูลตามความหายาก **ไม่ซ้ำกับที่ห้องนี้เคยแจกแล้ว** จนพูลหมวดนั้นหมดจึงเริ่มซ้ำ, ตำนานไม่เกิน 1 ชิ้นต่อ campaign, ใช้ `giveItem` เดิม (กระเป๋าเต็ม = ผลตาม `full` เดิม) เก็บรายการที่แจกแล้วต่อห้อง (migration ตาราง `campaign_magic_given`: `campaign_id` cascade, `item_id`, `given_at`) บอก AI กติกาแจกใน prompt (`src/lib/inventory/prompt.ts`): ไม่ธรรมดา ← หีบ/ภารกิจกลาง, หายาก ← บอส/ภารกิจใหญ่, ตำนาน ← จบ arc เท่านั้น และให้ AI เล่าว่าผู้เล่นได้ไอเท็มอะไรจากผลที่ server ส่งกลับ (ชื่อไอเท็มที่สุ่มได้ต้องไปถึงข้อความบรรยายของรอบถัดไปหรือข้อความระบบ) `[[give]]` เดิมยังใช้ได้กับของธรรมดา (+ test: ไม่ซ้ำ, ตำนานไม่เกิน 1, พูลหมด, ชื่อผู้เล่นไม่ตรง = เมิน)
  - ขึ้นกับ: F5c
- [x] **F5g เครื่องรางใช้ครั้งเดียว (คืนชีพ)** (auto/tasks 1ec14e1) — เครื่องรางที่ระบบ death save ใช้: ผู้สวมที่ล้มเหลวครบ 3 ครั้งฟื้นที่ 1 HP แล้วเครื่องรางสลาย ใช้ช่อง `accessory` จาก F5d (+ test)
  - ขึ้นกับ: F5d, H1
- [x] **F5h แสดงความหายากและผลในหน้ากระเป๋า** (auto/tasks 45db9ab) — `src/components/Inventory.tsx` (+ test) แสดงป้ายความหายากและคำอธิบายผลของไอเท็มวิเศษ (โบนัส/ลดดาเมจ/ผล) ให้ผู้เล่นรู้ว่าสวมแล้วได้อะไร
  - ขึ้นกับ: F5c
- [x] **F5i ร่างรายการกลไกไอเท็มใหม่ (งานเอกสาร ไม่ใช่โค้ด)** (ผลงาน: `docs/magic-mechanics-draft.md` ไม่มี commit) — ตัดสินใจแล้ว (P9): ผู้ใช้เลือกเพิ่มกลไกใหม่ในรอบถัดไป โดยให้ AI ร่างรายการกลไกมาให้เลือกก่อน เขียน `docs/magic-mechanics-draft.md` เป็นภาษาไทย ราว 8–12 กลไกที่ต่างจาก 6 แบบเดิมจริง (ตัวอย่างที่ผู้ใช้ยกมา: ดาเมจเพิ่มเมื่อทอย nat 20, กันดาเมจ 1 ครั้งต่อรอบ, ฟื้น HP เมื่อชนะการต่อสู้) แต่ละกลไก: ชื่อ, ผลที่ผู้เล่นเห็น, ทำงานตอนไหนในรอบ (ต่อกับตรงไหนของ `processRound.ts`/`combat/attack.ts`/`check.ts`), ความยากในการทำ (เล็ก/กลาง/ใหญ่), ความเสี่ยงต่อบาลานซ์, และข้อมูลที่ต้องเก็บเพิ่มใน DB ถ้ามี ห้ามแก้โค้ดใน task นี้ ใส่คำถามที่ยังไม่แน่ใจลง pending.md (ทำได้ขนานกับ F5b–F5h ไม่ต้องรอ)
  - ขึ้นกับ: F5a (เสร็จแล้ว)
- [x] **F5j0 โครงสร้างกลไกพิเศษของไอเท็ม** (auto/tasks 068b206) — ตัดสินใจแล้ว (P11): ผู้ใช้เลือก 8 กลไกจาก `docs/magic-mechanics-draft.md`: **X1 วิกฤตทวี, X2 ดูดชีวิต, X3 ตาเหยี่ยว, X4 โล่รับแรกกระแทก, X6 กระเป๋าไร้ก้น, X7 ถุงเงินโชคดี, X8 จังหวะไว, X9 ครบชุดเป็นธีม** (ไม่เลือก X5, X10, X11, X12 จึง**ไม่ต้องทำโครงสร้างประจุต่อฉาก**และไม่แตะ DB เพิ่มสำหรับกลไกพวกนี้) ฟิลด์ใหม่ในข้อมูลไอเท็ม (`src/lib/inventory/magicItems.ts` จาก F5b): `effect` (กลไกเดียวหรือไม่มี: `crit_surge` / `lifesteal` / `keen_eye` / `ward` / `deep_pack` / `lucky_purse` / `quick_tempo`) และ `theme` (ข้อความธีม เช่น `เงา`, `มิธริล` หรือไม่มี) โมดูล pure ใหม่ `src/lib/inventory/effects.ts` (+ test): `aggregateEffects(equippedItems)` คืนผลรวมของผู้สวมหนึ่งคน โดยกลไกชนิดเดียวกันที่สวมซ้ำนับครั้งเดียว และโบนัสครบชุด X9 เมื่ออาวุธ เกราะ เครื่องประดับที่สวมอยู่ธีมเดียวกันทั้ง 3 ช่อง (ถ้ายังไม่มีช่อง `accessory` จาก F5d ให้ถือว่าครบชุดเมื่อสวม 2 ช่องที่มีธีมเดียวกัน แล้วเปลี่ยนเป็น 3 ช่องเมื่อ F5d เสร็จ) เพิ่ม `itemEffects?` ใน `Character` (`src/lib/character/types.ts`) และคำนวณใน `src/lib/round/roundRepository.ts` ตรงที่ตั้ง `armorReduction` อยู่แล้ว (บรรทัดที่เรียก `armorReduction(inventories[...])`)
  - ขึ้นกับ: F5b, F5c
- [x] **F5j1 X1 วิกฤตทวี** (auto/tasks 5758eb4) — ผู้สวมที่ทอยโจมตีได้ nat 20 หัก pip เพิ่มอีก 1 จากปกติ (จาก 2 เป็น 3) ใน `resolveAttack` (`src/lib/combat/attack.ts`) บอสที่ pip เต็มยังเหลืออย่างน้อย 1 ตามกติกาเดิม ใส่ได้กับอาวุธ (+ test: nat 20 มี/ไม่มีไอเท็ม, บอสเต็ม pip)
  - ขึ้นกับ: F5j0
- [x] **F5j2 X2 ดูดชีวิต** (auto/tasks 8e011f1) — ผู้สวมที่โจมตีโดนและหัก pip ศัตรูได้ ฟื้น HP 1 ไม่เกิน 1 ครั้งต่อรอบต่อผู้สวม (เกิน max HP ไม่ได้ ตัวละครที่ล้มไม่ฟื้นจากกลไกนี้) ที่ `applyAttackOutcomes` (`src/lib/combat/attack.ts`) ใส่ได้กับอาวุธ (+ test)
  - ขึ้นกับ: F5j0
- [x] **F5j3 X3 ตาเหยี่ยว** (auto/tasks 5e34bb0) — เกณฑ์โดนของศัตรูลดลง 1–2 (ค่าตามไอเท็ม) สำหรับการโจมตีของผู้สวม (เช่นบอส 15 → 13) ที่ `HIT_THRESHOLD` ใน `resolveAttack` nat 1 พลาดเสมอและเกณฑ์ต่ำสุดไม่ต่ำกว่า 2 ใส่ได้กับอาวุธและเครื่องประดับ (+ test)
  - ขึ้นกับ: F5j0
- [x] **F5j4 X4 โล่รับแรกกระแทก** (auto/tasks ba4cc89) — ดาเมจแรกที่ผู้สวมโดนในรอบหนึ่งถูกลดเพิ่ม 2–3 (ค่าตามไอเท็ม) จากค่า `armorReduction` ต่ำสุด 1 ครั้งเดียวต่อรอบ ต้องหักให้ครบ**ทั้งสองทางดาเมจ**: `enemy_attack` ใน `src/lib/combat/attack.ts` (บรรทัดที่หัก `armorReduction`) และ tag `hurt` ใน `src/lib/character/applyTags.ts` (สองจุดที่หัก `armorReduction`) และนับ "ใช้ไปแล้วในรอบนี้" ร่วมกันข้ามสองทาง (+ test: ทางเดียว, สองทางในรอบเดียวกันหักแค่ครั้งแรก, ไม่มีไอเท็ม) ใส่ได้กับเกราะ
  - ขึ้นกับ: F5j0
- [x] **F5j5 X6 กระเป๋าไร้ก้น** (auto/tasks ffa986a) — ความจุกระเป๋า +3 (ค่าตามไอเท็ม) `CARRY_CAPACITY` ใน `src/lib/inventory/catalog.ts` เป็นค่าคงที่ที่ `giveItem`/`takeItem`/`weightOf` ใน `src/lib/inventory/rules.ts` ใช้ ต้องเปลี่ยนเป็นค่าต่อผู้เล่น (พารามิเตอร์ความจุที่คำนวณจากไอเท็มที่สวม) และตรวจทุกจุดที่เรียก (ร้านค้า/เทรดใน `src/lib/economy/`, หน้ากระเป๋า `Inventory.tsx`) ถอดไอเท็มแล้วน้ำหนักเกินความจุเดิม: ห้ามถอดจนกว่าจะทิ้งของ หรือคงของไว้แต่รับของใหม่ไม่ได้ (เลือกอย่างหลัง ง่ายกว่าและไม่ทำของหาย) (+ test) ใส่ได้กับเครื่องประดับ (ขึ้นกับ F5d)
  - ขึ้นกับ: F5j0, F5d
- [x] **F5j6 X7 ถุงเงินโชคดี** (auto/tasks 42b2f70) — ทุกครั้งที่ผู้สวมได้ทองจาก tag `gold` ได้เพิ่ม +2 (ค่าตามไอเท็ม) ที่ `src/lib/economy/apply.ts` ไม่กระทบทองจากการขายของหรือเทรด ใส่ได้กับเครื่องประดับ (+ test) (ขึ้นกับ F5d)
  - ขึ้นกับ: F5j0, F5d
- [x] **F5j7 X8 จังหวะไว** (auto/tasks 048a14e) — ความสามารถ class ของผู้สวมพร้อมใช้เร็วขึ้น 1 รอบ (cooldown ลด 1 เพิ่มเติม ไม่ต่ำกว่า 0) ที่ `tickCooldowns` ใน `src/lib/character/applyAbilities.ts` ใส่ได้กับเครื่องประดับ (+ test) (ขึ้นกับ F5d)
  - ขึ้นกับ: F5j0, F5d
- [x] **F5j8 X9 ครบชุดเป็นธีม** (auto/tasks ff315d7) — เมื่อ `aggregateEffects` ตรวจพบครบชุด (3 ช่องธีมเดียวกัน) ผู้สวมได้ +1 ในทุกการเช็ก skill (ค่าเริ่มต้นที่ผมเสนอ) ที่ `src/lib/character/check.ts`/`checkPlan.ts` (ใช้ทางเดียวกับโบนัสเครื่องประดับของ F5d) ไม่ซ้อนกับโบนัสครบชุดอีกชุดหนึ่ง (+ test: ครบชุด, ขาดช่องเดียว, สองธีมปนกัน)
  - ขึ้นกับ: F5j0, F5d
- [x] **F5j9 กระจายกลไกและธีมลงไอเท็ม 100 ชิ้น** (auto/tasks 84957e4; deep_pack ยังไม่ถูกใส่ในชิ้นใด ดู P12) — กำหนด `effect` และ `theme` ในข้อมูล `magicItems.ts`: ไม่ธรรมดา = ไม่มี `effect` (มี `theme` ได้เพื่อให้สะสมเป็นชุด) · หายาก = `effect` เล็ก 1 อย่าง (X2, X3, X7, X8) · ตำนาน = `effect` หลัก 1 อย่าง (X1, X4, X6) และ X9 เป็นผลของธีมไม่ใช่ `effect` ของชิ้นใดชิ้นหนึ่ง สร้างธีมอย่างน้อย 8 ธีม ที่แต่ละธีมมีครบทั้ง 3 ช่อง (อาวุธ เกราะ เครื่องประดับ) อย่างน้อย 1 ชุด และให้ `effect` แต่ละชนิดอยู่บนไอเท็มชนิดที่ร่างระบุเท่านั้น (X1, X2 บนอาวุธ · X4 บนเกราะ · X3 บนอาวุธ/เครื่องประดับ · X6, X7, X8 บนเครื่องประดับ) อัปเดต test ของ F5b (นับ `effect`/`theme` ตามกติกา) และตาราง `docs/magic-items-list.md` ให้แสดงสองคอลัมน์นี้
  - ขึ้นกับ: F5j0 และกลไกที่เกี่ยวข้อง F5j1–F5j8 อย่างน้อยข้อที่ใช้บนชิ้นนั้น (ใส่ `effect` ที่ยังไม่ได้ทำไม่ได้)
- [x] **F5j10 แสดงกลไกพิเศษในหน้ากระเป๋า** (auto/tasks 39d2d3e) — ต่อจาก F5h: `src/components/Inventory.tsx` แสดงคำอธิบายผลของ `effect` และธีม พร้อมบอกว่าสวมครบชุดแล้วหรือขาดช่องไหน (+ test)
  - ขึ้นกับ: F5h, F5j0

## G. ความทรงจำของโลกเกม

ปัจจุบัน summary ย่อทุก 8000 ตัวอักษร (`SUMMARY_ROTATION_THRESHOLD_CHARS` ใน `src/lib/round/assemblePrompt.ts`) รายละเอียดหายได้ ค่าเริ่มต้นที่ใช้ได้เลย (ปรับทีหลังได้): 3 ชนิดข้อเท็จจริง = `npc`, `quest`, `clue`

- [x] **G1 migration ตาราง `campaign_facts`** — `id`, `campaign_id → campaigns on delete cascade`, `kind` (`npc`/`quest`/`clue`), `key` (ชื่อ NPC / ชื่อภารกิจ / null), `value` (ทัศนคติ / สถานะ open|done / ข้อความเบาะแส), `updated_at`, unique `(campaign_id, kind, key)` เปิด RLS ให้สมาชิกห้องอ่านได้ (ใช้ `is_campaign_member`) เขียนผ่าน service role เท่านั้น + เพิ่ม realtime ถ้าจะแสดงสด (auto/tasks 2d647d8)
- [x] **G2 Parse tag** — `[[npc: ชื่อ | ทัศนคติ]]`, `[[quest: ชื่อ | open/done]]`, `[[clue: ข้อความ]]` ใน `tags.ts` (+ test, อัปเดตคอมเมนต์เลขกลุ่ม regex, ซ่อน tag เสียใน `LEFTOVER_TAG`) (auto/tasks e696058)
- [x] **G3 apply + เขียนตาราง** — โมดูล `src/lib/memory/facts.ts` (+ test) upsert ตาม key, จำกัดความยาว/จำนวน (กัน AI ใส่ไม่จำกัด), ต่อเข้า `processRound.ts`/`roundRepository.ts` (auto/tasks 80106bc)
  - ขึ้นกับ: G1, G2
- [x] **G4 ใส่ facts ใน prompt** — `assemblePrompt.ts` ส่ง NPC/ภารกิจค้าง/เบาะแสเป็นส่วนแยกจาก summary (ไม่ถูกย่อ) + คำอธิบาย tag ให้ AI (+ test) (auto/tasks 2cbfc26)
  - ขึ้นกับ: G3
- [x] **G5 UI สมุดบันทึก** — คอมโพเนนต์ `QuestLog.tsx` (+ test) แสดงภารกิจ (ค้าง/เสร็จ), NPC + ทัศนคติ, เบาะแส ดึงจาก `campaign_facts` ใน `campaign/[id]/page.tsx` แบบเดียวกับ players/messages (auto/tasks a9e8b0e)
  - ขึ้นกับ: G1

## H. เพิ่มเดิมพัน (death save / โหมดตายจริง)

ตัดสินใจแล้ว (P6): death save 3 ครั้งแบบ D&D ทอยให้ทุกคนเห็น + โหมดตายจริงเป็นตัวเลือกแยกในตั้งค่าห้อง (ห้องที่ไม่เปิดเล่นเหมือนเดิมทุกอย่าง)

- [x] **H1 death saves** (auto/tasks 60a961a) — เมื่อตัวละครล้มที่ 0 HP เข้าสถานะ "กำลังจะตาย" ทอย d20 ทุกรอบเทียบ DC 10: 10 ขึ้นไป = ผ่าน, ต่ำกว่า = ล้มเหลว, nat 1 = ล้มเหลว 2, nat 20 = ฟื้น 1 HP; ผ่าน 3 ครั้ง = ทรงตัว (หยุดทอย), ล้มเหลว 3 ครั้ง = ตาย ใช้ฟังก์ชัน resolve จาก `check.ts` (D3) และแสดงผลผ่าน `DiceRollOverlay` ให้ทุกคนเห็น ในห้องปกติ (ไม่เปิดโหมดตายจริง) การ "ตาย" ให้ใช้ผลเดิม คือชุบได้ด้วย `[[revive]]`/sanctuary ตามระบบปัจจุบัน ห้ามทำให้ตัวละครหายถาวร เก็บสถานะใน `players` (migration `death_saves jsonb`) (+ test)
  - ขึ้นกับ: D5
- [x] **H2 ตั้งค่าห้อง "โหมดตายจริง"** (auto/tasks 21b1fd2) — เพิ่ม `permadeath boolean` (default false) ใน campaign settings ตาม pattern `src/lib/campaign/settings.ts`/`updateSettings.ts`/`CampaignSettingsPanel.tsx` (migration + validate + UI สวิตช์ เจ้าของห้องแก้ได้ก่อนเริ่มเกมเท่านั้น) ยังไม่ต้องเปลี่ยนพฤติกรรมในเกม แค่เก็บและแสดงค่า (+ test)
- [ ] **H3a ความตายถาวรฝั่ง server** — ตัดสินใจแล้ว (P8): ในห้องที่เปิด `permadeath` เมื่อ death save ล้มเหลว 3 ครั้ง (H1) ตัวละครเป็น "ตายถาวร" (status ใหม่ `dead`) `[[revive]]` ที่ชี้ตัวละครที่ตายถาวรต้องถูกเมินโดย server (ไม่ฟื้น ไม่ error) ส่วน sanctuary ยังฟื้น HP ให้ตัวที่ยังไม่ตายตามเดิม; action ของผู้เล่นที่ตัวละครตายถาวรไม่ถูกส่งเข้า AI จนกว่าจะสร้างตัวใหม่; ห้องที่ไม่เปิด `permadeath` ต้องทำงานเหมือนเดิมทุกอย่าง (+ test ทั้งสองโหมด) ไอเท็มและทองของตัวที่ตายย้ายไปเป็น "ศพ" ตาราง `campaign_corpses` (`campaign_id`, `name`, `items jsonb`, `gold int`, ลบตามห้อง cascade) migration ใหม่; ตัวละครตายถาวรเลิกนับในลำดับผลัดเวลาและจำนวนผู้เล่นที่ต้องส่ง action (ดู `claimRound.ts`, `turnOrder.ts` ไม่ให้รอบค้าง)
  - ขึ้นกับ: H1, H2
- [ ] **H3b สร้างตัวละครใหม่แทนตัวที่ตาย** — ตัดสินใจแล้ว (P8): ผู้เล่นที่ตัวละครตายถาวรสร้างตัวใหม่ได้ทันทีในห้องเดิม `POST /api/campaigns/[id]/respawn` (ชื่อ + class + backstory ตามหน้าสร้างตัวละครเดิม) ตาราง `players` มี unique `(campaign_id, user_id)` จึงต้อง**เขียนทับแถวเดิม** (คง `joinedAt` เพื่อไม่ให้เจ้าของห้องเปลี่ยน, `turn_order` เดิม): เลเวลเริ่มที่ค่าเฉลี่ยเลเวลของเพื่อนที่ยังไม่ตายปัดลง ขั้นต่ำ 1 (ถ้าไม่มีใครรอด = 1) ตั้ง `xp` = `LEVEL_XP_THRESHOLDS[level-1]` ได้ชุดเริ่มต้นของ class ด้วย `seedStartingKit` ทอง 0 ค่า ability เริ่มต้นตาม class (D2) และแต้มเพิ่มค่า ability ตามเลเวลที่เริ่ม (`abilityChoicesAvailable(level, 0)` จาก F4a, แต้มที่ใช้ไปของตัวเก่าไม่ติดมา) ล้างสถานะ death save และสถานะ `dead` (+ test: เลเวลเฉลี่ย, ไม่มีใครรอด, เจ้าของห้องยังเป็นเจ้าของเดิม, ไม่ใช่ผู้เล่นที่ตายห้ามเรียก)
  - ขึ้นกับ: H3a
- [ ] **H3c prompt และ tag เก็บของจากศพ** — ใส่รายชื่อศพในห้อง (ชื่อ + ไอเท็ม + ทอง) ใน prompt ของ AI และ tag ใหม่ `[[loot: ชื่อศพ | ชื่อผู้เล่น]]` ใน `tags.ts` (แบบ C2) ให้ server ย้ายไอเท็มและทองของศพนั้นให้ผู้เล่นที่ระบุ (เมินถ้าชื่อไม่ตรง) ใช้กฎน้ำหนัก/ช่องของ `inventory/rules.ts` ถ้าเกินให้ย้ายเท่าที่ได้ที่เหลือคงอยู่กับศพ (+ test)
  - ขึ้นกับ: H3a
- [ ] **H3d UI หน้าสร้างตัวละครใหม่** — เมื่อตัวละครของผู้เล่นตายถาวร แสดงหน้าสร้างตัวใหม่ (นำ `ClassPicker` และฟอร์มเดิมมาใช้ซ้ำ) และข้อความบอกเลเวลเริ่มต้นที่จะได้ ผู้เล่นคนอื่นเห็นป้ายว่าใครตายและกำลังสร้างตัวใหม่ (+ test)
  - ขึ้นกับ: H3b

---

## ลำดับที่แนะนำ

1. C7 → C7b (แผงศัตรูแบบ C + สีเหลือง และแถบ HP ผู้เล่น 3 ระดับ)
2. F4c (UI เลือกแต้ม ability)
3. H1 → H2 → H3a → H3b → H3c → H3d (ความตาย)
4. F5b → F5c → F5d / F5e / F5h → F5f (ไอเท็มวิเศษ ≥ 100 ชิ้น) · F5g หลัง H1 และ F5d · F5i (ร่างกลไกใหม่) ทำขนานได้เลย
5. F5j0 → F5j1–F5j8 → F5j9 → F5j10 (กลไกพิเศษของไอเท็ม 8 แบบ) ทำหลัง F5b/F5c (และ F5d สำหรับกลไกของเครื่องประดับ) ไม่มี task ที่ติด BLOCKED แล้ว

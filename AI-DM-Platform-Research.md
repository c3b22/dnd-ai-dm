# รายงานวิจัย: แพลตฟอร์ม AI Dungeon Master (D&D) — ภูมิทัศน์ตลาด และต้นทุนการพัฒนา

> จัดทำเมื่อ 28 กันยายน 2026 | ใช้สำหรับประกอบการระดมความคิด (brainstorming) โปรเจกต์แพลตฟอร์ม D&D ที่มี AI เป็น Dungeon Master พร้อมสถานะเกมแบบเรียลไทม์ที่ผู้เล่นทุกคนเห็นร่วมกัน และเอฟเฟกต์เสียง/ภาพเพื่อเพิ่มความสมจริง

---

## สรุปภาพรวม (TL;DR)

- ตลาด **"AI เป็น DM"** คึกคักมากในปี 2026 มีทั้งแอปเดี่ยว (AI Dungeon, Friends & Fables, LoreKeeper, AI Realm, RoleForge, Voyage) และบอท Discord โอเพนซอร์สจำนวนมาก แต่ส่วนใหญ่เน้น **โซโล/แชทเป็นหลัก** ระบบ "กระดานเกมเรียลไทม์แบบเห็นพร้อมกัน" (แผนที่ยุทธวิธี, token, hit point แบบซิงค์สด) ยังเป็นจุดที่ทำได้ไม่สมบูรณ์เท่า VTT ดั้งเดิม
- ฝั่ง **VTT ดั้งเดิม** (Roll20, Foundry VTT, Fantasy Grounds, Owlbear Rodeo, D&D Beyond Maps) แข็งแรงเรื่อง real-time shared board/แผนที่ยุทธวิธี แต่ **แทบไม่มี AI DM ในตัว** — ยังต้องมีมนุษย์เป็น DM
- ช่องว่างที่ไอเดียนี้จะเติมเต็ม: **"AI DM ระดับ Friends & Fables/LoreKeeper" + "Real-time tactical board ระดับ Roll20/Foundry" + "เอฟเฟกต์เสียง/ภาพแบบเกม"** ในที่เดียว ซึ่งยังไม่มีผู้เล่นรายใดครองพื้นที่นี้ชัดเจน 100%
- ต้นทุนหลักที่ต้องตั้งงบ: **LLM API** (ตัวแปรใหญ่สุดตามความยาวเซสชัน), **Realtime infra** (Supabase/Firebase/Ably/Pusher), **TTS** (ถ้าต้องการเสียงพากย์), **Hosting**, และ **SFX/เพลงประกอบ** (มีตัวเลือกฟรี/ถูกจำนวนมาก)

---

## ส่วนที่ 1: ภูมิทัศน์การแข่งขัน / ตลาด (Competitive Landscape)

### 1.1 แอป/แพลตฟอร์ม AI Dungeon Master (โฟกัสด้าน AI-as-DM)

| แพลตฟอร์ม | สิ่งที่ทำได้ | ราคา | เทียบกับไอเดียนี้ |
|---|---|---|---|
| **AI Dungeon** (Latitude) | เกมเล่าเรื่องแบบ freeform text-adventure ที่ AI ต่อเนื้อเรื่องจากสิ่งที่ผู้เล่นพิมพ์ ไม่ยึดกฎ D&D 5e เคร่งครัด | Free (มีโฆษณา, context ~1,000 token) / Adventurer $9.99 / Champion $24.99 / Hero $49.99 ต่อเดือน | เน้นเดี่ยว, เนื้อเรื่องอิสระ ไม่มีกระดานเกมภาพ/แผนที่ยุทธวิธี ไม่ผูกกับกฎ D&D จริงจัง — ไอเดียนี้เพิ่มมัลติเพลเยอร์แบบเห็นพร้อมกัน + กฎ D&D ที่เข้มงวดกว่า |
| **Voyage** (โปรเจกต์ใหม่ของ Latitude ต่อยอดจาก AI Dungeon) | แพลตฟอร์ม RPG แบบ "emergent" รุ่นถัดไป อยู่ในช่วง invite-only beta (เปิดตัว เม.ย. 2026) บน iOS/Android | ยังไม่ประกาศราคาชัดเจน (beta) | ยังไม่ทราบรายละเอียดมัลติเพลเยอร์เรียลไทม์ที่ชัดเจน เป็นคู่แข่งอนาคตที่ต้องจับตา |
| **Friends & Fables** | AI GM ชื่อ "Franz" รันแคมเปญสไตล์ D&D 5e SRD มี worldbuilding, แผนที่การรบ (battlemap), เควส, inventory, faction, image studio, เล่นได้ทั้งเดี่ยวและกลุ่มผ่านเว็บ/Discord | Free (25 เทิร์น/วัน) / Starter $19.95 / Pro $29.95 / Legend $39.95 ต่อเดือน (ปรับราคาขึ้น ธ.ค. 2025) | ใกล้เคียงไอเดียนี้ที่สุดในแง่ฟีเจอร์ครบ (แผนที่ + AI DM + มัลติเพลเยอร์) แต่ยังอยู่ใน Early Access Beta มีบั๊ก และยังไม่เน้นเอฟเฟกต์เสียง/ภาพสมจริงเท่าที่ตั้งใจ |
| **LoreKeeper** | AI GM แบบมีเสียงพากย์ (voiced GM) เล่น D&D/TTRPG พร้อม dice roll จริง, จำเหตุการณ์แคมเปญก่อนหน้า, มัลติเพลเยอร์สูงสุด 6 คนแบบเรียลไทม์ (มีทุกแพ็กแม้ฟรี) แต่ละคนมีบทบาท (Leader/Scout/Healer) | Freemium — ฟรีมีจำนวนเทิร์น/วันจำกัด, อัปเกรดเพื่อเล่นไม่จำกัด+ปาร์ตี้ | ใกล้เคียงมากในแง่ real-time multiplayer + AI DM + เสียงพากย์ แต่เป็น turn-based/เทิร์นต่อวันแบบมีโควตา ไม่ชัดว่ามีเอฟเฟกต์เสียงบรรยากาศ (ambience) หรือภาพประกอบระดับ VTT จริง |
| **AI Realm** | AI GM สไตล์ D&D freemium มัลติเพลเยอร์อยู่ในแพ็กเสียเงิน, free tier จำกัด context ~70,000 ตัวอักษร | Freemium, จ่ายเพื่อปลดล็อกมัลติเพลเยอร์/context ยาวขึ้น | โมเดลธุรกิจคล้ายที่ตั้งใจทำ (freemium + gate มัลติเพลเยอร์) เป็นกรณีศึกษาด้านราคาได้ดี |
| **RoleForge** | อยู่ระหว่าง Alpha ฟรีทั้งหมด ประกาศว่าจะมีมัลติเพลเยอร์ร่วมเล่นกับเพื่อนในอนาคต (ยังไม่เปิดจริง) รวมถึงเครื่องมือสร้างภาพ/ฉาก/วิดีโอด้วย AI | ฟรีระหว่าง Alpha, ราคาจริงยังไม่ประกาศ | คู่แข่งที่ยังไม่โตเต็มที่ — มัลติเพลเยอร์ยังเป็น roadmap เหมือนไอเดียนี้ที่ต้องแข่งขันเรื่องความเร็วในการออกฟีเจอร์ |
| **Wit's End** | AI roleplay ที่เล่นผ่านหน้าจอทีวี/สตรีมมิ่ง แทนเบราว์เซอร์/มือถือ | ไม่ระบุชัด | แนวทาง UX ต่างออกไป (couch/TV-based) เป็นไอเดียอ้างอิงด้าน immersive presentation |
| **AI Game Master – Dungeon RPG** (มือถือ, Google Play/App Store) | แอปมือถือ GPT-based DM สำหรับ D&D 5e เล่นเดี่ยว | มีรุ่นฟรี + in-app purchase | เน้นมือถือ/โซโล ไม่มีมัลติเพลเยอร์เรียลไทม์ |
| **บอท Discord โอเพนซอร์ส** เช่น `ai-dungeon-master` (samvoisin, ใช้ GPT-4 + LlamaIndex), `MoirAI` (Discord4J + GPT API), `ShoeGPT` (local-first, สถาปัตยกรรม 3 ส่วน: การเล่าเรื่อง + rules engine + orchestrator) | บอทควบคุม NPC, ฉาก, การต่อสู้ผ่านข้อความใน Discord | ฟรี/โอเพนซอร์ส (ผู้ใช้ต้องออกค่า API เอง) | พิสูจน์ว่าแนวคิด "AI DM" ทำเป็น prototype ได้ไม่ยากด้วย LLM API ทั่วไป แต่ไม่มี GUI กระดานเกม/แผนที่แบบเห็นภาพร่วมกัน เป็น text-only ใน Discord |
| **Charisma.ai** | แพลตฟอร์ม NPC เชิงบทสนทนาที่มีอารมณ์ ความจำ เป้าหมาย ใช้ทำเกม/สื่อ (ลูกค้ารวม Warner Bros, Sky, BBC) ไม่ใช่แอป D&D สำเร็จรูป แต่เป็น engine ให้ทีมอื่นเอาไปสร้าง | Starter ฟรี, Pro pay-as-you-go: 50,000 credit = $5, 200,000 = $20, 1,000,000 = $100, 5,000,000 = $500 (credit ใช้กับ event/text-to-speech/speech-to-text ฯลฯ) | ไม่ใช่คู่แข่งตรง แต่เป็นตัวอย่าง **infrastructure สำหรับ NPC dialogue engine** ที่อาจนำมาปรับใช้แทนการเรียก LLM ตรงๆ ถ้าต้องการ NPC ที่มีบุคลิก/ความจำลึกซึ้ง |

**ข้อสังเกตรวม:** แอป AI-DM ส่วนใหญ่แข่งกันที่ "ความจำ (memory)", "จำนวนเทิร์น/วัน", และ "เสียงพากย์" เป็นหลัก ยังไม่มีเจ้าไหนที่โฆษณาจุดขายด้าน **เอฟเฟกต์เสียง-ภาพแบบเกม/หนัง (ambience, SFX การต่อสู้, การทอยลูกเต๋า)** อย่างจริงจัง — นี่อาจเป็นจุดขายที่ทำให้โปรเจกต์นี้แตกต่าง

### 1.2 แพลตฟอร์ม Virtual Tabletop (VTT) ดั้งเดิม — real-time shared board

| แพลตฟอร์ม | จุดเด่น | ราคา | มี AI ไหม |
|---|---|---|---|
| **Roll20** | คลาวด์, เข้าถึงง่าย, มี free tier, character sheet + dynamic lighting (ฟีเจอร์ขั้นสูงต้อง Pro) | Free / Plus / Pro (subscription) | ไม่มี AI DM ในตัว |
| **Foundry VTT** | ซื้อขาด (one-time license) โฮสต์เอง ปรับแต่ง/automation ได้ลึกมากผ่าน module แต่ต้องเตรียมเนื้อหาเอง | ค่าไลเซนส์ครั้งเดียว (ไม่ subscription) | ไม่มี AI ในตัว (มี community module บางตัวที่เชื่อม AI ภายนอกได้) |
| **Fantasy Grounds** | VTT รุ่นเก่าแก่ เน้น automation กฎเกม | **เพิ่งประกาศเปลี่ยนเป็นฟรีทั้งหมดสำหรับผู้ใช้ (พ.ย. 2025)** | ไม่พบฟีเจอร์ AI เฉพาะ |
| **Owlbear Rodeo** | เรียบง่ายที่สุด ตั้งค่าได้ใน 1 นาที แสดงแผนที่ + เลื่อน token + ทอยเต๋า ไม่มี character sheet/automation | ฟรี (มี extension เสริมแบบเสียเงิน) | ไม่มี AI ในตัว |
| **Astral Tabletop** | Onboarding ดีที่สุดในกลุ่ม, เทมเพลตสำเร็จรูป, UI ใช้ง่ายกว่า Roll20 สำหรับมือใหม่ | Freemium | ไม่พบข้อมูล AI integration ชัดเจน |
| **D&D Beyond "Maps"** | VTT ในตัว D&D Beyond ดึงข้อมูล monster/แผนที่จากคลังของผู้ใช้ได้ตรง, ฟรีสำหรับโฮสต์เกมพื้นฐาน ปรับปรุงต่อเนื่องในปี 2026 | รวมอยู่ใน D&D Beyond (บางส่วนฟรี, หนังสือ/เนื้อหาต้องซื้อแยก) | ไม่มี AI DM — ยังต้องมีมนุษย์เป็น DM (มีข่าวลือเรื่อง "Project Sigil" ในอดีตแต่ยังไม่ใช่ AI-DM เต็มรูปแบบ) |

**สรุป Part 1.2:** กลุ่ม VTT ดั้งเดิมแข็งแกร่งด้าน "กระดานเกมเรียลไทม์ที่ทุกคนเห็นพร้อมกัน" (แผนที่, token, initiative tracker) ซึ่งเป็น pain point ที่แอป AI-DM ยุคใหม่ (LoreKeeper, Friends & Fables) กำลังพยายามไล่ตามแต่ยังไม่ลึกเท่า Foundry/Roll20 ในเรื่อง tactical combat grid ที่ซับซ้อน

### 1.3 ช่องว่างตลาด (Gap) ที่ไอเดียนี้อาจเติมเต็ม

1. **AI DM + Real-time synced board ระดับ VTT จริง** — Friends & Fables และ LoreKeeper เข้าใกล้ที่สุด แต่ทั้งคู่ยังอยู่ช่วง early-stage/มีข้อจำกัดเทิร์นต่อวัน และเน้นภาพ 2D แบบเรียบง่ายกว่า Foundry/Roll20
2. **เอฟเฟกต์เสียง-ภาพแบบดื่มด่ำ (ambience/SFX เต็มรูปแบบ)** — ยังไม่มีคู่แข่งรายใดชูจุดนี้เป็นจุดขายหลักชัดเจน เป็นโอกาสสร้างความแตกต่าง
3. **โมเดลราคาที่แข่งได้กับตลาดที่กระจายตัวมาก** ($0–$50/เดือน) ต้องคิดโครงสร้างที่คุ้มทั้งผู้เล่นเดี่ยวและกลุ่ม

---

## ส่วนที่ 2: ต้นทุนการพัฒนา/ดำเนินงานจริง (Cost & Build Considerations)

### 2.1 ต้นทุน LLM API (ตัวแปรใหญ่ที่สุด)

**Anthropic Claude (ก.ย. 2026):**
- Claude Sonnet 4.6: **$3 / $15 ต่อ 1 ล้าน token** (input/output)
- Claude Haiku 4.5: **$1 / $5 ต่อ 1 ล้าน token** — เหมาะกับงานเบา เช่น สรุปบริบท, ตรวจกฎง่ายๆ
- ลดต้นทุนได้ด้วย **Batch API (-50%)** และ **Prompt caching (-90% ของ input ที่ cache ไว้)** — สำคัญมากสำหรับ AI DM เพราะ "ประวัติแคมเปญ/กฎ D&D" เป็น context ยาวที่ซ้ำทุกเทิร์น ควร cache

**OpenAI (ก.ย. 2026):**
- GPT-6 Astra (flagship): $10 / $50 ต่อ 1 ล้าน token
- GPT-5.6 Sol: $4 / $20, GPT-5.6 Terra: $2 / $12, GPT-5.6 Luna (เล็กสุด): $0.20 / $1.20
- Cached input เหลือ 10% ของราคาปกติ, Batch API ลดครึ่งราคา

**ประมาณการต้นทุนต่อเซสชัน:** เซสชัน D&D 1 ครั้ง (~3 ชั่วโมง, บทสนทนา+ประวัติแคมเปญสะสม) อาจมี context หมุนเวียนรวมหลักแสน token ต่อเซสชัน (นับรวม prompt ประวัติที่ส่งซ้ำทุกเทิร์นถ้าไม่ cache) ถ้าใช้ Sonnet-class model และไม่ทำ caching อาจตกอยู่ที่ **$0.50–$3 ต่อเซสชันต่อกลุ่ม** แต่ถ้าใช้ prompt caching อย่างมีประสิทธิภาพ ลดลงได้เหลือเศษเสี้ยวของตัวเลขนี้ — แนะนำให้ทำ cost modeling จริงก่อน launch เพราะ "ประวัติแคมเปญที่ยาวขึ้นเรื่อยๆ" คือความเสี่ยงต้นทุนสำคัญของโปรดักต์นี้ (คล้ายที่ AI Dungeon ต้อง cap context ตามแพ็กราคา 1,000–8,000 token)

**ข้อแนะนำเชิงสถาปัตยกรรม:** ใช้โมเดลเล็ก/ถูก (Haiku, GPT-5.6 Luna) สำหรับงานย่อย (เช่น จัดฟอร์แมต, สรุปความจำ, ตรวจกฎ) และโมเดลใหญ่เฉพาะตอนเล่าเรื่อง/ตัดสินใจสำคัญ — เป็นแนวทางที่ AI Dungeon/Friends & Fables ใช้ (mix ของโมเดลตามระดับแพ็ก)

### 2.2 Real-time Sync / Multiplayer Infrastructure

| บริการ | โมเดลราคา | หมายเหตุ |
|---|---|---|
| **Supabase Realtime** | รวมอยู่ในแพ็ก Free/Pro/Team/Enterprise ปกติ ส่วนเกินคิด **$2.50 ต่อ 1 ล้านข้อความ** + **$10 ต่อ 1,000 concurrent connection ที่พีค** | Free tier ให้ 200 concurrent connections — ระวัง "fan-out": เขียน DB 1 ครั้งแต่ broadcast ไป 500 client = นับ 500 ข้อความ ต้องคำนวณตามขนาดปาร์ตี้ (ปกติ D&D กลุ่มละ 4-6 คน จึงไม่แพงมากในสเกลเล็ก) |
| **Firebase (Firestore + Realtime DB)** | Spark (ฟรี): 50,000 reads/20,000 writes ต่อวัน, 1GB เก็บข้อมูล / Blaze (pay-as-you-go): $0.06/100k reads, $0.18/100k writes, $0.18/GiB/เดือน เก็บข้อมูล, ดาวน์โหลดข้อมูล $1/GB | เหมาะกับ MVP เล็ก, ต้นทุนไม่แพงถ้าโหลดไม่สูง แต่ scale ใหญ่ต้องระวัง cost ของ read/write ที่ถี่ (เช่น token เคลื่อนที่บนแผนที่) |
| **Pusher Channels** | เริ่มต้น $49/เดือน, free tier 200K ข้อความ/วัน + 200 concurrent connections (จำกัดรายวัน) | ราคาคงที่ตามระดับ ง่ายต่อการประเมินงบ เหมาะกับสเกลกลาง (<30 ล้านข้อความ/เดือน) |
| **Ably** | เริ่มต้น ~$49.99/เดือน, free tier 6 ล้านข้อความ/เดือน (นับเป็นรายเดือนไม่ใช่รายวัน) คิดตาม usage (message + connection-minutes) | คุ้มกว่าตอน scale ใหญ่/ต้องการ guaranteed delivery |
| **Socket.io + self-host** | ไม่มีค่าบริการเอง แต่ต้องรวมกับค่า VPS/hosting และดูแล scaling เอง (sticky session, Redis adapter สำหรับ multi-instance) | ประหยัดสุดถ้าทีมมีความสามารถ DevOps แต่แรงงานสูงกว่า managed service |

**ข้อแนะนำ:** เริ่มต้นด้วย **Supabase** (เพราะได้ Postgres + Auth + Realtime + Storage ในที่เดียว เหมาะกับทีมเล็ก) แล้วค่อยพิจารณา Ably/Pusher เมื่อ scale ใหญ่ขึ้นและต้องการความน่าเชื่อถือสูงขึ้น

### 2.3 Text-to-Speech (TTS) สำหรับการบรรยายแบบมีเสียง (optional แต่ช่วยเพิ่มความดื่มด่ำ)

**ElevenLabs (ก.ย. 2026):**
- แพ็กสมาชิก: Free $0 (10,000 credit/เดือน ~20 นาทีเสียง) → Starter $6 → Creator $22 → Pro $99 → Scale $299 → Business $990/เดือน (สูงสุด ~366 ชม./เดือน)
- ราคาต่อการใช้งานจริง (API pay-as-you-go): Text-to-Speech **$0.10/1,000 ตัวอักษร** (โมเดลหลายภาษา) หรือ **$0.05/1,000 ตัวอักษร** (Flash/Turbo ที่เร็ว/ถูกกว่า) — เหมาะกับงานบรรยายสดที่ต้องการ latency ต่ำ
- Sound Effects (ของ ElevenLabs เอง, generative): **$0.12/นาที**
- ต้องใช้แพ็กเสียเงิน (Starter ขึ้นไป) เพื่อได้สิทธิ์เชิงพาณิชย์

**ข้อแนะนำ:** TTS ควรทำเป็นฟีเจอร์ optional/premium เนื่องจากต้นทุนต่อคำบรรยายค่อนข้างสูงเมื่อเทียบกับ text — ถ้า DM พิมพ์บรรยายยาวทุกเทิร์น ต้นทุนเสียงจะแซง LLM cost ได้ง่าย ควร cache เสียงที่ซ้ำ (เช่น ambience วนลูป) แทนการ generate ใหม่ทุกครั้ง

### 2.4 Sound Effects / Music สำหรับบรรยากาศ

- มีตัวเลือก **ฟรี/ royalty-free ที่ใช้ได้ในเชิงพาณิชย์**จำนวนมาก: **Tabletop Audio** (ambience/soundscape วนลูปสำหรับป่า/ผับ/ยาน ทำมาเพื่อ TTRPG โดยเฉพาะ), **Pixabay** (SFX/เพลงจำนวนมาก ใบอนุญาตคล้าย CC0), **Sonniss GameAudioGDC** (SFX คุณภาพสูงแจกฟรีปีละครั้ง ใช้เชิงพาณิชย์ได้ไม่ต้อง attribution)
- ตัวเลือกแบบ API สำหรับดึงเสียงแบบโปรแกรม: **Lots of Sounds** (API, สัญญาอนุญาต CC0, ใช้ในแอป/เกม AI ได้เลย), **Soundstripe API** (เพลงกว่า 116,000 เพลง คิดค่าบริการ, license เคลียร์ผ่าน API)
- **ข้อควรระวังเรื่องลิขสิทธิ์:** ต้องตรวจสอบใบอนุญาตแต่ละไฟล์ให้ครอบคลุม "การใช้ในผลิตภัณฑ์ที่จำหน่าย/มีผู้ใช้จำนวนมาก" ไม่ใช่แค่ personal use — แนะนำเริ่มจากคลังฟรีที่ระบุชัดว่าใช้เชิงพาณิชย์ได้ (Tabletop Audio, Sonniss, Pixabay) ก่อนพิจารณาสมัคร Soundstripe เมื่อธุรกิจโตขึ้น

### 2.5 Hosting / Backend

| ตัวเลือก | ราคาโดยประมาณ | เหมาะกับ |
|---|---|---|
| **DigitalOcean Droplet/App Platform** | Droplet เริ่ม ~$4/เดือน, App Platform เริ่ม ~$5/เดือน (container 1vCPU/2GB ~$25/เดือน) + Managed Postgres $7+/เดือน | งบจำกัด, ทีมที่ต้องการควบคุม infra เอง |
| **Render** | Web service มาตรฐาน 1vCPU/2GB ~$25/เดือน, Pro workspace $25/เดือน + compute, มี managed Postgres ในตัว | ทีมที่ต้องการ deploy ง่าย ราคาชัดเจนคงที่ |
| **Railway** | Free (เครดิต $1/เดือน), Hobby $5/เดือน, Pro $20/เดือน (คิดตาม CPU/memory ใช้จริงเป็นวินาที scale เป็น 0 ได้เมื่อ idle) | MVP/prototype ที่ทราฟฟิกไม่แน่นอน ประหยัดช่วงเริ่มต้น |
| **Serverless (Vercel/Cloudflare Workers + Supabase)** | จ่ายตามการใช้งานจริง มักมี free tier กว้าง | เหมาะกับ frontend + API แบบ stateless, แต่ WebSocket persistent connection อาจไม่เหมาะกับบาง serverless platform (ต้องเช็ครองรับ WebSocket ระยะยาว) |

**ข้อแนะนำ:** เริ่มต้นด้วย Railway หรือ Render (งบ ~$25-50/เดือนสำหรับ backend+DB) ร่วมกับ Supabase สำหรับ realtime+DB จะคุมงบง่ายสุดสำหรับทีมเล็ก/solo dev ในช่วง MVP

### 2.6 ต้นทุนอื่นๆ ที่ควรตั้งงบ (สำหรับทีมเล็ก/Solo dev)

- **โดเมนเนม**: ~$10-20/ปี
- **พื้นที่เก็บไฟล์แผนที่/asset ภาพ** (แผนที่, token, ภาพตัวละครที่ AI สร้าง): ใช้ Supabase Storage หรือ Cloudflare R2/S3 (ราคาต่ำ, R2 ไม่คิดค่า egress ซึ่งดีสำหรับแอปที่โหลดภาพแผนที่บ่อย)
- **ฐานข้อมูล** (แยกจาก realtime): มักรวมอยู่ใน Supabase/Firebase plan อยู่แล้ว แต่ถ้าข้อมูลแคมเปญ/ประวัติแชทสะสมมาก ต้องคำนวณค่าจัดเก็บระยะยาวเพิ่ม
- **บริการสร้างภาพ (AI image generation)** หากต้องการสร้างภาพฉาก/มอนสเตอร์ ให้ตั้งงบแยก (คู่แข่งหลายรายเช่น AI Dungeon คิดเป็น "image credit" แยกจาก token ข้อความ)
- **ค่า monitoring/error tracking** (เช่น Sentry) และ **อีเมล/ระบบแจ้งเตือน** — มักมี free tier เพียงพอสำหรับช่วงเริ่มต้น
- **ค่าใบอนุญาตเนื้อหา D&D**: หากใช้กฎ/เนื้อหา D&D 5e จริง ต้องตรวจสอบ **Open Game License (OGL) / ORC License / D&D 5e SRD** ว่าเนื้อหาที่ใช้ (มอนสเตอร์, สเปล) อยู่ในขอบเขตที่แจกจ่ายได้ฟรีหรือไม่ — เป็นต้นทุน "ความเสี่ยงทางกฎหมาย" มากกว่าต้นทุนเงินสด แต่สำคัญมากถ้าจะทำเชิงพาณิชย์

---

## แหล่งอ้างอิง (Sources)

**ตลาด/คู่แข่ง:**
- [5 AI Dungeon Master Games You Need to Play in 2026 – Weekend](https://www.weekend.com/post/ai-dungeon-master)
- [Best AI Dungeon Master Tools for D&D 2026](https://aidungeonmaster.ai/blog/best-ai-dungeon-masters-2026/)
- [Best AI Dungeon Master Tools 2026 – RoleForge Blog](https://roleforge.ai/blog/best-ai-game-master-tools-compared/)
- [AI Realm](https://airealm.com/)
- [Charisma AI Reviews: Use Cases, Pricing & Alternatives – Futurepedia](https://www.futurepedia.io/tool/charisma)
- [AI Dungeon – Wikipedia](https://en.wikipedia.org/wiki/AI_Dungeon)
- [Foundry VTT vs. Roll20 vs. Owlbear Rodeo 2026 – GM Craft Tavern](https://gmcrafttavern.com/foundry-vs-roll20-owlbear-2026/)
- [VTT Platforms Compared 2026 – RPG Builder](https://rpgbuilder.ai/guides/vtt-platforms-compared)
- [AI Dungeon Pricing & Free Tier 2026 – uragent](https://uragent.org/tools/ai_dungeon/)
- [Memberships & Benefits – AI Dungeon Help](https://help.aidungeon.com/memberships-benefits)
- [GitHub – samvoisin/ai-dungeon-master](https://github.com/samvoisin/ai-dungeon-master)
- [Friends And Fables Reviews 2026 – seofai](https://seofai.com/tool/friends-and-fables/)
- [Friends and Fables Review 2026 – Dungeons Deep](https://dungeonsdeep.ai/blog/friends-and-fables-review-2026)
- [LOREKEEPER – AI-Powered Virtual Tabletop RPG](https://lore-keeper.com/en/features)
- [What Is LOREKEEPER? – Help Center](https://help.lore-keeper.com/getting-started/what-is-lorekeeper)
- [D&D Beyond – Wikipedia](https://en.wikipedia.org/wiki/D&D_Beyond)
- [Maps – D&D Virtual Tabletop – D&D Beyond](https://www.dndbeyond.com/games)
- [Fantasy Grounds Is Going Free To Play – EN World](https://www.enworld.org/threads/fantasy-grounds-is-going-free-to-play.716127/)
- [AI Game Master Pricing – RoleForge](https://roleforge.ai/pricing/)
- [4 Best AI Realm Alternatives, July 2026 – Dungeons Deep](https://dungeonsdeep.ai/blog/the-best-ai-realm-alternatives-in-2026)

**ต้นทุน/โครงสร้างราคา:**
- [Claude pricing in 2026 – CloudZero](https://www.cloudzero.com/blog/claude-pricing/)
- [Claude API Pricing 2026 – SiliconData](https://www.silicondata.com/use-cases/anthropic-claude-api-pricing-2026)
- [OpenAI Pricing in 2026 – Finout](https://www.finout.io/blog/openai-pricing-in-2026)
- [Pricing – OpenAI API](https://developers.openai.com/api/docs/pricing)
- [Realtime Pricing – Supabase Docs](https://supabase.com/docs/guides/realtime/pricing)
- [Supabase Pricing in 2026 – UI Bakery Blog](https://uibakery.io/blog/supabase-pricing)
- [Compare Ably vs Pusher on pricing, plans, and limits](https://ably.com/topic/pusher-pricing)
- [Realtime & WebSocket Pricing (July 2026) – buildmvpfast](https://www.buildmvpfast.com/api-costs/realtime)
- [Google Firebase Pricing Explained (2026) – back4app](https://blog.back4app.com/firebase-pricing/)
- [Firebase Pricing – Google](https://firebase.google.com/pricing)
- [ElevenLabs Pricing (2026) – BIGVU](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- [ElevenAPI Pricing – ElevenLabs](https://elevenlabs.io/pricing/api)
- [Free Sound Effects and Music for Games (2026) – Cinevva](https://app.cinevva.com/guides/free-sound-effects-music)
- [Lots of Sounds – Sound Effect API for Developers & AI Agents](https://www.lotsofsounds.com/)
- [Top 20 Free SFX and Music Libraries for Game Developers (2026) – Gamineai](https://www.gamineai.com/blog/top-20-free-sfx-music-libraries-game-developers-2026-edition)
- [Railway vs DigitalOcean App Platform 2026 – Render](https://render.com/articles/railway-vs-digitalocean-app-platform-pricing-reliability-production-risk)
- [Railway | Review, Pricing & Alternatives – getdeploying](https://getdeploying.com/railway)
- [DigitalOcean vs Render 2026 – getdeploying](https://getdeploying.com/digitalocean-vs-render)

---

*หมายเหตุ: ราคาทั้งหมดเป็นข้อมูล ณ เดือนกันยายน 2026 จากการค้นหาเว็บ อาจเปลี่ยนแปลงได้ ควรตรวจสอบหน้าราคาทางการของแต่ละบริการอีกครั้งก่อนตัดสินใจจริง*

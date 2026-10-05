# D&D AI DM

เว็บแอปเล่น D&D แบบหลายผู้เล่น โดยมี AI (Google Gemini) ทำหน้าที่เป็น Dungeon Master เล่าเรื่องและตัดสินผลการกระทำของผู้เล่นแต่ละคนเป็นภาษาไทย ตามเนื้อเรื่องที่เลือกไว้

Repo: https://github.com/c3b22/dnd-ai-dm

## ฟีเจอร์หลัก

- **สร้าง/เข้าร่วมแคมเปญ** — ผู้เล่นคนแรกสร้างห้อง เลือกเนื้อเรื่อง ตั้งชื่อตัวละคร และเลือกอาวุธเริ่มต้น ผู้เล่นคนอื่นเข้าร่วมด้วยรหัสห้อง 6 หลัก
- **AI Dungeon Master** — บรรยายฉาก ตอบสนองต่อการกระทำของผู้เล่น และคุมเกมให้อยู่ในกรอบเนื้อเรื่อง (`src/lib/ai`)
- **เนื้อเรื่องผจญภัย (Adventures)** — โครงเรื่องพร้อม hook, acts, NPC และความลับสำหรับ DM เท่านั้น ไม่ใช่สคริปต์ตายตัว ปรับตามการตัดสินใจของผู้เล่น (`src/lib/adventures`)
- **ภาพฉาก (Scenes)** — ภาพประกอบแต่ละจุดในเนื้อเรื่อง พร้อมสีโทน (mood tint) เฉพาะของแต่ละแคมเปญ (`src/lib/scenes`, `public/scenes`)
- **ระบบเทิร์น/รอบ (Round)** — ลำดับผู้เล่น, ทอยเต๋า, คำนวณ HP/สถานะอย่างเป็น atomic ต่อรอบ (`src/lib/round`)
- **ตัวละครและไอเท็ม** — เลือกอาวุธ, คลังไอเท็ม, สถานะตัวละคร (`src/lib/character`, `src/lib/inventory`)
- **ระบบเศรษฐกิจ** — ทอง, ร้านค้าในเกม, การเทรดระหว่างผู้เล่น (`src/lib/economy`)
- **เต๋า 3D** — แอนิเมชันทอยเต๋าด้วย `@3d-dice/dice-box`

## เทคโนโลยีที่ใช้

- [Next.js 15](https://nextjs.org/) (App Router) + React 19 + TypeScript
- [Vercel AI SDK](https://sdk.vercel.ai/) กับ Google Gemini (`@ai-sdk/google`)
- [Supabase](https://supabase.com/) — ฐานข้อมูล, auth (ผู้เล่นแบบ anonymous), realtime
- [Vitest](https://vitest.dev/) + Testing Library สำหรับเทสต์
- `@3d-dice/dice-box` สำหรับแอนิเมชันเต๋า

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมีก่อน

- Node.js 20+
- โปรเจกต์ Supabase (ฟรีก็ใช้ได้) พร้อม service role key
- Google Generative AI API key (สำหรับ Gemini)

### ติดตั้ง

```bash
npm install
cp .env.local.example .env.local
```

กรอกค่าใน `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

### ตั้งค่าฐานข้อมูล

รัน migration ทั้งหมดใน `supabase/migrations/` กับโปรเจกต์ Supabase ของคุณ (ผ่าน Supabase CLI หรือ SQL editor) ตามลำดับเลขไฟล์

### รันเซิร์ฟเวอร์

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## คำสั่งที่มี

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | รันเซิร์ฟเวอร์พัฒนา |
| `npm run build` | build สำหรับ production |
| `npm run start` | รันเซิร์ฟเวอร์ production (ต้อง build ก่อน) |
| `npm test` | รันเทสต์ทั้งหมดด้วย Vitest |

## โครงสร้างโปรเจกต์ (คร่าวๆ)

```
src/
  app/            Next.js routes (หน้าเว็บ + API)
    api/          API routes: campaigns, round, trades, shop ฯลฯ
    campaign/     หน้าเล่นเกมของแต่ละแคมเปญ
    join/         หน้าเข้าร่วมห้องด้วยรหัส
  components/     React components (UI)
  lib/
    adventures/   โครงเรื่องผจญภัยทั้งหมด
    ai/           ส่วนเชื่อมต่อ AI Dungeon Master
    campaign/     การสร้าง/เข้าร่วม/จัดการแคมเปญ
    character/    ตัวละครและอาวุธ
    economy/      ทอง ร้านค้า การเทรด
    inventory/    คลังไอเท็ม
    round/        ระบบเทิร์น/รอบ และ HP
    scenes/        แคตตาล็อกภาพฉากและสีโทน
    supabase/      ไคลเอนต์ Supabase
supabase/migrations/   SQL migration ของฐานข้อมูล
public/scenes/         ไฟล์ภาพฉากที่ใช้แสดงในเกม
scripts/               สคริปต์ช่วยจัดการภาพฉาก
docs/                  เอกสารเสริม (เช่น prompt สำหรับภาพฉาก)
```

## การเพิ่มเนื้อเรื่องผจญภัยใหม่

1. เพิ่มข้อมูลเรื่องใหม่ใน `src/lib/adventures/adventures.ts` (title, tagline, hook, acts, npcs, secret — ทั้งไทยและอังกฤษ)
2. เพิ่มฉากของเรื่องนั้นใน `src/lib/scenes/catalog.json` (scene prompt + `adventureLook` + เข้าไปใน `adventureScenes`)
3. ใส่สีโทน (mood tint) ของเรื่องใน `MOOD_TINT` ที่ `src/lib/scenes/scenes.ts`
4. สร้างภาพประกอบแต่ละฉากไว้ที่ `public/scenes/<scene-id>.jpg` — จะสร้างด้วยมือ หรือใช้ `scripts/generate-scenes.mjs` (ต้องมี Gemini image API ที่เปิด billing) ก็ได้ ส่วน `scripts/import-scene.mjs` ใช้ย่อ/แปลงไฟล์ภาพที่มีอยู่แล้วให้เข้าขนาดมาตรฐานของเว็บ

## การทดสอบ

```bash
npm test
```

เทสต์ครอบคลุม component หลักและ logic ฝั่ง `src/lib` (round, economy, campaign ฯลฯ) ด้วย Vitest + Testing Library

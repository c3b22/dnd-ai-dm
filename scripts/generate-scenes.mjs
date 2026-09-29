// Scene backdrops shown at the top of the table view. The catalog lives in src/lib/scenes/catalog.json.
//
//   node scripts/generate-scenes.mjs --prompts
//       Writes docs/scene-prompts.md: copy-paste prompts for any image tool.
//   node --env-file=.env.local scripts/generate-scenes.mjs [--only <id>[,<id>]] [--force]
//       Generates the images with the Gemini image API (needs billing enabled on the key).
//
// Images go to public/scenes/<id>.jpg; existing files are skipped unless --force.
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const catalog = JSON.parse(await readFile(new URL('../src/lib/scenes/catalog.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);

function fullPrompt(scene) {
  const look = scene.scope === 'generic' ? catalog.genericLook : catalog.adventureLook[scene.scope];
  return `${scene.prompt}\n${look}\n${catalog.styleGuide}`;
}

if (args.includes('--prompts')) {
  const scopeTitle = { generic: 'ฉากทั่วไป (ใช้ซ้ำได้ทุกเรื่อง)', 'sunken-bell-of-marrowmere': 'ระฆังจมแห่งมาร์โรว์เมียร์', 'the-wolf-king-of-ashenfell': 'ราชาหมาป่าแห่งแอชเชนเฟลล์', 'the-thousand-doors-market': 'ตลาดพันประตู', 'crown-of-the-sunken-king': 'มงกุฎกษัตริย์ผู้จมสู่ใต้ดิน' };
  const lines = [
    '# Scene image prompts', '',
    'สร้างจาก `src/lib/scenes/catalog.json` (รันใหม่: `node scripts/generate-scenes.mjs --prompts`)', '',
    '## วิธีใช้', '',
    '1. คัดลอก prompt ของแต่ละภาพไปใส่ในเครื่องมือสร้างภาพที่คุณใช้',
    '2. เลือกอัตราส่วนกว้าง 21:9 ถ้าทำได้ (16:9 ก็ได้ ระบบครอบตัดเป็นแถบกว้างเอง)',
    '3. บันทึกไฟล์เป็น JPG ตั้งชื่อตาม id ใส่ในโฟลเดอร์ `public/scenes/` เช่น `public/scenes/tavern-interior.jpg` (ความกว้างประมาณ 1600 px, ไม่เกิน ~400 KB)',
    '4. ฉากทั่วไปทำครั้งเดียวใช้ได้ทุกเรื่อง ฉากไหนยังไม่มีไฟล์ จะใช้ภาพร่างที่วาดเองแทน (ตามที่ทำไว้ในต้นแบบ ยังไม่ได้ต่อเข้าแอปจริง)', '',
    '**เคล็ดลับให้สไตล์ตรงกัน:** ใช้เครื่องมือและโมเดลเดียวกันทั้งชุด สร้างฉากทั่วไปก่อน แล้วค่อยทำฉากของแต่ละเรื่องทีละเรื่อง', ''];
  for (const scope of ['generic', 'sunken-bell-of-marrowmere', 'the-wolf-king-of-ashenfell', 'the-thousand-doors-market', 'crown-of-the-sunken-king']) {
    lines.push(`## ${scopeTitle[scope]}`, '');
    for (const s of catalog.scenes.filter((x) => x.scope === scope)) {
      lines.push(`### ${s.id} · ${s.nameTh}`, '', '```text', fullPrompt(s), '```', '');
    }
  }
  await mkdir('docs', { recursive: true });
  await writeFile('docs/scene-prompts.md', lines.join('\n'), 'utf8');
  console.log(`wrote docs/scene-prompts.md (${catalog.scenes.length} prompts)`);
  process.exit(0);
}

const { default: sharp } = await import('sharp');
const MODEL = process.env.SCENE_IMAGE_MODEL ?? 'gemini-3.1-flash-lite-image';
const KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set (run with --env-file=.env.local)');

const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const force = args.includes('--force');
const outDir = path.resolve('public/scenes');
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function generate(scene) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt(scene) }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '21:9' } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${body.error?.message ?? JSON.stringify(body).slice(0, 300)}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const data = (part?.inlineData ?? part?.inline_data)?.data;
  if (!data) throw new Error(`no image in response: ${JSON.stringify(body).slice(0, 300)}`);
  return Buffer.from(data, 'base64');
}

await mkdir(outDir, { recursive: true });
for (const scene of catalog.scenes) {
  if (only && !only.has(scene.id)) continue;
  const file = path.join(outDir, `${scene.id}.jpg`);
  if (!force && (await exists(file))) { console.log(`skip ${scene.id} (exists)`); continue; }
  try {
    const jpg = await sharp(await generate(scene)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    await writeFile(file, jpg);
    console.log(`ok   ${scene.id}  ${(jpg.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(`FAIL ${scene.id}: ${e.message}`);
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(e.message)) break;
  }
}

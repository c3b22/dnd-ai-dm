// Usage: node scripts/import-scene.mjs <source image> <scene id>
// Resizes to 1600px wide and saves as public/scenes/<id>.jpg.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const [src, id] = process.argv.slice(2);
if (!src || !id) throw new Error('usage: node scripts/import-scene.mjs <source> <id>');
await mkdir('public/scenes', { recursive: true });
const meta = await sharp(src).metadata();
const out = `public/scenes/${id}.jpg`;
const info = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(out);
console.log(`${id}: ${meta.width}x${meta.height} -> ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);

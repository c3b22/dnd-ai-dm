// Resizes an uploaded scene image and stores it in the adventure-scenes
// bucket, then records the resulting public URL on the adventure's scenes.

import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { CustomAdventureError } from './customAdventures';

export async function resizeSceneImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadSceneImage(
  supabase: SupabaseClient,
  params: { adventureId: string; key: string; ownerId: string; file: File }
): Promise<string> {
  const { adventureId, key, ownerId, file } = params;
  if (!file.type.startsWith('image/')) throw new CustomAdventureError('file must be an image', 400);
  if (file.size > MAX_BYTES) throw new CustomAdventureError('file is too large (max 5MB)', 400);

  const { data: row } = await supabase
    .from('custom_adventures')
    .select('owner_id, scenes')
    .eq('id', adventureId)
    .maybeSingle();
  if (!row) throw new CustomAdventureError('adventure not found', 404);
  if (row.owner_id !== ownerId) throw new CustomAdventureError('not the owner', 403);
  const scenes = row.scenes as { key: string; nameTh: string; imagePath: string | null }[];
  if (!scenes.some((s) => s.key === key)) throw new CustomAdventureError('unknown scene key', 400);

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let resized: Buffer;
  try {
    resized = await resizeSceneImage(inputBuffer);
  } catch {
    throw new CustomAdventureError('invalid image data', 400);
  }

  const path = `${adventureId}/${key}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('adventure-scenes')
    .upload(path, resized, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('adventure-scenes').getPublicUrl(path);
  const newScenes = scenes.map((s) => (s.key === key ? { ...s, imagePath: publicUrl } : s));
  await supabase.from('custom_adventures').update({ scenes: newScenes }).eq('id', adventureId);

  return publicUrl;
}

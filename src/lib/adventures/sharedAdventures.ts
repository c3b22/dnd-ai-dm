// Read-only preview of a shared custom adventure (by share code) and import of
// it as an independent copy owned by the importing user.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapCustomAdventureRow, type Adventure } from './adventures';
import { CustomAdventureError, type CustomScene } from './customAdventures';

const BUCKET = 'adventure-scenes';

export interface SharedAdventurePreview {
  title: string;
  titleTh: string;
  tagline: string;
  taglineTh: string;
  tone: string;
  toneTh: string;
  setting: string;
  hook: string;
  openingTh: string;
  actCount: number;
  npcCount: number;
  hasOpeningImage: boolean;
}

async function getSharedRowOrThrow(supabase: SupabaseClient, code: string): Promise<any> {
  const { data: row, error } = await supabase
    .from('custom_adventures')
    .select('*')
    .eq('share_code', code)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new CustomAdventureError('shared adventure not found', 404);
  return row;
}

/** Safe fields only: the DM `secret` is deliberately never returned. */
export async function getSharedAdventurePreview(
  supabase: SupabaseClient,
  code: string
): Promise<SharedAdventurePreview> {
  const row = await getSharedRowOrThrow(supabase, code);
  const scenes: CustomScene[] = row.scenes ?? [];
  return {
    title: row.title,
    titleTh: row.title_th,
    tagline: row.tagline,
    taglineTh: row.tagline_th,
    tone: row.tone,
    toneTh: row.tone_th,
    setting: row.setting,
    hook: row.hook,
    openingTh: row.opening_th,
    actCount: row.acts?.length ?? 0,
    npcCount: row.npcs?.length ?? 0,
    hasOpeningImage: !!scenes.find((s) => s.key === 'opening')?.imagePath,
  };
}

/** Storage path of an object from its public URL (drops the cache-bust query). */
function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  return path || null;
}

/** Copies the shared adventure (secret included, share_code not) into a new row
 * owned by `userId`. Scene images are copied best effort; a failed copy leaves
 * that scene's imagePath null. */
export async function importSharedAdventure(
  supabase: SupabaseClient,
  code: string,
  userId: string
): Promise<Adventure & { scenes: CustomScene[] }> {
  const source = await getSharedRowOrThrow(supabase, code);
  if (source.owner_id === userId) {
    throw new CustomAdventureError('cannot import your own adventure', 400);
  }

  const sourceScenes: CustomScene[] = source.scenes ?? [];
  const { data: created, error } = await supabase
    .from('custom_adventures')
    .insert({
      title: source.title,
      title_th: source.title_th,
      tagline: source.tagline,
      tagline_th: source.tagline_th,
      tone: source.tone,
      tone_th: source.tone_th,
      setting: source.setting,
      hook: source.hook,
      opening_th: source.opening_th,
      secret: source.secret,
      acts: source.acts,
      npcs: source.npcs,
      scenes: sourceScenes.map((s) => ({ ...s, imagePath: null })),
      owner_id: userId,
    })
    .select()
    .single();
  if (error) throw error;

  const newId: string = created.id;
  const scenes: CustomScene[] = [];
  let anyImage = false;
  for (const scene of sourceScenes) {
    let imagePath: string | null = null;
    const from = scene.imagePath ? storagePathFromUrl(scene.imagePath) : null;
    if (from) {
      try {
        const to = `${newId}/${scene.key}.jpg`;
        const { error: copyError } = await supabase.storage.from(BUCKET).copy(from, to);
        if (!copyError) {
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(to);
          imagePath = `${data.publicUrl}?v=${Date.now()}`;
          anyImage = true;
        }
      } catch {
        imagePath = null;
      }
    }
    scenes.push({ ...scene, imagePath });
  }
  if (!anyImage) return { ...mapCustomAdventureRow(created), scenes: created.scenes };

  const { data: updated, error: updateError } = await supabase
    .from('custom_adventures')
    .update({ scenes })
    .eq('id', newId)
    .select()
    .single();
  if (updateError) throw updateError;
  return { ...mapCustomAdventureRow(updated), scenes: updated.scenes };
}

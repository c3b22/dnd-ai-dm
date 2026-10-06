// Validation and CRUD for user-authored "custom adventures" (text fields +
// derived scene list). Storage uploads for scene images are handled elsewhere;
// this module only manages the custom_adventures row and the adventure-scenes
// storage folder's deletion on adventure delete.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapCustomAdventureRow, type Adventure } from './adventures';

export class CustomAdventureError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404
  ) {
    super(message);
  }
}

export interface CustomScene {
  key: string;
  nameTh: string;
  imagePath: string | null;
}

export interface CustomAdventureInput {
  title: string;
  titleTh: string;
  tagline: string;
  taglineTh: string;
  tone: string;
  toneTh: string;
  setting: string;
  hook: string;
  openingTh: string;
  secret: string;
  acts: string[];
  npcs: { name: string; role: string }[];
}

const REQUIRED_STRING_FIELDS: (keyof CustomAdventureInput)[] = [
  'title', 'titleTh', 'tagline', 'taglineTh', 'tone', 'toneTh',
  'setting', 'hook', 'openingTh', 'secret',
];

/** Builds the full scene list (opening + one per act), carrying over any
 * uploaded image path for a key that still exists and dropping keys for
 * removed acts. */
export function deriveScenes(acts: string[], existing: CustomScene[] = []): CustomScene[] {
  const imageByKey = new Map(existing.map((s) => [s.key, s.imagePath]));
  const keys = ['opening', ...acts.map((_, i) => `act-${i + 1}`)];
  return keys.map((key, i) => ({
    key,
    nameTh: i === 0 ? 'ภาพเปิดเรื่อง' : `ภาพองก์ที่ ${i}`,
    imagePath: imageByKey.get(key) ?? null,
  }));
}

export function validateCustomAdventureInput(input: Partial<CustomAdventureInput>): string | null {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return `${field} is required`;
    }
  }

  if (!Array.isArray(input.acts) || input.acts.length === 0) {
    return 'acts must have at least one entry';
  }
  if (input.acts.some((act) => typeof act !== 'string' || act.trim() === '')) {
    return 'acts must not contain a blank entry';
  }

  if (input.npcs !== undefined) {
    if (!Array.isArray(input.npcs)) {
      return 'npcs must be an array';
    }
    for (const npc of input.npcs) {
      const nameFilled = typeof npc.name === 'string' && npc.name.trim() !== '';
      const roleFilled = typeof npc.role === 'string' && npc.role.trim() !== '';
      if (nameFilled !== roleFilled) {
        return 'each npc needs both a name and a role';
      }
    }
  }

  return null;
}

function toScalarColumns(input: CustomAdventureInput) {
  return {
    title: input.title,
    title_th: input.titleTh,
    tagline: input.tagline,
    tagline_th: input.taglineTh,
    tone: input.tone,
    tone_th: input.toneTh,
    setting: input.setting,
    hook: input.hook,
    opening_th: input.openingTh,
    secret: input.secret,
  };
}

async function getOwnedRowOrThrow(
  supabase: SupabaseClient,
  id: string,
  ownerId: string
): Promise<{ owner_id: string; scenes: CustomScene[] }> {
  const { data: row } = await supabase
    .from('custom_adventures')
    .select('owner_id, scenes')
    .eq('id', id)
    .maybeSingle();

  if (!row) {
    throw new CustomAdventureError('adventure not found', 404);
  }
  if (row.owner_id !== ownerId) {
    throw new CustomAdventureError('not the owner', 403);
  }
  return row;
}

export async function createCustomAdventure(
  supabase: SupabaseClient,
  ownerId: string,
  input: CustomAdventureInput
): Promise<Adventure & { scenes: CustomScene[] }> {
  const { data: row, error } = await supabase
    .from('custom_adventures')
    .insert({
      ...toScalarColumns(input),
      acts: input.acts,
      npcs: input.npcs,
      scenes: deriveScenes(input.acts),
      owner_id: ownerId,
    })
    .select()
    .single();
  if (error) throw error;

  return { ...mapCustomAdventureRow(row), scenes: row.scenes };
}

export async function updateCustomAdventure(
  supabase: SupabaseClient,
  id: string,
  ownerId: string,
  input: CustomAdventureInput
): Promise<Adventure & { scenes: CustomScene[] }> {
  const existingRow = await getOwnedRowOrThrow(supabase, id, ownerId);

  const { data: row, error } = await supabase
    .from('custom_adventures')
    .update({
      ...toScalarColumns(input),
      acts: input.acts,
      npcs: input.npcs,
      scenes: deriveScenes(input.acts, existingRow.scenes),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  return { ...mapCustomAdventureRow(row), scenes: row.scenes };
}

export async function deleteCustomAdventure(
  supabase: SupabaseClient,
  id: string,
  ownerId: string
): Promise<void> {
  await getOwnedRowOrThrow(supabase, id, ownerId);

  const { data: entries, error: listError } = await supabase.storage.from('adventure-scenes').list(id);
  if (listError) throw listError;
  if (entries && entries.length > 0) {
    const { error: removeError } = await supabase
      .storage.from('adventure-scenes')
      .remove(entries.map((e: { name: string }) => `${id}/${e.name}`));
    if (removeError) throw removeError;
  }

  const { error } = await supabase.from('custom_adventures').delete().eq('id', id);
  if (error) throw error;
}

export async function listMyCustomAdventures(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ id: string; titleTh: string; taglineTh: string; thumbnailUrl: string | null }[]> {
  const { data, error } = await supabase
    .from('custom_adventures')
    .select('id, title_th, tagline_th, scenes')
    .eq('owner_id', ownerId);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    titleTh: row.title_th,
    taglineTh: row.tagline_th,
    thumbnailUrl: row.scenes?.[0]?.imagePath ?? null,
  }));
}

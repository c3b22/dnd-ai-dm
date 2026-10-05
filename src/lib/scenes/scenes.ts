import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdventure } from '@/lib/adventures/adventures';
import catalog from './catalog.json';

export interface Scene {
  id: string;
  /** 'generic' scenes are shared by every adventure; otherwise the adventure id. */
  scope: string;
  nameTh: string;
}

export const SCENES: Scene[] = catalog.scenes.map(({ id, scope, nameTh }) => ({ id, scope, nameTh }));

const adventureScenes = catalog.adventureScenes as Record<string, string[]>;

export function getScene(id: string | null | undefined): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

/** The scene shown when a campaign starts. */
export function openingSceneId(adventureId: string | null | undefined): string | null {
  return (adventureId && adventureScenes[adventureId]?.[0]) || null;
}

/** Scenes the DM may pick from: this adventure's own plus every generic one. */
export function allowedScenes(adventureId: string | null | undefined): Scene[] {
  return SCENES.filter((s) => s.scope === 'generic' || s.scope === adventureId);
}

// Colour wash laid over every image of an adventure so shared generic scenes match its mood.
const MOOD_TINT: Record<string, string> = {
  'sunken-bell-of-marrowmere': 'rgba(30, 90, 100, 0.35)',
  'the-wolf-king-of-ashenfell': 'rgba(70, 110, 170, 0.30)',
  'the-thousand-doors-market': 'rgba(110, 60, 160, 0.28)',
  'crown-of-the-sunken-king': 'rgba(170, 110, 40, 0.28)',
  'the-clockwork-orphan': 'rgba(150, 120, 40, 0.28)',
  'the-starving-god-of-red-dunes': 'rgba(180, 90, 40, 0.30)',
  'the-mask-collector-of-gallowsreach': 'rgba(90, 20, 30, 0.30)',
  'the-toad-kings-hoard': 'rgba(40, 90, 60, 0.32)',
  'the-three-vaults-of-the-starfall-crown': 'rgba(120, 70, 150, 0.28)',
};

export function moodTint(adventureId: string | null | undefined): string | null {
  return (adventureId && MOOD_TINT[adventureId]) || null;
}

const SCENE_TAG = /\[\[\s*scene\s*:\s*([a-z0-9-]+)\s*\]\]/i;

/** Finds the `[[scene: id]]` tag the DM appends to its narration. */
export function parseSceneTag(text: string): { sceneId: string | null; cleanText: string } {
  const match = SCENE_TAG.exec(text);
  if (!match) return { sceneId: null, cleanText: text };
  return { sceneId: match[1].toLowerCase(), cleanText: text.replace(SCENE_TAG, '').trimEnd() };
}

export function sceneInstruction(
  adventureId: string | null | undefined,
  currentSceneId?: string | null
): string {
  const own = allowedScenes(adventureId).filter((s) => s.scope !== 'generic');
  const generic = allowedScenes(adventureId).filter((s) => s.scope === 'generic');
  const format = (list: Scene[]) => list.map((s) => `${s.id} (${s.nameTh})`).join(', ');
  const current = getScene(currentSceneId);
  return [
    'After your narration, add one final line containing only [[scene: ID]] to say where the party is now.',
    current
      ? `The party is currently at ${current.id} (${current.nameTh}); repeat that ID unless the story has clearly moved them somewhere else.`
      : '',
    `Prefer this adventure's own places: ${format(own)}.`,
    `Otherwise use a general place: ${format(generic)}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function customSceneId(adventureId: string, key: string): string {
  return `${adventureId}-${key}`;
}

async function getCustomScenes(
  supabase: SupabaseClient,
  adventureId: string
): Promise<(Scene & { imageUrl: string | null })[]> {
  const { data } = await supabase.from('custom_adventures').select('scenes').eq('id', adventureId).maybeSingle();
  const scenes = (data?.scenes ?? []) as { key: string; nameTh: string; imagePath: string | null }[];
  return scenes.map((s) => ({ id: customSceneId(adventureId, s.key), scope: adventureId, nameTh: s.nameTh, imageUrl: s.imagePath }));
}

export async function allowedSceneIdsAsync(supabase: SupabaseClient, adventureId: string | null | undefined): Promise<string[]> {
  if (!adventureId || getAdventure(adventureId)) return allowedScenes(adventureId).map((s) => s.id);
  const own = await getCustomScenes(supabase, adventureId);
  const generic = SCENES.filter((s) => s.scope === 'generic').map((s) => s.id);
  return [...own.map((s) => s.id), ...generic];
}

export async function sceneInstructionAsync(
  supabase: SupabaseClient,
  adventureId: string | null | undefined,
  currentSceneId?: string | null
): Promise<string> {
  if (!adventureId || getAdventure(adventureId)) return sceneInstruction(adventureId, currentSceneId);
  const own = await getCustomScenes(supabase, adventureId);
  const generic = SCENES.filter((s) => s.scope === 'generic');
  const format = (list: { id: string; nameTh: string }[]) => list.map((s) => `${s.id} (${s.nameTh})`).join(', ');
  const current = own.find((s) => s.id === currentSceneId) ?? generic.find((s) => s.id === currentSceneId);
  return [
    'After your narration, add one final line containing only [[scene: ID]] to say where the party is now.',
    current ? `The party is currently at ${current.id} (${current.nameTh}); repeat that ID unless the story has clearly moved them somewhere else.` : '',
    `Prefer this adventure's own places: ${format(own)}.`,
    `Otherwise use a general place: ${format(generic)}.`,
  ].filter(Boolean).join(' ');
}

export async function openingSceneIdAsync(supabase: SupabaseClient, adventureId: string | null | undefined): Promise<string | null> {
  if (!adventureId) return null;
  if (getAdventure(adventureId)) return openingSceneId(adventureId);
  const own = await getCustomScenes(supabase, adventureId);
  return own[0]?.id ?? null;
}

export async function getSceneAsync(
  supabase: SupabaseClient,
  adventureId: string | null | undefined,
  sceneId: string | null | undefined
): Promise<(Scene & { imageUrl: string | null }) | undefined> {
  if (!sceneId) return undefined;
  if (!adventureId || getAdventure(adventureId)) {
    const s = getScene(sceneId);
    return s ? { ...s, imageUrl: null } : undefined;
  }
  const own = await getCustomScenes(supabase, adventureId);
  return own.find((s) => s.id === sceneId);
}

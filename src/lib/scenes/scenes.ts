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

export function sceneInstruction(adventureId: string | null | undefined): string {
  const list = allowedScenes(adventureId)
    .map((s) => `${s.id} (${s.nameTh})`)
    .join(', ');
  return [
    'After your narration, add one final line containing only [[scene: ID]] to say where the party is now.',
    `Choose the ID from this list, and keep the previous place if nothing changed: ${list}.`,
  ].join(' ');
}

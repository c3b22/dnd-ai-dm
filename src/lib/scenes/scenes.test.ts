import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ADVENTURES } from '@/lib/adventures/adventures';
import {
  SCENES,
  allowedScenes,
  moodTint,
  openingSceneId,
  parseSceneTag,
  sceneInstruction,
  getScene,
} from './scenes';
import catalog from './catalog.json';
import {
  allowedSceneIdsAsync, sceneInstructionAsync, openingSceneIdAsync, getSceneAsync, customSceneId,
} from './scenes';

describe('parseSceneTag', () => {
  it('extracts the id and removes the tag from the text', () => {
    expect(parseSceneTag('The door creaks open.\n[[scene: Crypt]]')).toEqual({
      sceneId: 'crypt',
      cleanText: 'The door creaks open.',
    });
  });

  it('leaves text without a tag untouched', () => {
    expect(parseSceneTag('Nothing here.')).toEqual({ sceneId: null, cleanText: 'Nothing here.' });
  });
});

describe('scene catalog', () => {
  it('has a unique id per scene and an image file for each one', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(existsSync(path.resolve('public/scenes', `${id}.jpg`)), id).toBe(true);
    }
  });

  it('maps every adventure to real scenes it is allowed to use', () => {
    for (const adventure of ADVENTURES) {
      const list = (catalog.adventureScenes as Record<string, string[]>)[adventure.id];
      expect(list, adventure.id).toHaveLength(4);
      const allowed = new Set(allowedScenes(adventure.id).map((s) => s.id));
      for (const id of list) expect(allowed.has(id), `${adventure.id}/${id}`).toBe(true);
      expect(openingSceneId(adventure.id)).toBe(list[0]);
      expect(moodTint(adventure.id)).toBeTruthy();
    }
  });

  it('lists only generic scenes when there is no adventure', () => {
    expect(allowedScenes(null).every((s) => s.scope === 'generic')).toBe(true);
    expect(sceneInstruction(null)).toContain('[[scene: ID]]');
  });
});

describe('sceneInstruction with a current scene', () => {
  it('tells the DM where the party is and prefers the adventure\'s own places', () => {
    const text = sceneInstruction('sunken-bell-of-marrowmere', 'bell-village');

    expect(text).toContain('currently at bell-village');
    expect(text.indexOf('bell-ferry')).toBeLessThan(text.indexOf('tavern-interior'));
  });
});

function fakeSupabase(scenes: { key: string; nameTh: string; imagePath: string | null }[] | null) {
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: scenes ? { scenes } : null, error: null }) }) }) }));
  return { from } as any;
}

describe('async scene lookups: built-in fast path', () => {
  it('match the sync functions exactly and never touch the database', async () => {
    const supabase = fakeSupabase(null);
    expect(await allowedSceneIdsAsync(supabase, 'sunken-bell-of-marrowmere')).toEqual(
      allowedScenes('sunken-bell-of-marrowmere').map((s) => s.id)
    );
    expect(await sceneInstructionAsync(supabase, 'sunken-bell-of-marrowmere', 'bell-village')).toBe(
      sceneInstruction('sunken-bell-of-marrowmere', 'bell-village')
    );
    expect(await openingSceneIdAsync(supabase, 'sunken-bell-of-marrowmere')).toBe(openingSceneId('sunken-bell-of-marrowmere'));
    expect(await getSceneAsync(supabase, 'sunken-bell-of-marrowmere', 'bell-village')).toEqual({ ...getScene('bell-village'), imageUrl: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('async scene lookups: custom adventure', () => {
  const scenes = [
    { key: 'opening', nameTh: 'เปิดเรื่อง', imagePath: 'https://cdn/a1/opening.jpg' },
    { key: 'act-1', nameTh: 'องก์ 1', imagePath: null },
  ];

  it('builds globally-unique composite ids and resolves image urls', async () => {
    const supabase = fakeSupabase(scenes);
    expect(customSceneId('a1', 'opening')).toBe('a1-opening');
    const ids = await allowedSceneIdsAsync(supabase, 'a1');
    expect(ids).toContain('a1-opening');
    expect(ids).toContain('a1-act-1');
    expect(ids).toEqual(expect.arrayContaining(allowedScenes(null).map((s) => s.id))); // generics too
  });

  it('opening scene id is the first scene', async () => {
    expect(await openingSceneIdAsync(fakeSupabase(scenes), 'a1')).toBe('a1-opening');
  });

  it('resolves one scene with its image url', async () => {
    const scene = await getSceneAsync(fakeSupabase(scenes), 'a1', 'a1-opening');
    expect(scene).toEqual({ id: 'a1-opening', scope: 'a1', nameTh: 'เปิดเรื่อง', imageUrl: 'https://cdn/a1/opening.jpg' });
  });

  it('scene instruction mentions the current place and the adventure\'s own scenes first', async () => {
    const text = await sceneInstructionAsync(fakeSupabase(scenes), 'a1', 'a1-opening');
    expect(text).toContain('currently at a1-opening');
    expect(text.indexOf('a1-act-1')).toBeLessThan(text.indexOf('tavern-interior'));
  });
});

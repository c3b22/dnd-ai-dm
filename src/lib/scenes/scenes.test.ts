import { describe, it, expect } from 'vitest';
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
} from './scenes';
import catalog from './catalog.json';

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

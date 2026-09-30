import { describe, it, expect } from 'vitest';
import { parseCharacterTags } from './tags';

describe('parseCharacterTags', () => {
  it('extracts tags in the order they appear and strips them from the text', () => {
    const text = 'The goblin slashes Prem.\n[[hurt: Prem | medium]]\n[[revive: Suki]]\n[[sanctuary]]';
    expect(parseCharacterTags(text)).toEqual({
      tags: [
        { kind: 'hurt', name: 'Prem', tier: 'medium' },
        { kind: 'revive', name: 'Suki' },
        { kind: 'sanctuary' },
      ],
      cleanText: 'The goblin slashes Prem.',
    });
  });

  it('tolerates case and spacing, and keeps Thai names intact', () => {
    const { tags } = parseCharacterTags('[[ HEAL :  เปรม  |  Light ]]');
    expect(tags).toEqual([{ kind: 'heal', name: 'เปรม', tier: 'light' }]);
  });

  it('removes a tag with an invalid tier from the text without applying it', () => {
    const { tags, cleanText } = parseCharacterTags('Ouch.\n[[hurt: Prem | huge]]');
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Ouch.');
  });

  it('leaves unrelated tags such as the scene tag alone', () => {
    const { tags, cleanText } = parseCharacterTags('Text\n[[scene: crypt]]');
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Text\n[[scene: crypt]]');
  });

  it('returns the text unchanged when there are no tags', () => {
    expect(parseCharacterTags('Just narration.')).toEqual({ tags: [], cleanText: 'Just narration.' });
  });
});

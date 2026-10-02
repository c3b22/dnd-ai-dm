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

  it('never lets an unterminated tag swallow a real tag that follows it on the next line', () => {
    const text = '[[give: Prem | story: an endless title that forgot its closing\n[[hurt: Suki | light]]';
    const { tags } = parseCharacterTags(text);
    expect(tags).toEqual([{ kind: 'hurt', name: 'Suki', tier: 'light' }]);
  });

  it('never lets an unterminated tag swallow a real tag of a different kind that follows it', () => {
    const text = '[[revive: Prem\n[[gold: Suki | small]]';
    const { tags } = parseCharacterTags(text);
    expect(tags).toEqual([{ kind: 'gold', name: 'Suki', tier: 'small' }]);
  });
});

describe('give and take tags', () => {
  it('parses catalog items and story titles, keeping the title case and spaces', () => {
    const { tags, cleanText } = parseCharacterTags(
      'ได้ของ\n[[give: Prem | potion_minor]]\n[[give: Prem | story: Rusty Key]]\n[[take: Suki | Armor_Light]]'
    );
    expect(tags).toEqual([
      { kind: 'give', name: 'Prem', itemId: 'potion_minor', customName: '' },
      { kind: 'give', name: 'Prem', itemId: 'story', customName: 'Rusty Key' },
      { kind: 'take', name: 'Suki', itemId: 'armor_light', customName: '' },
    ]);
    expect(cleanText).toBe('ได้ของ');
  });

  it('hides malformed give/take tags and applies nothing', () => {
    const { tags, cleanText } = parseCharacterTags('ok [[give: Prem]] [[take]] end');
    expect(tags).toEqual([]);
    expect(cleanText).not.toContain('[[');
  });
});

describe('gold, pay and shop tags', () => {
  it('parses gold and pay tiers case-insensitively and strips them', () => {
    const { tags, cleanText } = parseCharacterTags('พบของ\n[[gold: Prem | Medium]]\n[[pay: Suki | small]]');
    expect(tags).toEqual([
      { kind: 'gold', name: 'Prem', tier: 'medium' },
      { kind: 'pay', name: 'Suki', tier: 'small' },
    ]);
    expect(cleanText).toBe('พบของ');
  });

  it('parses shop with a merchant name and a comma-separated id list, and shop_close', () => {
    const { tags } = parseCharacterTags('[[shop: Old Mara | potion_minor, shortsword ,armor_light]] text [[shop_close]]');
    expect(tags).toEqual([
      { kind: 'shop', merchant: 'Old Mara', itemIds: ['potion_minor', 'shortsword', 'armor_light'] },
      { kind: 'shop_close' },
    ]);
  });

  it('hides malformed economy tags and applies none of them', () => {
    const { tags, cleanText } = parseCharacterTags('a [[gold: Prem | huge]] b [[shop: Mara]] c [[shop_close now]] d [[pay: Prem]]');
    expect(tags).toEqual([]);
    expect(cleanText).not.toContain('[[');
  });
});

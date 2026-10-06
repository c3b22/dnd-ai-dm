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

  it('accepts a full heal tier but not a full hurt tier', () => {
    const { tags: healTags } = parseCharacterTags('[[heal: Prem | full]]');
    expect(healTags).toEqual([{ kind: 'heal', name: 'Prem', tier: 'full' }]);

    const { tags: hurtTags, cleanText } = parseCharacterTags('Ouch.\n[[hurt: Prem | full]]');
    expect(hurtTags).toEqual([]);
    expect(cleanText).toBe('Ouch.');
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

  describe('xp and milestone tags', () => {
    it('parses an xp tier and strips the tag', () => {
      expect(parseCharacterTags('Well done.\n[[xp: medium]]')).toEqual({
        tags: [{ kind: 'xp', tier: 'medium' }],
        cleanText: 'Well done.',
      });
    });

    it('parses milestone and accepts any casing', () => {
      expect(parseCharacterTags('Done.\n[[milestone]]').tags).toEqual([{ kind: 'milestone' }]);
      expect(parseCharacterTags('Done.\n[[XP: Small]]').tags).toEqual([{ kind: 'xp', tier: 'small' }]);
    });

    it('hides an invalid tier and never applies it', () => {
      expect(parseCharacterTags('Done.\n[[xp: huge]]')).toEqual({ tags: [], cleanText: 'Done.' });
    });

    it('hides a misspelled tag name (extra letters) and never applies it', () => {
      const result = parseCharacterTags('Done.\n[[milestones]]\n[[xps: small]]\n[[hurts: Prem | light]]');
      expect(result.tags).toEqual([]);
      expect(result.cleanText).toBe('Done.');
    });

    it('keeps reading order alongside other tags', () => {
      const result = parseCharacterTags('Ow.\n[[hurt: Prem | light]]\n[[xp: large]]\n[[milestone]]');
      expect(result.tags).toEqual([
        { kind: 'hurt', name: 'Prem', tier: 'light' },
        { kind: 'xp', tier: 'large' },
        { kind: 'milestone' },
      ]);
    });
  });

  describe('enemy tags', () => {
    it('parses enemy, enemy_hurt, enemy_flee and combat_end in reading order', () => {
      const text = 'หมาป่าโผล่มา\n[[enemy: หมาป่า | normal]]\n[[enemy_hurt: หมาป่า | heavy]]\n[[enemy_flee: หมาป่า]]\n[[combat_end]]';
      expect(parseCharacterTags(text)).toEqual({
        tags: [
          { kind: 'enemy', name: 'หมาป่า', tier: 'normal' },
          { kind: 'enemy_hurt', name: 'หมาป่า', tier: 'heavy' },
          { kind: 'enemy_flee', name: 'หมาป่า' },
          { kind: 'combat_end' },
        ],
        cleanText: 'หมาป่าโผล่มา',
      });
    });

    it('tolerates case and spacing and accepts every enemy tier', () => {
      const { tags } = parseCharacterTags(
        '[[ ENEMY :  Goblin  |  Minion ]][[enemy: Orc | strong]][[enemy: Dragon | BOSS]]',
      );
      expect(tags).toEqual([
        { kind: 'enemy', name: 'Goblin', tier: 'minion' },
        { kind: 'enemy', name: 'Orc', tier: 'strong' },
        { kind: 'enemy', name: 'Dragon', tier: 'boss' },
      ]);
    });

    it('hides malformed enemy tags without applying them', () => {
      const result = parseCharacterTags(
        'Fight.\n[[enemy: Goblin | huge]]\n[[enemy_hurt: Goblin | full]]\n[[enemy_flee]]\n[[combat_ends]]',
      );
      expect(result.tags).toEqual([]);
      expect(result.cleanText).toBe('Fight.');
    });

    it('does not confuse enemy_hurt with hurt or enemy', () => {
      const { tags } = parseCharacterTags('[[hurt: Prem | light]][[enemy_hurt: Orc | medium]]');
      expect(tags).toEqual([
        { kind: 'hurt', name: 'Prem', tier: 'light' },
        { kind: 'enemy_hurt', name: 'Orc', tier: 'medium' },
      ]);
    });
  });

  describe('memory fact tags (npc / quest / clue)', () => {
    it('parses npc, quest and clue tags and strips them from the narration', () => {
      const result = parseCharacterTags(
        'เสียงลม [[npc: ลุงบอบ | เป็นมิตร]] [[quest: ตามหาแหวน | open]] [[clue: ประตูลับอยู่หลังหิ้ง]] จบ',
      );
      expect(result.tags).toEqual([
        { kind: 'npc', key: 'ลุงบอบ', value: 'เป็นมิตร' },
        { kind: 'quest', key: 'ตามหาแหวน', value: 'open' },
        { kind: 'clue', key: null, value: 'ประตูลับอยู่หลังหิ้ง' },
      ]);
      expect(result.cleanText).toBe('เสียงลม    จบ');
    });

    it('tolerates case and spacing, normalizes quest status', () => {
      const { tags } = parseCharacterTags('[[ QUEST :  A  |  DONE ]]');
      expect(tags).toEqual([{ kind: 'quest', key: 'A', value: 'done' }]);
    });

    it('hides malformed fact tags without applying them', () => {
      const result = parseCharacterTags(
        ['Hi.', '[[quest: A | maybe]]', '[[quest: A]]', '[[npc: Bob]]', '[[clue:]]', '[[clues: x]]'].join('\n'),
      );
      expect(result.tags).toEqual([]);
      expect(result.cleanText).toBe('Hi.');
    });

    it('does not swallow a following real tag', () => {
      const { tags } = parseCharacterTags(['[[npc: Bob', '[[clue: real]]'].join('\n'));
      expect(tags).toEqual([{ kind: 'clue', key: null, value: 'real' }]);
    });
  });
});

import type { Tier } from './constants';

export type CharacterTag =
  | { kind: 'hurt' | 'heal'; name: string; tier: Tier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' }
  | { kind: 'give' | 'take'; name: string; itemId: string; customName: string };

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt|heal, 2 name, 3 tier, 4 revive name, 5 sanctuary,
//         6 give|take, 7 name, 8 story title, 9 catalog item id.
const VALID_TAG =
  /\[\[\s*(?:(hurt|heal)\s*:\s*([^|\]]+?)\s*\|\s*(light|medium|heavy)|revive\s*:\s*([^\]]+?)|(sanctuary)|(give|take)\s*:\s*([^|\]]+?)\s*\|\s*(?:story\s*:\s*([^\]]+?)|([a-z_]+)))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part): hidden from players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary|give|take)\b[^\]]*\]\]/gi;

export function parseCharacterTags(text: string): { tags: CharacterTag[]; cleanText: string } {
  const tags: CharacterTag[] = [];
  for (const match of text.matchAll(VALID_TAG)) {
    if (match[1]) {
      tags.push({
        kind: match[1].toLowerCase() as 'hurt' | 'heal',
        name: match[2].trim(),
        tier: match[3].toLowerCase() as Tier,
      });
    } else if (match[4]) {
      tags.push({ kind: 'revive', name: match[4].trim() });
    } else if (match[6]) {
      const story = match[8] !== undefined;
      tags.push({
        kind: match[6].toLowerCase() as 'give' | 'take',
        name: match[7].trim(),
        itemId: story ? 'story' : match[9].toLowerCase(),
        customName: story ? match[8].trim() : '',
      });
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}

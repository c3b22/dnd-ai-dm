import type { Tier } from './constants';

export type CharacterTag =
  | { kind: 'hurt' | 'heal'; name: string; tier: Tier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' };

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt|heal, 2 name, 3 tier, 4 revive name, 5 sanctuary.
const VALID_TAG =
  /\[\[\s*(?:(hurt|heal)\s*:\s*([^|\]]+?)\s*\|\s*(light|medium|heavy)|revive\s*:\s*([^\]]+?)|(sanctuary))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part): hidden from players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary)\b[^\]]*\]\]/gi;

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
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}

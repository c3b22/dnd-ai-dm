import type { Tier } from './constants';
import type { GoldTier } from '@/lib/economy/gold';

export type CharacterTag =
  | { kind: 'hurt' | 'heal'; name: string; tier: Tier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' }
  | { kind: 'give' | 'take'; name: string; itemId: string; customName: string }
  | { kind: 'gold' | 'pay'; name: string; tier: GoldTier }
  | { kind: 'shop'; merchant: string; itemIds: string[] }
  | { kind: 'shop_close' };

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt|heal, 2 name, 3 tier, 4 revive name, 5 sanctuary,
//         6 give|take, 7 name, 8 story title, 9 catalog item id.
// Every open-ended capture excludes ] (so it stops at the tag's own close), and also \n and [
// (so an unterminated or malformed tag can never stretch forward and swallow a real tag that
// follows it on a later line, instead of just leaving itself unstripped in the narration).
const VALID_TAG =
  /\[\[\s*(?:(hurt|heal)\s*:\s*([^|\]\n[]+?)\s*\|\s*(light|medium|heavy)|revive\s*:\s*([^\]\n[]+?)|(sanctuary)|(give|take)\s*:\s*([^|\]\n[]+?)\s*\|\s*(?:story\s*:\s*([^\]\n[]+?)|([a-z_]+))|(gold|pay)\s*:\s*([^|\]\n[]+?)\s*\|\s*(small|medium|large)|shop\s*:\s*([^|\]\n[]+?)\s*\|\s*([^\]\n[]+?)|(shop_close))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part): hidden from players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary|give|take|gold|pay|shop_close|shop)\b[^\]\n[]*\]\]/gi;

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
    } else if (match[10]) {
      tags.push({
        kind: match[10].toLowerCase() as 'gold' | 'pay',
        name: match[11].trim(),
        tier: match[12].toLowerCase() as GoldTier,
      });
    } else if (match[13]) {
      tags.push({
        kind: 'shop',
        merchant: match[13].trim(),
        itemIds: match[14].split(',').map((id) => id.trim().toLowerCase()).filter(Boolean),
      });
    } else if (match[15]) {
      tags.push({ kind: 'shop_close' });
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}

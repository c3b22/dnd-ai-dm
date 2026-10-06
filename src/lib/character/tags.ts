import type { HealTier, Tier, XpTier } from './constants';
import type { GoldTier } from '@/lib/economy/gold';

export type CharacterTag =
  | { kind: 'hurt'; name: string; tier: Tier }
  | { kind: 'heal'; name: string; tier: HealTier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' }
  | { kind: 'give' | 'take'; name: string; itemId: string; customName: string }
  | { kind: 'gold' | 'pay'; name: string; tier: GoldTier }
  | { kind: 'shop'; merchant: string; itemIds: string[] }
  | { kind: 'shop_close' }
  | { kind: 'xp'; tier: XpTier }
  | { kind: 'milestone' }
  | { kind: 'enemy'; name: string; tier: EnemyTier }
  | { kind: 'enemy_hurt'; name: string; tier: EnemyHurtTier }
  | { kind: 'enemy_flee'; name: string }
  | { kind: 'combat_end' }
  | { kind: 'npc'; key: string; value: string }
  | { kind: 'quest'; key: string; value: QuestStatus }
  | { kind: 'clue'; key: null; value: string };

export type EnemyTier = 'minion' | 'normal' | 'strong' | 'boss';
export type QuestStatus = 'open' | 'done';
export type EnemyHurtTier = 'light' | 'medium' | 'heavy';

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt name, 2 hurt tier, 3 heal name, 4 heal tier (heal alone also allows 'full'),
//         5 revive name, 6 sanctuary, 7 give|take, 8 name, 9 story title, 10 catalog item id,
//         11 gold|pay, 12 name, 13 tier, 14 shop merchant, 15 shop item ids, 16 shop_close,
//         17 xp tier, 18 milestone, 19 enemy name, 20 enemy tier, 21 enemy_hurt name,
//         22 enemy_hurt tier, 23 enemy_flee name, 24 combat_end, 25 npc name, 26 npc attitude,
//         27 quest name, 28 quest status (open|done), 29 clue text.
// Every open-ended capture excludes ] (so it stops at the tag's own close), and also \n and [
// (so an unterminated or malformed tag can never stretch forward and swallow a real tag that
// follows it on a later line, instead of just leaving itself unstripped in the narration).
const VALID_TAG =
  /\[\[\s*(?:hurt\s*:\s*([^|\]\n[]+?)\s*\|\s*(light|medium|heavy)|heal\s*:\s*([^|\]\n[]+?)\s*\|\s*(light|medium|heavy|full)|revive\s*:\s*([^\]\n[]+?)|(sanctuary)|(give|take)\s*:\s*([^|\]\n[]+?)\s*\|\s*(?:story\s*:\s*([^\]\n[]+?)|([a-z_]+))|(gold|pay)\s*:\s*([^|\]\n[]+?)\s*\|\s*(small|medium|large)|shop\s*:\s*([^|\]\n[]+?)\s*\|\s*([^\]\n[]+?)|(shop_close)|xp\s*:\s*(small|medium|large)|(milestone)|enemy\s*:\s*([^|\]\n[]+?)\s*\|\s*(minion|normal|strong|boss)|enemy_hurt\s*:\s*([^|\]\n[]+?)\s*\|\s*(light|medium|heavy)|enemy_flee\s*:\s*([^\]\n[]+?)|(combat_end)|npc\s*:\s*([^|\]\n[]+?)\s*\|\s*([^\]\n[]+?)|quest\s*:\s*([^|\]\n[]+?)\s*\|\s*(open|done)|clue\s*:\s*([^\]\n[]+?))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part, misspelled name like [[milestones]]): hidden from
// players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary|give|take|gold|pay|shop_close|shop|xp|milestone|enemy_hurt|enemy_flee|enemy|combat_end|npc|quest|clue)[^\]\n[]*\]\]/gi;

export function parseCharacterTags(text: string): { tags: CharacterTag[]; cleanText: string } {
  const tags: CharacterTag[] = [];
  for (const match of text.matchAll(VALID_TAG)) {
    if (match[1]) {
      tags.push({ kind: 'hurt', name: match[1].trim(), tier: match[2].toLowerCase() as Tier });
    } else if (match[3]) {
      tags.push({ kind: 'heal', name: match[3].trim(), tier: match[4].toLowerCase() as HealTier });
    } else if (match[5]) {
      tags.push({ kind: 'revive', name: match[5].trim() });
    } else if (match[7]) {
      const story = match[9] !== undefined;
      tags.push({
        kind: match[7].toLowerCase() as 'give' | 'take',
        name: match[8].trim(),
        itemId: story ? 'story' : match[10].toLowerCase(),
        customName: story ? match[9].trim() : '',
      });
    } else if (match[11]) {
      tags.push({
        kind: match[11].toLowerCase() as 'gold' | 'pay',
        name: match[12].trim(),
        tier: match[13].toLowerCase() as GoldTier,
      });
    } else if (match[14]) {
      tags.push({
        kind: 'shop',
        merchant: match[14].trim(),
        itemIds: match[15].split(',').map((id) => id.trim().toLowerCase()).filter(Boolean),
      });
    } else if (match[16]) {
      tags.push({ kind: 'shop_close' });
    } else if (match[17]) {
      tags.push({ kind: 'xp', tier: match[17].toLowerCase() as XpTier });
    } else if (match[18]) {
      tags.push({ kind: 'milestone' });
    } else if (match[19]) {
      tags.push({ kind: 'enemy', name: match[19].trim(), tier: match[20].toLowerCase() as EnemyTier });
    } else if (match[21]) {
      tags.push({ kind: 'enemy_hurt', name: match[21].trim(), tier: match[22].toLowerCase() as EnemyHurtTier });
    } else if (match[23]) {
      tags.push({ kind: 'enemy_flee', name: match[23].trim() });
    } else if (match[24]) {
      tags.push({ kind: 'combat_end' });
    } else if (match[25]) {
      tags.push({ kind: 'npc', key: match[25].trim(), value: match[26].trim() });
    } else if (match[27]) {
      tags.push({ kind: 'quest', key: match[27].trim(), value: match[28].toLowerCase() as QuestStatus });
    } else if (match[29]) {
      tags.push({ kind: 'clue', key: null, value: match[29].trim() });
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}

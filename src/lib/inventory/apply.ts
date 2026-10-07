import { rollDice } from '@/lib/character/dice';
import { findByDisplayName } from '@/lib/character/names';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { damageEnemy, findActiveEnemy, type Encounter } from '@/lib/combat/encounter';
import { giveItem, takeItem, useConsumable, useScroll } from './rules';
import { MAGIC_RARITY_TH } from './magicItems';
import { pickMagicItem } from './magicGrant';
import type { Inventories } from './types';

/** F5f: what this room was already given. `given: null` = the table is unavailable, so [[magic]] tags are ignored. */
export interface MagicGrantState {
  given: readonly string[] | null;
  rand?: () => number;
}

export function applyInventoryTags(
  characters: Pick<Character, 'id' | 'displayName'>[],
  inventories: Inventories,
  tags: CharacterTag[],
  magic: MagicGrantState = { given: null }
): { inventories: Inventories; changes: string[]; changedPlayerIds: string[]; magicGiven: string[] } {
  const next: Inventories = { ...inventories };
  const changes: string[] = [];
  const changed = new Set<string>();
  const given = new Set(magic.given ?? []);
  const magicGiven: string[] = [];

  for (const tag of tags) {
    if (tag.kind !== 'give' && tag.kind !== 'take' && tag.kind !== 'magic') continue;
    const target = findByDisplayName(characters, tag.name);
    if (!target) continue;
    const items = next[target.id] ?? [];

    if (tag.kind === 'magic') {
      if (magic.given === null) continue;
      const pick = pickMagicItem(tag.rarity, tag.itemType, given, magic.rand);
      if (!pick.item) {
        if (pick.reason === 'legendary_limit') changes.push(`${target.displayName} ไม่ได้รับไอเท็มระดับตำนาน: ห้องนี้ได้รับไปแล้ว 1 ชิ้น`);
        continue;
      }
      const result = giveItem(items, pick.item.id);
      if (result.result === 'unknown') continue;
      if (result.result === 'full') {
        changes.push(`${target.displayName} แบกไม่ไหว: ไม่ได้รับ ${result.label}`);
        continue;
      }
      next[target.id] = result.items;
      changed.add(target.id);
      given.add(pick.item.id);
      magicGiven.push(pick.item.id);
      changes.push(`${target.displayName} ได้รับไอเท็มวิเศษ ${result.label} (${MAGIC_RARITY_TH[pick.item.rarity]})`);
      continue;
    }

    if (tag.kind === 'give') {
      const result = giveItem(items, tag.itemId, tag.customName);
      if (result.result === 'unknown') continue;
      if (result.result === 'full') {
        changes.push(`${target.displayName} แบกไม่ไหว: ไม่ได้รับ ${result.label}`);
        continue;
      }
      next[target.id] = result.items;
      changed.add(target.id);
      changes.push(`${target.displayName} ได้รับ ${result.label}`);
    } else {
      const result = takeItem(items, tag.itemId, tag.customName);
      if (!result.taken) continue;
      next[target.id] = result.items;
      changed.add(target.id);
      changes.push(`${target.displayName} เสียไป ${result.label}`);
    }
  }
  return { inventories: next, changes, changedPlayerIds: [...changed], magicGiven };
}

export interface PotionUse {
  playerId?: string;
  useItemId?: string | null;
}

/** Applies this round's "drink a potion" actions before narration so the DM sees the real HP. */
export function applyPotionActions(
  characters: Character[],
  inventories: Inventories,
  uses: PotionUse[],
  rollDie: (sides: number) => number
): {
  characters: Character[];
  inventories: Inventories;
  changes: string[];
  notes: Record<string, string>;
  changedPlayerIds: string[];
} {
  const nextCharacters = characters.map((c) => ({ ...c }));
  const nextInventories: Inventories = { ...inventories };
  const changes: string[] = [];
  const notes: Record<string, string> = {};
  const changed = new Set<string>();

  for (const use of uses) {
    if (!use.playerId || !use.useItemId) continue;
    const character = nextCharacters.find((c) => c.id === use.playerId);
    if (!character || character.status !== 'active') continue;
    const used = useConsumable(nextInventories[character.id] ?? [], use.useItemId);
    if (!used) continue;
    const gained = Math.min(character.maxHp - character.hp, rollDice(used.heal, rollDie));
    character.hp += gained;
    nextInventories[character.id] = used.items;
    changed.add(character.id);
    changes.push(`${character.displayName} ดื่ม ${used.label} (+${gained} HP)`);
    notes[character.id] = `drank ${used.label} and recovered ${gained} HP`;
  }
  return { characters: nextCharacters, inventories: nextInventories, changes, notes, changedPlayerIds: [...changed] };
}

export interface ScrollUse {
  playerId?: string;
  useItemId?: string | null;
  /** Name of the enemy the scroll is aimed at. */
  itemTarget?: string | null;
}

/**
 * F5e: a scroll removes pips from the targeted enemy without a hit roll (a full-pip boss keeps at least
 * 1, via damageEnemy). With no fight, no valid live target, or no such scroll in the pack, nothing is used.
 */
export function applyScrollActions(
  characters: Pick<Character, 'id' | 'displayName' | 'status'>[],
  inventories: Inventories,
  encounter: Encounter | null,
  uses: ScrollUse[]
): {
  encounter: Encounter | null;
  inventories: Inventories;
  changes: string[];
  notes: Record<string, string>;
  changedPlayerIds: string[];
} {
  let enemies = encounter ? encounter.enemies.map((e) => ({ ...e })) : null;
  const nextInventories: Inventories = { ...inventories };
  const changes: string[] = [];
  const notes: Record<string, string> = {};
  const changed = new Set<string>();

  for (const use of uses) {
    if (!enemies || !use.playerId || !use.useItemId || !use.itemTarget) continue;
    const character = characters.find((c) => c.id === use.playerId);
    if (!character || character.status !== 'active') continue;
    const target = findActiveEnemy(enemies, use.itemTarget);
    if (!target) continue;
    const used = useScroll(nextInventories[character.id] ?? [], use.useItemId);
    if (!used) continue;
    const before = target.pip;
    damageEnemy(target, used.pipReduction);
    nextInventories[character.id] = used.items;
    changed.add(character.id);
    changes.push(`${character.displayName} ใช้ ${used.label} ใส่ ${target.name} (-${before - target.pip} pip)`);
    notes[character.id] = `read ${used.label} at ${target.name}: it lost ${before - target.pip} pip${target.pip === 0 ? ' and is downed' : ''}`;
  }
  if (changed.size === 0) return { encounter, inventories, changes, notes, changedPlayerIds: [] };
  return { encounter: { enemies: enemies! }, inventories: nextInventories, changes, notes, changedPlayerIds: [...changed] };
}

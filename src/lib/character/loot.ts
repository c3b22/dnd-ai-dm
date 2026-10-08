/**
 * H3c looting (pure). The corpses a permadeath room holds (H3a) are listed to the AI, which hands them out with
 * `[[loot: CorpseName | PlayerName]]`. The server moves the pack and gold to that player, using the same weight and
 * slot rules as `[[give]]` (`giveItem` with that player's own capacity); whatever does not fit stays on the corpse.
 */
import { giveItem, itemLabel } from '@/lib/inventory/rules';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';
import type { CharacterTag } from './tags';
import type { Character } from './types';

export interface LootableCorpse {
  id: string;
  name: string;
  items: InventoryItem[];
  gold: number;
}

/** What to write back for a corpse the round touched; `empty` means the row can be deleted. */
export interface CorpseUpdate {
  id: string;
  items: InventoryItem[];
  gold: number;
  empty: boolean;
}

export function corpsePrompt(corpses: LootableCorpse[]): string[] {
  if (corpses.length === 0) return [];
  return [
    'Corpses in this room (permanently dead characters; their things lie with them until a player takes them):',
    ...corpses.map((c) => {
      const list = c.items.length
        ? c.items.map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', ')
        : 'nothing';
      return `- ${c.name}: ${list}; gold ${c.gold}`;
    }),
    'When a player searches a corpse and takes its things, end your narration with this tag on its own line; the server moves what the player can carry (the rest stays on the corpse):',
    '  [[loot: CorpseName | PlayerName]]',
    'Use it only for a corpse listed above and a living player. Do not invent items or gold from a corpse yourself.',
  ];
}

export function applyLootTags(
  characters: Pick<Character, 'id' | 'displayName' | 'status'>[],
  inventories: Inventories,
  corpses: LootableCorpse[],
  tags: CharacterTag[]
): { inventories: Inventories; goldDeltas: Record<string, number>; corpseUpdates: CorpseUpdate[]; changes: string[]; changedPlayerIds: string[] } {
  const next: Inventories = { ...inventories };
  const goldDeltas: Record<string, number> = {};
  const changes: string[] = [];
  const changed = new Set<string>();
  const state = new Map(corpses.map((c) => [c.id, { items: c.items.map((i) => ({ ...i })), gold: c.gold }]));
  const touched = new Set<string>();

  for (const tag of tags) {
    if (tag.kind !== 'loot') continue;
    const wantedCorpse = tag.corpse.trim().toLowerCase();
    const matchingCorpses = corpses.filter((c) => c.name.trim().toLowerCase() === wantedCorpse);
    const wantedPlayer = tag.name.trim().toLowerCase();
    const matchingPlayers = characters.filter((c) => c.displayName.trim().toLowerCase() === wantedPlayer);
    // Unknown or ambiguous names do nothing, so a bad tag can never hit the wrong corpse or player.
    if (matchingCorpses.length !== 1 || matchingPlayers.length !== 1) continue;
    const target = matchingPlayers[0];
    if (target.status === 'dead') continue;
    const source = matchingCorpses[0];
    const left = state.get(source.id)!;
    if (left.items.length === 0 && left.gold === 0) continue;

    let pack = next[target.id] ?? [];
    const remaining: InventoryItem[] = [];
    const moved: string[] = [];
    for (const it of left.items) {
      let quantity = it.quantity;
      let label = '';
      let taken = 0;
      while (quantity > 0) {
        const result = giveItem(pack, it.itemId, it.customName);
        if (result.result !== 'added') break;
        pack = result.items;
        label = result.label;
        taken += 1;
        quantity -= 1;
      }
      if (taken > 0) moved.push(`${label}${taken > 1 ? ` x${taken}` : ''}`);
      if (quantity > 0) remaining.push({ ...it, quantity, equipped: false });
    }
    const gold = left.gold;
    if (moved.length === 0 && gold === 0) continue;

    if (moved.length > 0) {
      next[target.id] = pack;
      changed.add(target.id);
    }
    if (gold > 0) goldDeltas[target.id] = (goldDeltas[target.id] ?? 0) + gold;
    state.set(source.id, { items: remaining, gold: 0 });
    touched.add(source.id);
    const parts = [...moved, ...(gold > 0 ? [`ทอง ${gold}`] : [])];
    changes.push(`${target.displayName} เก็บของจากศพ ${source.name}: ${parts.join(', ')}${remaining.length > 0 ? ' (แบกไม่ไหว เหลือบางส่วนไว้กับศพ)' : ''}`);
  }

  const corpseUpdates: CorpseUpdate[] = [...touched].map((id) => {
    const s = state.get(id)!;
    return { id, items: s.items, gold: s.gold, empty: s.items.length === 0 && s.gold === 0 };
  });
  return { inventories: next, goldDeltas, corpseUpdates, changes, changedPlayerIds: [...changed] };
}

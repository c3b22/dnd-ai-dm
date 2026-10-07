/**
 * H3a permanent death (pure). In a room with `permadeath` on, a character whose 3rd death save failed
 * (and who had no revive charm, see `onDeathSavesFailed`) becomes `dead`: their pack and gold move into
 * a corpse record that the table can loot later (H3c). Rooms without `permadeath` never call this.
 */
import type { Inventories, InventoryItem } from '@/lib/inventory/types';
import type { Character } from './types';

export interface Corpse {
  /** The player row that died; used to take the gold and pack off them, not stored on the corpse. */
  playerId: string;
  name: string;
  items: InventoryItem[];
  gold: number;
}

export function applyPermadeath(
  characters: Character[],
  inventories: Inventories,
  died: string[]
): { characters: Character[]; inventories: Inventories; corpses: Corpse[]; changes: string[]; changedPlayerIds: string[] } {
  const ids = new Set(died);
  const corpses: Corpse[] = [];
  const changes: string[] = [];
  const changedPlayerIds: string[] = [];
  const nextInventories: Inventories = { ...inventories };
  const next = characters.map((c) => {
    if (!ids.has(c.id)) return c;
    const items = inventories[c.id] ?? [];
    corpses.push({ playerId: c.id, name: c.displayName, items, gold: c.gold ?? 0 });
    if (items.length > 0) {
      nextInventories[c.id] = [];
      changedPlayerIds.push(c.id);
    }
    changes.push(`${c.displayName} ตายถาวร ไอเท็มและทองถูกทิ้งไว้กับศพ`);
    return { ...c, status: 'dead' as const, hp: 0, gold: 0 };
  });
  return { characters: next, inventories: nextInventories, corpses, changes, changedPlayerIds };
}

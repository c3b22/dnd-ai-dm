import type { Character } from '@/lib/character/types';
import { CARRY_CAPACITY, CATALOG } from './catalog';
import { MAGIC_ITEMS } from './magicItems';
import { carryCapacityOf, itemLabel, weightOf } from './rules';
import type { Inventories } from './types';

const MAGIC_IDS = new Set(MAGIC_ITEMS.map((i) => i.id));
const isMagicItemId = (id: string) => MAGIC_IDS.has(id);

export function inventoryPrompt(characters: Character[], inventories: Inventories): string[] {
  if (characters.length === 0) return [];
  // Magic items are not listed: the server picks them (F5f); the catalog here is the ordinary gear only.
  const catalog = Object.entries(CATALOG)
    .filter(([id]) => !isMagicItemId(id))
    .map(([id, entry]) => `${id} (${entry.nameTh}, weight ${entry.weight})`)
    .join(', ');

  return [
    `Inventories (managed by the game server; each player carries at most ${CARRY_CAPACITY} weight unless a worn item says more; the per-player limit is shown below):`,
    ...characters.map((c) => {
      const items = inventories[c.id] ?? [];
      const list = items.length
        ? items
            .map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.equipped ? ' (equipped)' : ''}`)
            .join(', ')
        : 'nothing';
      return `- ${c.displayName}: ${list}; weight ${weightOf(items)}/${carryCapacityOf(items)}`;
    }),
    '',
    'Hand items out or take them away with tags, each on its own line after your narration. The server checks them:',
    '  [[give: PlayerName | item_id]] - the player gains a catalog item',
    '  [[give: PlayerName | story: Title]] - the player gains a story object with no stats (a key, a letter)',
    '  [[take: PlayerName | item_id]] - the player loses one (same forms as give)',
    `Catalog (ordinary items): ${catalog}.`,
    'Magic items are never chosen by you. Use this tag and the server draws one the room has not received yet:',
    '  [[magic: PlayerName | uncommon]]  or  [[magic: PlayerName | rare | weapon]]  - rarity is uncommon, rare or legendary; the optional third part is weapon, armor, accessory, potion or scroll',
    'Rarity rules: uncommon only for a treasure chest or a mid-story quest reward; rare only for a boss or a major quest; legendary only when a whole story arc ends (the server allows one per campaign). Use it very rarely.',
    'After the server decides, a system line in the history says which item the player received (or that the pack was full). Narrate the player receiving that item by name in the next narration; do not invent the item yourself or name one before the server does.',
    'Give items sparingly, and prefer story objects unless a weapon, armor or potion is a real reward. A player whose pack is full cannot receive more; narrate that instead of inventing a way.',
  ];
}

import type { Character } from '@/lib/character/types';
import { CARRY_CAPACITY, CATALOG } from './catalog';
import { itemLabel, weightOf } from './rules';
import type { Inventories } from './types';

export function inventoryPrompt(characters: Character[], inventories: Inventories): string[] {
  if (characters.length === 0) return [];
  const catalog = Object.entries(CATALOG)
    .map(([id, entry]) => `${id} (${entry.nameTh}, weight ${entry.weight})`)
    .join(', ');

  return [
    `Inventories (managed by the game server; each player carries at most ${CARRY_CAPACITY} weight):`,
    ...characters.map((c) => {
      const items = inventories[c.id] ?? [];
      const list = items.length
        ? items
            .map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.equipped ? ' (equipped)' : ''}`)
            .join(', ')
        : 'nothing';
      return `- ${c.displayName}: ${list}; weight ${weightOf(items)}/${CARRY_CAPACITY}`;
    }),
    '',
    'Hand items out or take them away with tags, each on its own line after your narration. The server checks them:',
    '  [[give: PlayerName | item_id]] - the player gains a catalog item',
    '  [[give: PlayerName | story: Title]] - the player gains a story object with no stats (a key, a letter)',
    '  [[take: PlayerName | item_id]] - the player loses one (same forms as give)',
    `Catalog: ${catalog}.`,
    'Give items sparingly, and prefer story objects unless a weapon, armor or potion is a real reward. A player whose pack is full cannot receive more; narrate that instead of inventing a way.',
  ];
}

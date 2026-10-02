import type { Character } from '@/lib/character/types';
import type { ShopState } from './apply';

export function economyPrompt(characters: Character[], shop: ShopState | null): string[] {
  if (characters.length === 0) return [];
  return [
    'Gold (managed by the game server; never state or invent gold amounts yourself):',
    ...characters.map((c) => `- ${c.displayName}: ${c.gold ?? 0} gold`),
    '',
    'Announce money events with tags, each on its own line after your narration. The server rolls the amounts:',
    '  [[gold: PlayerName | small]] - the player was paid or found money (small, medium or large by how valuable)',
    '  [[pay: PlayerName | small]] - the story takes money from the player (a bribe, toll or fee)',
    '  [[shop: Merchant Name | item_id, item_id]] - a merchant opens a shop selling those catalog items; players then buy and sell in the app at fixed server prices',
    '  [[shop_close]] - the merchant is gone or closes up',
    shop
      ? `A shop is open right now: ${shop.name}, selling ${shop.itemIds.join(', ')}.`
      : 'No shop is open right now.',
    'Do not narrate prices, totals or completed purchases, and do not award gold without a story reason (small for a minor find, large only for a major reward). Shopping happens in the app, so just describe the merchant and their wares in general terms.',
  ];
}

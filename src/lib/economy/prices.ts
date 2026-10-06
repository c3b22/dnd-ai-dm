import { MAGIC_ITEMS } from '@/lib/inventory/magicItems';

const BASE_PRICES = {
  potion_minor: 10,
  potion_major: 25,
  staff: 20,
  dagger: 20,
  shortsword: 30,
  shortbow: 30,
  armor_light: 25,
  armor_medium: 50,
  armor_heavy: 90,
} as const;

/** Every magic item that lands in CATALOG (weapon / armor / consumable / accessory) is priced from magicItems.ts (F5c). */
const MAGIC_PRICES: Record<string, number> = Object.fromEntries(
  MAGIC_ITEMS.filter((i) => ['weapon', 'armor', 'consumable', 'accessory'].includes(i.mechanic.kind)).map((i) => [i.id, i.price])
);

export const PRICES: Readonly<Record<string, number>> & typeof BASE_PRICES = { ...MAGIC_PRICES, ...BASE_PRICES };

function base(itemId: string): number | null {
  return Object.prototype.hasOwnProperty.call(PRICES, itemId) ? PRICES[itemId] : null;
}

export const buyPrice = (itemId: string): number | null => base(itemId);

export function sellPrice(itemId: string): number | null {
  const price = base(itemId);
  return price === null ? null : Math.floor(price / 2);
}

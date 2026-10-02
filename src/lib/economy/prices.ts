import { CATALOG } from '@/lib/inventory/catalog';

export const PRICES = {
  potion_minor: 10,
  potion_major: 25,
  staff: 20,
  shortsword: 30,
  shortbow: 30,
  armor_light: 25,
  armor_medium: 50,
  armor_heavy: 90,
} as const satisfies Record<keyof typeof CATALOG, number>;

function base(itemId: string): number | null {
  return Object.prototype.hasOwnProperty.call(PRICES, itemId) ? PRICES[itemId as keyof typeof PRICES] : null;
}

export const buyPrice = (itemId: string): number | null => base(itemId);

export function sellPrice(itemId: string): number | null {
  const price = base(itemId);
  return price === null ? null : Math.floor(price / 2);
}

import { describe, it, expect } from 'vitest';
import { CATALOG } from '@/lib/inventory/catalog';
import { PRICES, buyPrice, sellPrice } from './prices';

describe('prices', () => {
  it('buys at the base price and sells back at half, rounded down', () => {
    expect(buyPrice('shortsword')).toBe(30);
    expect(sellPrice('shortsword')).toBe(15);
    expect(sellPrice('potion_minor')).toBe(5);
    expect(sellPrice('armor_light')).toBe(12);
  });

  it('has no price for story items, unknown ids, or inherited object keys', () => {
    expect(buyPrice('story')).toBeNull();
    expect(sellPrice('story')).toBeNull();
    expect(buyPrice('lightsaber')).toBeNull();
    expect(buyPrice('toString')).toBeNull();
  });

  it('prices every catalog item', () => {
    for (const id of Object.keys(CATALOG)) expect(PRICES[id as keyof typeof PRICES]).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { applyEconomyTags } from './apply';
import { buyPrice } from './prices';
import { DEFAULT_SHOP_ITEMS, withFallbackShop } from './shopFallback';

const base = {
  tags: [] as Parameters<typeof withFallbackShop>[0]['tags'],
  currentShop: null,
  currentEncounter: null,
  actionTexts: ['ไปที่ร้านค้า'],
  dmText: 'ซูกิสามารถเลือกซื้ออาหารแห้งและอุปกรณ์สำรวจใส่ย่ามได้',
};

describe('withFallbackShop', () => {
  it('default items are all priced', () => {
    for (const id of DEFAULT_SHOP_ITEMS) expect(buyPrice(id)).not.toBeNull();
  });

  it('(ก) adds a synthetic shop tag when all conditions hold, and it opens via the normal path', () => {
    const tags = withFallbackShop(base);
    expect(tags).toEqual([{ kind: 'shop', merchant: 'ร้านค้า', itemIds: DEFAULT_SHOP_ITEMS }]);
    const economy = applyEconomyTags([], tags, () => 1);
    expect(economy.shop).toEqual({ action: 'open', shop: { name: 'ร้านค้า', itemIds: DEFAULT_SHOP_ITEMS } });
  });

  it('opens on the DM telling of a purchase alone, or on the action alone', () => {
    expect(withFallbackShop({ ...base, actionTexts: ['เดินเล่น'] })).toHaveLength(1);
    expect(withFallbackShop({ ...base, dmText: 'เจ้าของร้านยิ้มรับ' })).toHaveLength(1);
  });

  it('(ข) does not open when a shop tag is already present', () => {
    const tags = [{ kind: 'shop' as const, merchant: 'มารา', itemIds: ['staff'] }];
    expect(withFallbackShop({ ...base, tags })).toBe(tags);
  });

  it('does not open when a shop_close tag is present', () => {
    const tags = [{ kind: 'shop_close' as const }];
    expect(withFallbackShop({ ...base, tags })).toBe(tags);
  });

  it('(ค) does not open when the DM refuses', () => {
    expect(withFallbackShop({ ...base, dmText: 'เจ้าของร้านปฏิเสธและปิดประตูใส่หน้า' })).toEqual([]);
    expect(withFallbackShop({ ...base, dmText: 'พ่อค้าไม่ยอมขายให้' })).toEqual([]);
  });

  it('(ง) does not open during a fight', () => {
    const currentEncounter = { enemies: [] } as never;
    expect(withFallbackShop({ ...base, currentEncounter })).toEqual([]);
  });

  it('(จ) does not open when a shop is already open', () => {
    expect(withFallbackShop({ ...base, currentShop: { name: 'x', itemIds: ['staff'] } })).toEqual([]);
  });

  it('(ฉ) does not open when neither the action nor the DM mention trading', () => {
    expect(withFallbackShop({ ...base, actionTexts: ['สำรวจถ้ำ'], dmText: 'ถ้ำมืดและเงียบ' })).toEqual([]);
  });
});
